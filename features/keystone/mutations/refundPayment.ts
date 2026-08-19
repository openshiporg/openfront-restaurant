import type { Context } from ".keystone/types";
import { permissions } from "../access";
import { refundPayment as refundProviderPayment } from "../utils/paymentProviderAdapter";
import { appendAuditEventWithClient } from "../utils/audit";
import { issueReceiptWithClient } from "../utils/receipt";
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
      (payment.data as any)?.captureId ||
      (payment.data as any)?.chargeId ||
      payment.providerPaymentId;
    let providerResult: any = { status: "succeeded", amount: reservation.refund.amount };
    if (!["cash", "gift_card"].includes(payment.paymentMethod || "")) {
      if (!payment.paymentProvider || !providerReference) throw new Error("Provider refund reference is missing");
      providerResult = await refundProviderPayment({
        provider: payment.paymentProvider,
        paymentId: providerReference,
        amount: reservation.refund.amount,
        currency: payment.currencyCode || "USD",
        idempotencyKey: args.idempotencyKey,
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
    const final = await prisma.$transaction(async (tx: any) => {
      const refund = await tx.refund.update({
        where: { id: reservation.refund.id },
        data: {
          status: finalStatus,
          providerRefundId: providerRefundId || "",
          providerData: providerResult.data || providerResult,
          processedAt: succeeded ? new Date() : null,
        },
      });
      if (succeeded) {
        if (payment.paymentMethod === "gift_card") {
          const giftCardId = (payment.data as any)?.giftCardId;
          if (!giftCardId) throw new Error("Gift card reference is missing from the original tender");
          const giftCard = await tx.giftCard.findUnique({ where: { id: giftCardId } });
          if (!giftCard) throw new Error("Gift card not found");
          const balanceAfter = cents(giftCard.balance) + cents(refund.amount);
          await tx.giftCard.update({ where: { id: giftCard.id }, data: { balance: balanceAfter } });
          await tx.giftCardTransaction.create({
            data: {
              idempotencyKey: `refund:${args.idempotencyKey}`,
              type: "refund",
              amount: cents(refund.amount),
              balanceAfter,
              giftCardId: giftCard.id,
              orderId: payment.order.id,
            },
          });
        }
        const nextRefunded = cents(payment.refundedAmount) + cents(refund.amount);
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            refundedAmount: nextRefunded,
            status: nextRefunded >= cents(payment.amount) ? "refunded" : "partially_refunded",
          },
        });
        await appendAuditEventWithClient(tx, context.session?.itemId, {
          eventKey: `payment-refunded:${refund.id}`,
          eventType: "payment.refunded",
          entityType: "Refund",
          entityId: refund.id,
          reason: args.reason,
          after: { amount: refund.amount, paymentId: payment.id },
          approverId: reservation.refund.approvedById,
          metadata: { idempotencyKey: args.idempotencyKey, managerApprovalId: args.managerApprovalId },
        });
        await issueReceiptWithClient(tx, context.session?.itemId, {
          kind: "refund",
          entityId: refund.id,
          orderId: payment.order.id,
          paymentId: payment.id,
          refundId: refund.id,
          amount: -cents(refund.amount),
          currencyCode: payment.currencyCode || "USD",
          snapshot: {
            orderNumber: payment.order.orderNumber,
            originalPaymentId: payment.id,
            refundAmount: cents(refund.amount),
            reason: args.reason,
            providerRefundId: refund.providerRefundId,
            managerApprovalId: args.managerApprovalId,
          },
        });
      }
      return refund;
    }, { isolationLevel: "Serializable" });

    await updateIdempotencyAttempt(
      prisma,
      attempt.id,
      succeeded ? "completed" : finalStatus === "failed" ? "failed" : "provider_pending",
      { refundId: final.id, status: final.status, providerRefundId: final.providerRefundId },
      succeeded ? 200 : finalStatus === "failed" ? 422 : 202
    );
    return { success: succeeded, refundId: final.id, status: final.status, error: succeeded ? null : "Refund provider outcome is not final" };
  } catch (error) {
    return { success: false, refundId: null, status: null, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
