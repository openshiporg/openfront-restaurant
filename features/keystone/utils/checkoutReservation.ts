import { assertOnlineOrderingCapacity } from "./orderingCapacity";
import { idempotencyFingerprint } from "./idempotency";
import crypto from "node:crypto";
const FROZEN = ["initializing", "provider_pending", "ready", "unknown", "finalizing", "cancelling"];
export function checkoutCartSignature(cart: any, fallbackCart?: any) {
  const fallbackItems = new Map((fallbackCart?.items || []).map((item: any) => [item.id, item]));
  return JSON.stringify({
    userId: cart.userId || cart.user?.id || null,
    fields: ["orderType", "email", "customerName", "customerPhone", "deliveryAddress", "deliveryAddress2", "deliveryCity", "deliveryState", "deliveryZip", "deliveryCountryCode", "tipPercent"].map(field => cart[field] || ""),
    items: (cart.items || []).map((item: any) => {
      const fallback = fallbackItems.get(item.id) as any;
      return {
        id: item.id,
        menuItemId: item.menuItemId || item.menuItem?.id || fallback?.menuItemId || fallback?.menuItem?.id || null,
        quantity: item.quantity,
        specialInstructions: item.specialInstructions || "",
        modifiers: ((item.modifiers?.length ? item.modifiers : fallback?.modifiers) || []).map((modifier: any) => modifier.id).sort(),
      };
    }).sort((left: any, right: any) => left.id.localeCompare(right.id)),
  });
}

/** Re-check the immutable quote against the live cart/session in the same DB transaction. */
export function assertCheckoutQuoteState(input: {
  cart: any;
  session: any;
  quote: any;
  cartId: string;
  paymentCollectionId: string | null;
  providerId: string;
  sessionId: string;
}) {
  const { cart, session, quote, cartId, paymentCollectionId, providerId, sessionId } = input;
  const total = Number(quote?.pricing?.total);
  if (quote?.version !== 1 || !quote.cart || !Number.isSafeInteger(total) || total < 0) {
    throw new Error("Checkout quote is invalid; cancel or reconcile this attempt before retrying");
  }
  if (cart?.id !== cartId || session?.id !== sessionId) throw new Error("Checkout cart/session identity changed; refresh and reconcile the attempt");
  if (!paymentCollectionId || cart.paymentCollectionId !== paymentCollectionId || session.paymentCollectionId !== paymentCollectionId) {
    throw new Error("Checkout payment collection changed; reconcile the original attempt");
  }
  if (session.paymentProviderId !== providerId) throw new Error("Checkout payment provider changed; reconcile the original attempt");
  if (!session.isSelected || !session.isInitiated || ["cancelled", "cancelling"].includes(session.data?.state)) {
    throw new Error("Checkout was cancelled, replaced, or not initiated; refresh checkout");
  }
  if (idempotencyFingerprint(session.data?.checkoutQuote || {}) !== idempotencyFingerprint(quote)) {
    throw new Error("Checkout quote changed after review; reconcile the original attempt");
  }
  const expectedCartSignature = quote.cartSignature || checkoutCartSignature(quote.cart);
  if (checkoutCartSignature(cart, quote.cart) !== expectedCartSignature) {
    throw new Error("Cart changed after checkout review; cancel or reconcile the original attempt");
  }
  if (Number(session.amount) !== total) throw new Error("Payment session amount no longer matches the reviewed quote; reconcile the original attempt");
}
/** All local reservation facts commit before any irreversible provider operation. */
export async function claimCheckoutSession(prisma: any, input: { cart: any; providerId: string; providerCode: string; checkoutQuote: any; fingerprint: string }) {
  return prisma.$transaction(async (tx: any) => {
    const current = await tx.cart.findUnique({ where: { id: input.cart.id }, include: { items: { include: { modifiers: true } }, paymentCollection: { include: { paymentSessions: true } } } });
    if (!current || current.orderId) throw new Error("Cart is missing or already placed");
    const active = current.paymentCollection?.paymentSessions?.find((session: any) => session.isSelected && session.data?.checkoutQuote && FROZEN.includes(session.data.state));
    if (active) {
      if (active.paymentProviderId !== input.providerId) throw new Error("Resolve the existing payment attempt before changing provider");
      return { session: active, replay: true };
    }
    if (checkoutCartSignature(current) !== checkoutCartSignature(input.cart)) throw new Error("Cart changed while reserving checkout; refresh before payment");
    await assertOnlineOrderingCapacity(tx);
    const collection = current.paymentCollection || await tx.paymentCollection.create({ data: { amount: input.checkoutQuote.pricing.total, description: "default" } });
    // The cart write conflicts with concurrent edit/checkout transactions. A new
    // cancelled-attempt generation gets a new provider key, never the cancelled intent.
    await tx.cart.update({ where: { id: current.id }, data: { paymentCollectionId: collection.id } });
    await tx.paymentCollection.update({ where: { id: collection.id }, data: { amount: input.checkoutQuote.pricing.total } });
    await tx.paymentSession.updateMany({ where: { paymentCollectionId: collection.id }, data: { isSelected: false } });
    const idempotencyKey = crypto.createHash("sha256").update(`${input.fingerprint}:${crypto.randomUUID()}`).digest("hex");
    const session = await tx.paymentSession.create({ data: {
      paymentCollectionId: collection.id, paymentProviderId: input.providerId, amount: input.checkoutQuote.pricing.total,
      idempotencyKey, isSelected: true, isInitiated: false,
      data: { providerCode: input.providerCode, state: "initializing", checkoutQuote: input.checkoutQuote },
    } });
    return { session, replay: false };
  }, { isolationLevel: "Serializable" });
}
