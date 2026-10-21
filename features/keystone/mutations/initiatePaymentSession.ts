import crypto from "crypto";
import { claimCheckoutSession, checkoutCartSignature } from "../utils/checkoutReservation";
import type { Context } from ".keystone/types";
import { snapshotCheckoutRecipes } from "../utils/inventoryRecipeSnapshot";
import { createPayment } from "../utils/paymentProviderAdapter";
import { calculateRestaurantTotals } from "../../lib/restaurant-order-pricing";
import { assertCanAccessCart } from "../utils/cartAccess";
import { validateCartItemInput } from "../utils/cartItemValidation";
import { isPaymentProviderConfigured } from "../utils/paymentProviderConfig";
import {
  assertDeliveryAddressComplete,
  assertDeliveryAddressEligible,
  getStoreDeliverySettings,
} from "../utils/deliveryValidation";

interface InitiatePaymentSessionArgs {
  cartId: string;
  paymentProviderId: string;
}

function sessionKey(input: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

const SESSION_QUERY = `
  id
  data
  amount
  isInitiated
  isSelected
  paymentProvider { id code }
`;

export default async function initiatePaymentSession(
  _root: unknown,
  { cartId, paymentProviderId }: InitiatePaymentSessionArgs,
  context: Context
) {
  await assertCanAccessCart(context, cartId, "checkout");
  const sudo = context.sudo();
  let cart = await sudo.query.Cart.findOne({
    where: { id: cartId },
    query: `
      id updatedAt orderType email customerName customerPhone deliveryAddress deliveryAddress2 deliveryCity deliveryState deliveryCountryCode deliveryZip tipPercent user { id }
      order { id }
      paymentCollection {
        id amount
        paymentSessions { id idempotencyKey isSelected isInitiated amount data paymentProvider { id code } }
      }
      items {
        id quantity specialInstructions
        menuItem { id }
        modifiers { id }
      }
    `,
  });
  if (!cart) throw new Error("Cart not found");
  if (cart.order?.id) throw new Error("Completed carts cannot start another payment");
  if (!cart.items?.length) throw new Error("Cart is empty");
  // A provider attempt owns its immutable quote until its outcome is resolved.
  // Retrying must not create a differently priced intent after a catalog edit.
  const activeAttempt = cart.paymentCollection?.paymentSessions?.find((session: any) =>
    session.isSelected && session.data?.checkoutQuote && ["initializing", "provider_pending", "ready", "unknown", "finalizing", "cancelling"].includes(session.data?.state)
  );
  if (activeAttempt) {
    if (activeAttempt.paymentProvider?.code !== paymentProviderId) throw new Error("Resolve the existing payment attempt before changing provider");
    if (activeAttempt.isInitiated) return sudo.query.PaymentSession.findOne({ where: { id: activeAttempt.id }, query: SESSION_QUERY });
  }

  const provider = await sudo.query.PaymentProvider.findOne({
    where: { code: paymentProviderId },
    query: `
      id code isInstalled createPaymentFunction capturePaymentFunction refundPaymentFunction
      getPaymentStatusFunction generatePaymentLinkFunction credentials
    `,
  });
  if (!provider?.isInstalled || !isPaymentProviderConfigured(provider.code)) {
    throw new Error(`Payment provider ${paymentProviderId} is not installed and configured`);
  }

  const validatedItems = activeAttempt?.data?.checkoutQuote?.items || await Promise.all(
    cart.items.map((item: any) => validateCartItemInput(context, {
      menuItemId: item.menuItem?.id,
      quantity: item.quantity,
      modifierIds: (item.modifiers || []).map((modifier: any) => modifier.id),
      specialInstructions: item.specialInstructions,
    }))
  );
  const subtotal = validatedItems.reduce((sum: number, item: any) => sum + item.unitPrice * item.quantity, 0);
  const settings = await getStoreDeliverySettings(context);
  const currency = activeAttempt?.data?.checkoutQuote?.currencyCode || settings?.currencyCode || "USD";
  if (!activeAttempt?.data?.checkoutQuote) assertDeliveryAddressComplete({
    orderType: cart.orderType,
    deliveryAddress: cart.deliveryAddress,
    deliveryCity: cart.deliveryCity,
    deliveryCountryCode: cart.deliveryCountryCode,
    deliveryZip: cart.deliveryZip,
  });
  if (!activeAttempt?.data?.checkoutQuote) assertDeliveryAddressEligible({
    orderType: cart.orderType,
    storeSettings: settings,
    deliveryCountryCode: cart.deliveryCountryCode,
    deliveryZip: cart.deliveryZip,
  });

  const pricing = activeAttempt?.data?.checkoutQuote?.pricing || calculateRestaurantTotals({
    subtotal,
    orderType: cart.orderType,
    tipPercent: cart.tipPercent,
    deliveryFee: settings?.deliveryFee,
    deliveryMinimum: settings?.deliveryMinimum,
    pickupDiscountPercent: settings?.pickupDiscount,
    taxRate: settings?.taxRate,
    currencyCode: currency,
  });
  if (pricing.deliveryMinimumNotMet) {
    throw new Error(`Delivery orders require a minimum subtotal of ${settings?.deliveryMinimum || "0.00"}.`);
  }
  const amount = pricing.total;
  const { paymentCollection: _collection, ...quotedCart } = cart;
  const checkoutQuote = activeAttempt?.data?.checkoutQuote || { version: 1, pricingPolicy: { taxRate: settings?.taxRate || 0, currencyCode: currency, deliveryFee: settings?.deliveryFee, deliveryMinimum: settings?.deliveryMinimum, pickupDiscount: settings?.pickupDiscount }, cart: quotedCart, cartSignature: checkoutCartSignature(cart), items: validatedItems, pricing: { ...pricing, subtotal }, currencyCode: currency, createdAt: new Date().toISOString() };
  const idempotencyKey = activeAttempt?.idempotencyKey || sessionKey({
    cartId,
    cartUpdatedAt: cart.updatedAt,
    provider: provider.code,
    amount,
    items: validatedItems.map((item: any) => ({
      menuItemId: item.menuItem.id,
      quantity: item.quantity,
      modifierIds: item.modifiers.map((modifier: any) => modifier.id).sort(),
      specialInstructions: item.specialInstructions,
    })),
  });

  const reserved = await claimCheckoutSession(context.prisma, { cart, providerId: provider.id, providerCode: provider.code, checkoutQuote, fingerprint: idempotencyKey });
  const paymentSession = reserved.session;
  const reservedQuote = paymentSession.data.checkoutQuote;
  if (paymentSession.isInitiated) return sudo.query.PaymentSession.findOne({ where: { id: paymentSession.id }, query: SESSION_QUERY });
  try { await snapshotCheckoutRecipes(context, paymentSession.id, reservedQuote.items); }
  catch (error) {
    // Only a never-started provider attempt may be released on local validation
    // failure. An uncertain external attempt keeps its quote and original key.
    await (context.prisma as any).$transaction(async (tx: any) => {
      const current = await tx.paymentSession.findUnique({ where: { id: paymentSession.id } });
      if (current?.data?.state === "initializing") await tx.paymentSession.update({ where: { id: current.id }, data: { isSelected: false, data: { ...current.data, state: "failed", error: "Production recipe validation failed before provider initiation" } } });
    }, { isolationLevel: "Serializable" });
    throw error;
  }
  const shouldInitiate = await (context.prisma as any).$transaction(async (tx: any) => {
    const current = await tx.paymentSession.findUnique({ where: { id: paymentSession.id } });
    if (!current?.isSelected || ["cancelled", "cancelling"].includes(current.data?.state)) throw new Error("Checkout was cancelled before payment initiation");
    if (current.isInitiated) return false;
    await tx.paymentSession.update({ where: { id: current.id }, data: { data: { ...current.data, state: "provider_pending" } } });
    return true;
  }, { isolationLevel: "Serializable" });
  if (!shouldInitiate) return sudo.query.PaymentSession.findOne({ where: { id: paymentSession.id }, query: SESSION_QUERY });
  const isManual = provider.code === "pp_system_default" || provider.code.startsWith("pp_manual");
  try {
    const providerData = isManual
      ? { providerCode: provider.code, status: "pending" }
      : await createPayment({ provider, cart: { ...reservedQuote.cart, subtotal: reservedQuote.pricing.subtotal }, amount: reservedQuote.pricing.total, currency: reservedQuote.currencyCode.toLowerCase(), idempotencyKey: paymentSession.idempotencyKey });
    await (context.prisma as any).$transaction(async (tx: any) => {
      const current = await tx.paymentSession.findUnique({ where: { id: paymentSession.id } });
      if (!current?.isSelected || ["cancelled", "cancelling"].includes(current.data?.state)) throw new Error("Checkout was cancelled during initiation");
      if (!current.isInitiated) await tx.paymentSession.update({ where: { id: current.id }, data: { isInitiated: true, data: { ...providerData, providerCode: provider.code, state: "ready", checkoutQuote: reservedQuote } } });
    }, { isolationLevel: "Serializable" });
    return sudo.query.PaymentSession.findOne({ where: { id: paymentSession.id }, query: SESSION_QUERY });
  } catch (error) {
    const current = await (context.prisma as any).paymentSession.findUnique({ where: { id: paymentSession.id } });
    if (!current?.isInitiated && current?.isSelected && current.data?.state === "provider_pending") await (context.prisma as any).paymentSession.update({ where: { id: paymentSession.id }, data: { data: { ...current.data, state: "unknown", error: "Provider initiation outcome is uncertain; retry the original attempt" } } });
    throw error;
  }
}
