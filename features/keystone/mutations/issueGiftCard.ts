import crypto from "node:crypto";
import type { Context } from ".keystone/types";
import { permissions } from "../access";
import { appendAuditEventWithClient } from "../utils/audit";
import { issueReceiptWithClient } from "../utils/receipt";

/** Cash issuance is a liability purchase, never an arbitrary opening balance. */
export async function issueGiftCard(_root: unknown, input: { code: string; amount: number; idempotencyKey: string }, context: Context) {
  if (!permissions.canManageGiftCards({ session: context.session }) || !permissions.canManagePayments({ session: context.session })) throw new Error("Gift-card and payment management are required");
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9-]{8,64}$/.test(code)) throw new Error("Gift card code must contain 8–64 letters, digits or hyphens");
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new Error("A positive amount in minor units is required");
  if (!input.idempotencyKey?.trim()) throw new Error("Idempotency key is required");
  const settings = await context.sudo().query.StoreSettings.findOne({ where: { id: "1" }, query: "currencyCode" });
  const currencyCode = settings?.currencyCode || "USD";
  const prisma = context.prisma as any;
  return prisma.$transaction(async (tx: any) => {
    const key = `gift-issue:${input.idempotencyKey.trim()}`;
    const existing = await tx.giftCardTransaction.findUnique({ where: { idempotencyKey: key }, include: { giftCard: true } });
    if (existing) {
      if (existing.amount !== input.amount || existing.giftCard?.code !== code) throw new Error("Idempotency key belongs to a different issuance");
      return existing.giftCard;
    }
    const order = await tx.restaurantOrder.create({ data: { orderNumber: `GC-${crypto.randomUUID()}`, orderType: "takeout", orderSource: "gift_card", status: "completed", subtotal: input.amount, tax: 0, tip: 0, discount: 0, total: input.amount, currencyCode, guestCount: 1 } });
    const giftCard = await tx.giftCard.create({ data: { code, value: input.amount, balance: input.amount, isDisabled: false, orderId: order.id, metadata: { fundingMethod: "cash", liability: true, currencyCode } } });
    const tender = await tx.payment.create({ data: { idempotencyKey: key, orderId: order.id, amount: input.amount, paymentMethod: "cash", status: "succeeded", currencyCode, reservedAt: new Date(), processedAt: new Date(), processedById: context.session?.itemId, data: { giftCardId: giftCard.id, purpose: "stored_value_issuance" } } });
    await tx.giftCardTransaction.create({ data: { idempotencyKey: key, type: "issue", amount: input.amount, balanceAfter: input.amount, giftCardId: giftCard.id, orderId: order.id } });
    await appendAuditEventWithClient(tx, context.session?.itemId, { eventKey: key, eventType: "gift_card.issued", entityType: "GiftCard", entityId: giftCard.id, after: { amount: input.amount, currencyCode }, metadata: { paymentId: tender.id, orderId: order.id, fundingMethod: "cash" } });
    await issueReceiptWithClient(tx, context.session?.itemId, { kind: "sale", entityId: tender.id, paymentId: tender.id, orderId: order.id, amount: input.amount, currencyCode, snapshot: { purpose: "stored_value_issuance", giftCardId: giftCard.id, amount: input.amount, currencyCode, tender: "cash" } });
    return giftCard;
  }, { isolationLevel: "Serializable" });
}
