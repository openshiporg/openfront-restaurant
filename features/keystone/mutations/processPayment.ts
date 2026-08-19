import type { Context } from ".keystone/types";
import { permissions } from "../access";
import {
  capturePayment as captureProviderPayment,
  createPayment as createProviderPayment,
  getPaymentStatus as getProviderPaymentStatus,
} from "../utils/paymentProviderAdapter";
import { isPaymentProviderConfigured } from "../utils/paymentProviderConfig";
import { appendAuditEventWithClient } from "../utils/audit";
import { issueReceiptWithClient } from "../utils/receipt";
import { finalizePaidOrderWithClient, reconcileCompletedOrderOperations } from "../utils/orderCompletion";
import { getOrCreateIdempotencyAttempt, updateIdempotencyAttempt } from "../utils/idempotency";

interface ProcessPaymentArgs {
  orderId: string;
  amount?: number | null;
  paymentMethod: string;
  tipAmount?: number;
  idempotencyKey: string;
}

interface ProcessPaymentResult {
  success: boolean;
  paymentId: string | null;
  clientSecret: string | null;
  amount: number | null;
  remainingBalance: number | null;
  error: string | null;
}

function cents(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function providerCodeForMethod(method: string) {
  if (method === "cash") return "pp_system_default";
  if (["credit_card", "debit_card", "apple_pay", "google_pay"].includes(method)) {
    return "pp_stripe_stripe";
  }
  if (method === "paypal") return "pp_paypal_paypal";
  return null;
}

async function getProvider(context: Context, code: string | null) {
  if (!code) return null;
  const providers = await context.sudo().query.PaymentProvider.findMany({
    where: { code: { equals: code }, isInstalled: { equals: true } },
    query: "id code isInstalled createPaymentFunction capturePaymentFunction refundPaymentFunction getPaymentStatusFunction generatePaymentLinkFunction handleWebhookFunction credentials metadata",
    take: 1,
  });
  return providers[0] || null;
}

async function writeSaleEvidence(
  prisma: any,
  actorId: string | null | undefined,
  input: { payment: any; order: any; remainingBalance: number }
) {
  await appendAuditEventWithClient(prisma, actorId, {
    eventKey: `payment-succeeded:${input.payment.id}`,
    eventType: "payment.succeeded",
    entityType: "Payment",
    entityId: input.payment.id,
    after: {
      amount: input.payment.amount,
      method: input.payment.paymentMethod,
      remainingBalance: input.remainingBalance,
    },
    metadata: { idempotencyKey: input.payment.idempotencyKey },
  });
  await issueReceiptWithClient(prisma, actorId, {
    kind: "sale",
    entityId: input.payment.id,
    orderId: input.order.id,
    paymentId: input.payment.id,
    amount: cents(input.payment.amount),
    currencyCode: input.order.currencyCode || "USD",
    snapshot: {
      orderId: input.order.id,
      orderNumber: input.order.orderNumber,
      tender: input.payment.paymentMethod,
      amount: cents(input.payment.amount),
      remainingBalance: input.remainingBalance,
    },
  });
}

export default async function processPayment(
  _root: unknown,
  args: ProcessPaymentArgs,
  context: Context
): Promise<ProcessPaymentResult> {
  if (!permissions.canManagePayments({ session: context.session })) {
    return { success: false, paymentId: null, clientSecret: null, amount: null, remainingBalance: null, error: "Not authorized to process payment" };
  }

  try {
    if (!args.idempotencyKey?.trim()) throw new Error("Idempotency key is required");
    const providerCode = providerCodeForMethod(args.paymentMethod);
    if (!providerCode || args.paymentMethod === "gift_card") {
      throw new Error(args.paymentMethod === "gift_card" ? "Use the atomic gift-card redemption operation" : "Unsupported payment method");
    }
    const provider = await getProvider(context, providerCode);
    if (args.paymentMethod !== "cash" && (!provider || !isPaymentProviderConfigured(provider.code))) {
      throw new Error("The selected payment provider is not installed and configured");
    }

    const prisma = context.prisma as any;
    const priorPayment = await prisma.payment.findUnique({ where: { idempotencyKey: args.idempotencyKey } });
    if (priorPayment) {
      const requestedAmount = args.amount == null ? null : cents(args.amount);
      if (
        priorPayment.orderId !== args.orderId ||
        priorPayment.paymentMethod !== args.paymentMethod ||
        (requestedAmount !== null && cents(priorPayment.amount) !== requestedAmount)
      ) {
        throw new Error("Idempotency key was already used with a different payment request");
      }
    }
    const { attempt } = await getOrCreateIdempotencyAttempt(prisma, {
      key: `process-payment:${args.idempotencyKey.trim()}`,
      requestPath: "processPayment",
      requestParams: {
        orderId: args.orderId,
        paymentMethod: args.paymentMethod,
        amount: args.amount ?? null,
        tipAmount: args.tipAmount ?? 0,
      },
    });
    const reservation = await prisma.$transaction(async (tx: any) => {
      const existing = await tx.payment.findUnique({ where: { idempotencyKey: args.idempotencyKey } });
      if (existing) {
        const requestedAmount = args.amount == null ? null : cents(args.amount);
        if (
          existing.orderId !== args.orderId ||
          existing.paymentMethod !== args.paymentMethod ||
          (requestedAmount !== null && cents(existing.amount) !== requestedAmount)
        ) {
          throw new Error("Idempotency key was already used with a different payment request");
        }
        const order = await tx.restaurantOrder.findUnique({ where: { id: existing.orderId } });
        const payments = await tx.payment.findMany({
          where: {
            orderId: existing.orderId,
            status: { in: ["processing", "authorized", "succeeded", "unknown"] },
          },
        });
        const reserved = payments.reduce((sum: number, payment: any) => sum + cents(payment.amount), 0);
        return {
          payment: existing,
          order,
          remainingBalance: Math.max(0, cents(order?.total) - reserved),
          replay: true,
        };
      }

      const order = await tx.restaurantOrder.findUnique({ where: { id: args.orderId } });
      if (!order) throw new Error("Order not found");
      if (["completed", "cancelled"].includes(order.status || "")) {
        throw new Error("Order cannot accept another tender");
      }

      const recoverable = await tx.payment.findFirst({
        where: {
          orderId: order.id,
          paymentMethod: args.paymentMethod,
          status: { in: ["processing", "authorized", "unknown"] },
        },
        orderBy: { createdAt: "desc" },
      });
      if (recoverable) {
        const reservedRows = await tx.payment.findMany({
          where: {
            orderId: order.id,
            status: { in: ["processing", "authorized", "succeeded", "unknown"] },
          },
        });
        const reservedTotal = reservedRows.reduce((sum: number, payment: any) => sum + cents(payment.amount), 0);
        return {
          payment: recoverable,
          order,
          remainingBalance: Math.max(0, cents(order.total) - reservedTotal),
          replay: true,
        };
      }

      const desiredTip = Math.max(cents(order.tip), cents(args.tipAmount));
      const total = Math.max(0, cents(order.total) - cents(order.tip) + desiredTip);
      const reservedPayments = await tx.payment.findMany({
        where: {
          orderId: order.id,
          status: { in: ["processing", "authorized", "succeeded", "unknown"] },
        },
      });
      const reserved = reservedPayments.reduce((sum: number, payment: any) => sum + cents(payment.amount), 0);
      const remainingBalance = total - reserved;
      if (remainingBalance <= 0) throw new Error("Order has no unreserved balance");

      const requestedAmount = cents(args.amount);
      const amount = requestedAmount > 0 ? requestedAmount : remainingBalance;
      if (amount > remainingBalance) throw new Error("Tender amount exceeds the server-calculated remaining balance");
      const immediate = args.paymentMethod === "cash";
      const payment = await tx.payment.create({
        data: {
          idempotencyKey: args.idempotencyKey,
          reservedAt: new Date(),
          amount,
          status: immediate ? "succeeded" : "processing",
          paymentMethod: args.paymentMethod,
          currencyCode: order.currencyCode || "USD",
          tipAmount: desiredTip,
          paymentProviderId: provider?.id || null,
          processedAt: immediate ? new Date() : null,
          orderId: order.id,
          processedById: context.session?.itemId || null,
          data: { providerCode },
        },
      });
      const remainingAfterTender = remainingBalance - amount;
      const nextOrder = await tx.restaurantOrder.update({
        where: { id: order.id },
        data: {
          tip: desiredTip,
          total,
          status: order.status,
        },
      });
      if (immediate) {
        await writeSaleEvidence(tx, context.session?.itemId, {
          payment,
          order: nextOrder,
          remainingBalance: remainingAfterTender,
        });
        if (remainingAfterTender === 0) {
          await finalizePaidOrderWithClient(tx, order.id, context.session?.itemId);
        }
      }
      return { payment, order: nextOrder, remainingBalance: remainingAfterTender, replay: false };
    }, { isolationLevel: "Serializable" });

    const existingData = (reservation.payment?.data || {}) as Record<string, any>;
    const needsProviderRecovery =
      reservation.replay &&
      args.paymentMethod !== "cash" &&
      !reservation.payment.providerPaymentId &&
      !existingData.clientSecret;
    if (reservation.replay && !needsProviderRecovery) {
      await updateIdempotencyAttempt(prisma, attempt.id, "completed", {
        paymentId: reservation.payment.id,
        orderId: reservation.order?.id || args.orderId,
      }, 200);
      return {
        success: !["failed", "cancelled"].includes(reservation.payment.status),
        paymentId: reservation.payment.id,
        clientSecret: existingData.clientSecret || null,
        amount: cents(reservation.payment.amount),
        remainingBalance: reservation.remainingBalance,
        error: reservation.payment.errorMessage || null,
      };
    }

    if (args.paymentMethod === "cash") {
      if (reservation.remainingBalance === 0) {
        await reconcileCompletedOrderOperations(reservation.order.id, context);
      }
      await updateIdempotencyAttempt(prisma, attempt.id, "completed", {
        paymentId: reservation.payment.id,
        orderId: reservation.order.id,
      }, 200);
      return {
        success: true,
        paymentId: reservation.payment.id,
        clientSecret: null,
        amount: cents(reservation.payment.amount),
        remainingBalance: reservation.remainingBalance,
        error: null,
      };
    }

    try {
      const providerResult = await createProviderPayment({
        provider,
        order: reservation.order,
        amount: cents(reservation.payment.amount),
        currency: String(reservation.order.currencyCode || "USD").toLowerCase(),
        idempotencyKey: reservation.payment.idempotencyKey || args.idempotencyKey,
      } as any);
      const providerPaymentId = providerResult?.paymentIntentId || providerResult?.orderId || providerResult?.paymentId || null;
      const status = providerResult?.status === "succeeded"
        ? "succeeded"
        : providerResult?.status === "requires_capture"
          ? "authorized"
          : "processing";
      const data = { ...providerResult, providerCode };
      await prisma.$transaction(async (tx: any) => {
        const updated = await tx.payment.update({
          where: { id: reservation.payment.id },
          data: {
            providerPaymentId: providerPaymentId || "",
            data,
            status,
            processedAt: status === "succeeded" ? new Date() : undefined,
          },
        });
        if (status === "succeeded") {
          await writeSaleEvidence(tx, context.session?.itemId, { ...reservation, payment: updated });
          if (reservation.remainingBalance === 0) {
            await finalizePaidOrderWithClient(tx, reservation.order.id, context.session?.itemId);
          }
        }
      }, { isolationLevel: "Serializable" });
      if (status === "succeeded" && reservation.remainingBalance === 0) {
        await reconcileCompletedOrderOperations(reservation.order.id, context);
      }
      await updateIdempotencyAttempt(prisma, attempt.id, "completed", {
        paymentId: reservation.payment.id,
        orderId: reservation.order.id,
        providerPaymentId,
        status,
      }, 200);
      return {
        success: true,
        paymentId: reservation.payment.id,
        clientSecret: providerResult?.clientSecret || null,
        amount: cents(reservation.payment.amount),
        remainingBalance: reservation.remainingBalance,
        error: null,
      };
    } catch (error) {
      await context.sudo().db.Payment.updateOne({
        where: { id: reservation.payment.id },
        data: { status: "failed", errorMessage: error instanceof Error ? error.message : "Provider initiation failed" },
      });
      await updateIdempotencyAttempt(prisma, attempt.id, "failed", {
        paymentId: reservation.payment.id,
        error: error instanceof Error ? error.message : "Provider initiation failed",
      }, 502);
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, paymentId: null, clientSecret: null, amount: null, remainingBalance: null, error: message };
  }
}

export async function capturePaymentMutation(
  _root: unknown,
  args: { paymentIntentId: string },
  context: Context
) {
  if (!permissions.canManagePayments({ session: context.session })) {
    return { success: false, status: null, error: "Not authorized to capture payment" };
  }
  try {
    const payments = await context.sudo().query.Payment.findMany({
      where: { providerPaymentId: { equals: args.paymentIntentId } },
      query: "id idempotencyKey amount status paymentMethod currencyCode providerPaymentId data order { id orderNumber total currencyCode status } paymentProvider { id code isInstalled createPaymentFunction capturePaymentFunction refundPaymentFunction getPaymentStatusFunction generatePaymentLinkFunction handleWebhookFunction credentials metadata }",
      take: 1,
    });
    const payment = payments[0];
    if (!payment) throw new Error("Payment not found");
    if (payment.status === "succeeded") return { success: true, status: "succeeded", error: null };
    if (!payment.paymentProvider) throw new Error("Payment provider is missing");

    const captured = await captureProviderPayment({
      provider: payment.paymentProvider,
      paymentId: payment.providerPaymentId || args.paymentIntentId,
      amount: cents(payment.amount),
    });
    const didSucceed = ["succeeded", "captured"].includes(captured.status);
    const nextStatus = didSucceed ? "succeeded" : captured.status === "failed" ? "failed" : "unknown";
    const prisma = context.prisma as any;
    await prisma.$transaction(async (tx: any) => {
      const updated = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: nextStatus,
          processedAt: didSucceed ? new Date() : undefined,
          data: { ...(payment.data || {}), capture: captured.data || captured },
        },
      });
      if (didSucceed && payment.order?.id) {
        const order = await tx.restaurantOrder.findUnique({ where: { id: payment.order.id } });
        const succeeded = await tx.payment.findMany({ where: { orderId: order.id, status: "succeeded" } });
        const paid = succeeded.reduce((sum: number, row: any) => sum + cents(row.amount), 0);
        const remainingBalance = Math.max(0, cents(order.total) - paid);
        await writeSaleEvidence(tx, context.session?.itemId, { payment: updated, order, remainingBalance });
        if (remainingBalance === 0) await finalizePaidOrderWithClient(tx, order.id, context.session?.itemId);
      }
    }, { isolationLevel: "Serializable" });
    if (didSucceed && payment.order?.id) await reconcileCompletedOrderOperations(payment.order.id, context);
    return { success: didSucceed, status: nextStatus, error: didSucceed ? null : "Capture outcome is not final" };
  } catch (error) {
    return { success: false, status: null, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function reconcilePaymentMutation(
  _root: unknown,
  { paymentId }: { paymentId: string },
  context: Context
) {
  if (!permissions.canManagePayments({ session: context.session })) {
    return { success: false, status: null, error: "Not authorized to reconcile payment" };
  }
  try {
    const payment = await context.sudo().query.Payment.findOne({
      where: { id: paymentId },
      query: "id idempotencyKey amount status paymentMethod currencyCode providerPaymentId data order { id orderNumber total currencyCode status } paymentProvider { id code isInstalled createPaymentFunction capturePaymentFunction refundPaymentFunction getPaymentStatusFunction generatePaymentLinkFunction handleWebhookFunction credentials metadata }",
    });
    if (!payment) throw new Error("Payment not found");
    if (payment.status === "succeeded") return { success: true, status: "succeeded", error: null };
    if (!payment.paymentProvider || !payment.providerPaymentId) throw new Error("Provider payment reference is missing");
    const providerStatus = await getProviderPaymentStatus({
      provider: payment.paymentProvider,
      paymentId: payment.providerPaymentId,
    });
    const succeeded = providerStatus.status === "succeeded";
    const status = succeeded
      ? "succeeded"
      : ["failed", "canceled", "cancelled"].includes(providerStatus.status)
        ? providerStatus.status === "failed" ? "failed" : "cancelled"
        : "processing";
    const prisma = context.prisma as any;
    await prisma.$transaction(async (tx: any) => {
      const updated = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status,
          processedAt: succeeded ? new Date() : undefined,
          data: { ...(payment.data || {}), reconciliation: providerStatus.data || providerStatus },
        },
      });
      if (succeeded && payment.order?.id) {
        const order = await tx.restaurantOrder.findUnique({ where: { id: payment.order.id } });
        const paidRows = await tx.payment.findMany({ where: { orderId: order.id, status: "succeeded" } });
        const paid = paidRows.reduce((sum: number, row: any) => sum + cents(row.amount), 0);
        const remainingBalance = Math.max(0, cents(order.total) - paid);
        await writeSaleEvidence(tx, context.session?.itemId, { payment: updated, order, remainingBalance });
        if (remainingBalance === 0) await finalizePaidOrderWithClient(tx, order.id, context.session?.itemId);
      }
    }, { isolationLevel: "Serializable" });
    if (succeeded && payment.order?.id) await reconcileCompletedOrderOperations(payment.order.id, context);
    return { success: succeeded, status, error: succeeded ? null : "Provider payment is not yet successful" };
  } catch (error) {
    return { success: false, status: null, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function getPaymentStatus(
  _root: unknown,
  args: { paymentIntentId: string },
  context: Context
) {
  if (!(permissions.canReadPayments({ session: context.session }) || permissions.canManagePayments({ session: context.session }))) {
    return { status: null, amount: null, error: "Not authorized to check payment status" };
  }
  try {
    const payments = await context.sudo().query.Payment.findMany({
      where: { providerPaymentId: { equals: args.paymentIntentId } },
      query: "id amount status providerPaymentId paymentProvider { id code isInstalled createPaymentFunction capturePaymentFunction refundPaymentFunction getPaymentStatusFunction generatePaymentLinkFunction handleWebhookFunction credentials metadata }",
      take: 1,
    });
    const payment = payments[0];
    if (!payment) throw new Error("Payment not found");
    if (!payment.paymentProvider || ["cash", "gift_card"].includes(payment.paymentMethod || "")) {
      return { status: payment.status, amount: cents(payment.amount), error: null };
    }
    const status = await getProviderPaymentStatus({
      provider: payment.paymentProvider,
      paymentId: payment.providerPaymentId || args.paymentIntentId,
    });
    return { status: status.status, amount: status.amount ?? cents(payment.amount), error: null };
  } catch (error) {
    return { status: null, amount: null, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
