import { calculateRestaurantTotals } from "../../lib/restaurant-order-pricing";

type CheckoutCart = {
  subtotal?: number | string | null;
  orderType?: string | null;
  tipPercent?: number | string | null;
  items?: any[];
  paymentCollection?: { paymentSessions?: any[] } | null;
};

function selectedPaymentSession(cart: CheckoutCart) {
  return cart.paymentCollection?.paymentSessions?.find((session) => session.isSelected);
}

export function selectedCheckoutQuote(cart: CheckoutCart) {
  const quote = selectedPaymentSession(cart)?.data?.checkoutQuote;
  if (
    quote?.version !== 1 ||
    !quote.pricing ||
    !Number.isSafeInteger(Number(quote.pricing.total)) ||
    Number(quote.pricing.total) < 0
  ) return null;
  return quote;
}

export function checkoutDisplayPricing(cart: CheckoutCart, settings: any) {
  const quote = selectedCheckoutQuote(cart);
  if (quote) return quote.pricing;

  return calculateRestaurantTotals({
    subtotal: Number(cart.subtotal ?? 0),
    orderType: cart.orderType,
    tipPercent: Number(cart.tipPercent ?? 0),
    deliveryFee: settings?.deliveryFee ?? 0,
    deliveryMinimum: settings?.deliveryMinimum ?? 0,
    pickupDiscountPercent: Number(settings?.pickupDiscount ?? 0),
    taxRate: Number(settings?.taxRate ?? 0),
    currencyCode: settings?.currencyCode || "USD",
  });
}

export function checkoutDisplayItems(cart: CheckoutCart) {
  const quote = selectedCheckoutQuote(cart);
  if (!Array.isArray(quote?.items)) return cart.items || [];

  return quote.items.map((item: any, index: number) => ({
    id: cart.items?.[index]?.id || `checkout-quote-item-${index}`,
    quantity: item.quantity,
    specialInstructions: item.specialInstructions,
    thumbnail: item.menuItem?.thumbnail || null,
    menuItem: item.menuItem,
    modifiers: item.modifiers || [],
  }));
}

export function checkoutSessionMatchesPricing(session: any, pricing: { total?: unknown }) {
  const total = Number(pricing?.total);
  return Boolean(
    session &&
    Number.isSafeInteger(total) &&
    total >= 0 &&
    Number(session.amount) === total &&
    !["error", "cancelled"].includes(session.data?.state)
  );
}
