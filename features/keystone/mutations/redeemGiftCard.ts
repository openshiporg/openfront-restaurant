import type { Context } from ".keystone/types";
import { permissions } from "../access";
import { appendAuditEventWithClient } from "../utils/audit";
import { issueReceiptWithClient } from "../utils/receipt";
import { finalizePaidOrderWithClient, reconcileCompletedOrderOperations } from "../utils/orderCompletion";
import { getOrCreateIdempotencyAttempt, updateIdempotencyAttempt } from "../utils/idempotency";

function cents(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

export async function lookupGiftCard(
  _root: unknown,
  { code }: { code: string },
  context: Context
) {
  if (!permissions.canManagePayments({ session: context.session })) {
    throw new Error("Not authorized to use gift-card tenders");
  }
  const normalized = code?.trim().toUpperCase();
  if (!normalized) throw new Error("Gift card code is required");
  const cards = await context.sudo().query.GiftCard.findMany({
    where: { code: { equals: normalized }, isDisabled: { equals: false } },
    query: "id code balance endsAt",
    take: 1,
  });
  const card = cards[0];
  if (!card || (card.endsAt && new Date(card.endsAt) <= new Date())) return null;
  return card;
}

export default async function redeemGiftCard(
  _root: unknown,
  args: {
    orderId: string;
    code: string;
    tipAmount?: number | null;
    idempotencyKey: string;
  },
  context: Context
) {
  if (!permissions.canManagePayments({ session: context.session })) {
    return { success: false, paymentId: null, amount: 0, remainingBalance: 0, error: "Not authorized" };
  }

  try {
    if (!args.idempotencyKey?.trim()) throw new Error("Idempotency key is required");
    const code = args.code?.trim().toUpperCase();
    if (!code) throw new Error("Gift card code is required");
    const prisma = context.prisma as any;
    const priorTransaction = await prisma.giftCardTransaction.findUnique({
      where: { idempotencyKey: args.idempotencyKey },
    });
    if (priorTransaction) {
      const [priorPayment, priorCard] = await Promise.all([
        prisma.payment.findUnique({ where: { idempotencyKey: args.idempotencyKey } }),
        priorTransaction.giftCardId
          ? prisma.giftCard.findUnique({ where: { id: priorTransaction.giftCardId } })
          : null,
      ]);
      if (
        priorTransaction.orderId !== args.orderId ||
        priorPayment?.orderId !== args.orderId ||
        priorCard?.code !== code
      ) {
        throw new Error("Idempotency key was already used with a different gift-card request");
      }
    }
    const { attempt } = await getOrCreateIdempotencyAttempt(prisma, {
      key: `gift-card-redemption:${args.idempotencyKey.trim()}`,
      requestPath: "redeemGiftCard",
      requestParams: {
        orderId: args.orderId,
        code,
        tipAmount: args.tipAmount ?? 0,
      },
    });
    const result = await prisma.$transaction(async (tx: any) => {
      const existingTransaction = await tx.giftCardTransaction.findUnique({
        where: { idempotencyKey: args.idempotencyKey },
      });
      if (existingTransaction) {
        const existingPayment = await tx.payment.findUnique({ where: { idempotencyKey: args.idempotencyKey } });
        const existingCard = existingTransaction.giftCardId
          ? await tx.giftCard.findUnique({ where: { id: existingTransaction.giftCardId } })
          : null;
        if (
          existingTransaction.orderId !== args.orderId ||
          existingPayment?.orderId !== args.orderId ||
          existingCard?.code !== code
        ) {
          throw new Error("Idempotency key was already used with a different gift-card request");
        }
        const order = await tx.restaurantOrder.findUnique({ where: { id: args.orderId } });
        const payments = await tx.payment.findMany({ where: { orderId: args.orderId, status: "succeeded" } });
        const paid = payments.reduce((sum: number, payment: any) => sum + cents(payment.amount), 0);
        return {
          payment: existingPayment,
          order,
          amount: Math.abs(cents(existingTransaction.amount)),
          remainingBalance: Math.max(0, cents(order?.total) - paid),
          replay: true,
        };
      }

      const order = await tx.restaurantOrder.findUnique({ where: { id: args.orderId } });
      if (!order) throw new Error("Order not found");
      if (["completed", "cancelled"].includes(order.status || "")) throw new Error("Order cannot accept another tender");

      const desiredTip = Math.max(cents(order.tip), cents(args.tipAmount));
      const orderTotal = Math.max(0, cents(order.total) - cents(order.tip) + desiredTip);
      const reservedPayments = await tx.payment.findMany({
        where: { orderId: args.orderId, status: { in: ["processing", "authorized", "succeeded"] } },
      });
      const reserved = reservedPayments.reduce((sum: number, payment: any) => sum + cents(payment.amount), 0);
      const remaining = orderTotal - reserved;
      if (remaining <= 0) throw new Error("Order has no remaining balance");

      const giftCard = await tx.giftCard.findUnique({ where: { code } });
      if (!giftCard || giftCard.isDisabled) throw new Error("Gift card not found or disabled");
      if (giftCard.endsAt && new Date(giftCard.endsAt) <= new Date()) throw new Error("Gift card has expired");
      const amount = Math.min(cents(giftCard.balance), remaining);
      if (amount <= 0) throw new Error("Gift card has no available balance");
      const balanceAfter = cents(giftCard.balance) - amount;

      await tx.giftCard.update({ where: { id: giftCard.id }, data: { balance: balanceAfter } });
      const payment = await tx.payment.create({
        data: {
          idempotencyKey: args.idempotencyKey,
          reservedAt: new Date(),
          amount,
          currencyCode: order.currencyCode || "USD",
          status: "succeeded",
          paymentMethod: "gift_card",
          tipAmount: desiredTip,
          processedAt: new Date(),
          orderId: order.id,
          processedById: context.session?.itemId || null,
          data: { giftCardId: giftCard.id },
        },
      });
      await tx.giftCardTransaction.create({
        data: {
          idempotencyKey: args.idempotencyKey,
          type: "redeem",
          amount: -amount,
          balanceAfter,
          giftCardId: giftCard.id,
          orderId: order.id,
        },
      });
      const updatedOrder = await tx.restaurantOrder.update({
        where: { id: order.id },
        data: {
          tip: desiredTip,
          total: orderTotal,
          status: order.status,
        },
      });
      const remainingBalance = remaining - amount;
      await appendAuditEventWithClient(tx, context.session?.itemId, {
        eventKey: `gift-card-redeemed:${payment.id}`,
        eventType: "gift_card.redeemed",
        entityType: "Payment",
        entityId: payment.id,
        after: { amount, remainingBalance },
        metadata: { idempotencyKey: args.idempotencyKey },
      });
      await issueReceiptWithClient(tx, context.session?.itemId, {
        kind: "sale",
        entityId: payment.id,
        orderId: order.id,
        paymentId: payment.id,
        amount,
        currencyCode: order.currencyCode || "USD",
        snapshot: { orderId: order.id, tender: "gift_card", amount, remainingBalance },
      });
      if (remainingBalance === 0) {
        await finalizePaidOrderWithClient(tx, order.id, context.session?.itemId);
      }
      return { payment, order: updatedOrder, amount, remainingBalance, replay: false };
    }, { isolationLevel: "Serializable" });

    if (result.remainingBalance === 0) await reconcileCompletedOrderOperations(args.orderId, context);

    await updateIdempotencyAttempt(prisma, attempt.id, "completed", {
      paymentId: result.payment?.id || null,
      orderId: args.orderId,
      amount: result.amount,
      remainingBalance: result.remainingBalance,
    }, 200);

    return {
      success: true,
      paymentId: result.payment?.id || null,
      amount: result.amount,
      remainingBalance: result.remainingBalance,
      error: null,
    };
  } catch (error) {
    return {
      success: false,
      paymentId: null,
      amount: 0,
      remainingBalance: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
