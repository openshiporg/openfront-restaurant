import type { Context } from ".keystone/types";
import { reserveGiftRefundValue } from "../utils/giftRefundReserve";
import { permissions } from "../access";
import { finalizeRefundWithClient } from "../utils/refundLedger";
import { refundPayment as refundProviderPayment } from "../utils/paymentProviderAdapter";
import { consumeManagerApproval } from "../utils/managerApproval";
import { getOrCreateIdempotencyAttempt, updateIdempotencyAttempt } from "../utils/idempotency";

function cents(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

export default async function refundPayment(
  _root: unknown,
  args: {
    paymentId: string;
    amount?: number | null;
    reason: string;
    idempotencyKey: string;
    managerApproval?: boolean | null;
    managerApprovalId?: string | null;
  },
  context: Context
) {
  if (!permissions.canManagePayments({ session: context.session })) {
    return { success: false, refundId: null, status: null, error: "Not authorized to approve refunds" };
  }
  try {
    if (!args.managerApprovalId) throw new Error("Independent manager approval is required");
    if (!args.reason?.trim()) throw new Error("Refund reason is required");
    if (!args.idempotencyKey?.trim()) throw new Error("Idempotency key is required");
    const prisma = context.prisma as any;
    const priorRefund = await prisma.refund.findUnique({ where: { idempotencyKey: args.idempotencyKey } });
    if (priorRefund) {
      const requestedAmount = args.amount == null ? null : cents(args.amount);
      if (
        priorRefund.paymentId !== args.paymentId ||
        priorRefund.reason !== args.reason.trim() ||
        (requestedAmount !== null && cents(priorRefund.amount) !== requestedAmount)
      ) {
        throw new Error("Idempotency key was already used with a different refund request");
      }
    }
    const { attempt } = await getOrCreateIdempotencyAttempt(prisma, {
      key: `refund:${args.idempotencyKey.trim()}`,
      requestPath: "refundPayment",
      requestParams: {
        paymentId: args.paymentId,
        amount: args.amount ?? null,
        reason: args.reason.trim(),
        managerApprovalId: args.managerApprovalId,
      },
    });
    const reservation = await prisma.$transaction(async (tx: any) => {
      const existing = await tx.refund.findUnique({ where: { idempotencyKey: args.idempotencyKey } });
      if (existing) {
        const requestedAmount = args.amount == null ? null : cents(args.amount);
        if (
          existing.paymentId !== args.paymentId ||
          existing.reason !== args.reason.trim() ||
          (requestedAmount !== null && cents(existing.amount) !== requestedAmount)
        ) {
          throw new Error("Idempotency key was already used with a different refund request");
        }
        return { refund: existing, replay: true };
      }
      const payment = await tx.payment.findUnique({ where: { id: args.paymentId } });
      if (!payment || !["succeeded", "partially_refunded"].includes(payment.status)) {
        throw new Error("Only a successful payment can be refunded");
      }
      const pendingRefunds = await tx.refund.findMany({
        where: { paymentId: payment.id, status: { in: ["processing", "succeeded", "unknown"] } },
      });
      const reserved = pendingRefunds.reduce((sum: number, refund: any) => sum + cents(refund.amount), 0);
      const available = cents(payment.amount) - reserved;
      const amount = args.amount == null ? available : cents(args.amount);
      if (amount <= 0 || amount > available) throw new Error("Refund amount exceeds the unrefunded payment balance");
      const refund = await tx.refund.create({
        data: {
          idempotencyKey: args.idempotencyKey,
          amount,
          currencyCode: payment.currencyCode || "USD",
          status: "processing",
          reason: args.reason.trim(),
          paymentId: payment.id,
          orderId: payment.orderId,
          requestedById: context.session?.itemId || null,
          approvedById: null,
        },
      });
      const approval = await consumeManagerApproval(tx, {
        approvalId: args.managerApprovalId,
        actorId: context.session?.itemId,
        actionType: "refund_payment",
        targetId: args.paymentId,
        reason: args.reason,
        amount: args.amount ?? null,
        entityType: "Refund",
        entityId: refund.id,
      });
      const approvedRefund = await tx.refund.update({
        where: { id: refund.id },
        data: { approvedById: approval.approvedById },
      });
      await reserveGiftRefundValue(tx, payment, approvedRefund);
      return { refund: approvedRefund, payment, replay: false };
    }, { isolationLevel: "Serializable" });

    if (reservation.replay && ["succeeded", "failed"].includes(reservation.refund.status)) {
      await updateIdempotencyAttempt(
        prisma,
        attempt.id,
        reservation.refund.status === "succeeded" ? "completed" : "failed",
        { refundId: reservation.refund.id, status: reservation.refund.status },
        reservation.refund.status === "succeeded" ? 200 : 422
      );
      return {
        success: reservation.refund.status === "succeeded",
        refundId: reservation.refund.id,
        status: reservation.refund.status,
        error: reservation.refund.status === "failed" ? "Previous refund attempt failed; use a new approved idempotency key to retry" : null,
      };
    }

    const payment = await context.sudo().query.Payment.findOne({
      where: { id: args.paymentId },
      query: "id amount refundedAmount currencyCode paymentMethod providerPaymentId data order { id orderNumber } paymentProvider { id code isInstalled createPaymentFunction capturePaymentFunction refundPaymentFunction getPaymentStatusFunction generatePaymentLinkFunction handleWebhookFunction credentials metadata }",
    });
    if (!payment?.order?.id) throw new Error("Payment order is missing");
    const providerReference =
      (payment.paymentProvider?.code === "pp_stripe_stripe" ? payment.providerPaymentId : null) ||
      (payment.data as any)?.captureId ||
      (payment.data as any)?.chargeId ||
      payment.providerPaymentId;
    let providerResult: any = { status: "succeeded", amount: reservation.refund.amount };
    if (!["cash", "gift_card"].includes(payment.paymentMethod || "")) {
      if (!payment.paymentProvider || !providerReference) throw new Error("Provider refund reference is missing");
      if (reservation.replay && !reservation.refund.providerRefundId && reservation.refund.createdAt && Date.now() - new Date(reservation.refund.createdAt).getTime() > 60 * 60 * 1000) {
        throw new Error("Uncertain refund has no provider reference and is outside the automatic replay window; reconcile with the provider before any replacement refund");
      }
      providerResult = await refundProviderPayment({
        provider: payment.paymentProvider,
        paymentId: providerReference,
        amount: reservation.refund.amount,
        currency: payment.currencyCode || "USD",
        idempotencyKey: args.idempotencyKey,
        refundId: reservation.refund.providerRefundId || undefined,
      });
    }
    const succeeded = ["succeeded", "refunded", "completed", "COMPLETED"].includes(providerResult.status);
    const finalStatus = succeeded ? "succeeded" : providerResult.status === "failed" ? "failed" : "unknown";
    const isLocalTender = ["cash", "gift_card"].includes(payment.paymentMethod || "");
    const providerRefundId =
      providerResult.id ||
      providerResult.refundId ||
      providerResult.data?.id ||
      providerResult.data?.refundId ||
      (isLocalTender ? `local:${reservation.refund.id}` : null);
    if (succeeded && !providerRefundId) {
      throw new Error("Provider reported a successful refund without a refund reference");
    }
    const final = await prisma.$transaction((tx: any) => finalizeRefundWithClient(tx, {
      refundId: reservation.refund.id, payment, providerResult, finalStatus, providerRefundId,
      actorId: context.session?.itemId, managerApprovalId: args.managerApprovalId,
    }), { isolationLevel: "Serializable" });

    await updateIdempotencyAttempt(
      prisma,
      attempt.id,
      succeeded ? "completed" : finalStatus === "failed" ? "failed" : "provider_pending",
      { refundId: final.id, status: final.status, providerRefundId: final.providerRefundId },
      succeeded ? 200 : finalStatus === "failed" ? 422 : 202
    );
    return { success: succeeded, refundId: final.id, status: final.status, error: succeeded ? null : "Refund provider outcome is not final" };
  } catch (error) {
    // An exception does not prove that an external refund failed. Preserve its
    // reservation and original idempotency key for safe provider replay.
    const pending = args.idempotencyKey ? await (context.prisma as any).refund.findUnique({ where: { idempotencyKey: args.idempotencyKey } }) : null;
    if (pending && ["processing", "unknown"].includes(pending.status)) {
      await (context.prisma as any).refund.updateMany({ where: { id: pending.id, status: { in: ["processing", "unknown"] } }, data: { status: "unknown" } });
    }
    return { success: false, refundId: pending?.id || null, status: pending ? (pending.status === "processing" ? "unknown" : pending.status) : null, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/** Recover after a reload or another operator takes over; retain the original
 * fingerprint, manager approval and provider idempotency key. */
export async function reconcileRefundMutation(_root: unknown, { refundId }: { refundId: string }, context: Context) {
  if (!permissions.canManagePayments({ session: context.session })) throw new Error("Payment management is required for refund recovery");
  const refund = await (context.prisma as any).refund.findUnique({ where: { id: refundId } });
  if (!refund) throw new Error("Refund not found");
  const attempt = await (context.prisma as any).idempotencyKey.findUnique({ where: { idempotencyKey: `refund:${refund.idempotencyKey}` } });
  if (!attempt?.requestParams?.managerApprovalId) throw new Error("Original refund approval evidence is missing");
  return refundPayment(null, { paymentId: refund.paymentId, amount: attempt.requestParams.amount, reason: attempt.requestParams.reason, managerApprovalId: attempt.requestParams.managerApprovalId, idempotencyKey: refund.idempotencyKey }, context);
}
