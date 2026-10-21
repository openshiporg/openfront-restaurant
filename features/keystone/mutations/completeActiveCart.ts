/**
 * completeActiveCart aligned to the active selected payment-session flow.
 * Selected PaymentSession is the only payment source of truth.
 */
import type { Context } from ".keystone/types";
import { getPaymentStatus, capturePayment } from "../utils/paymentProviderAdapter";
import { calculateRestaurantTotals } from "../../lib/restaurant-order-pricing";
import { assertCanAccessCart } from "../utils/cartAccess";
import {
  assertDeliveryAddressComplete,
  assertDeliveryAddressEligible,
  getStoreDeliverySettings,
} from "../utils/deliveryValidation";
import { isKitchenActiveOrderStatus, syncKitchenTicketsForOrder } from "../utils/kitchenTicketSync";
import { validateCartItemInput } from "../utils/cartItemValidation";
import { appendAuditEventWithClient } from "../utils/audit";
import { freezeOrderPricingPolicy, getOrderPricingPolicy } from "../utils/orderPricingPolicy";
import { attachCheckoutRecipeWithClient } from "../utils/inventoryRecipeSnapshot";
import { enqueueRestaurantNotification } from "../utils/restaurantNotifications";
import { issueReceiptWithClient } from "../utils/receipt";
import { assertCapturedCheckoutPayment, assertCheckoutProviderObservation } from "../utils/checkoutProviderObservation";
import { assertCheckoutQuoteState } from "../utils/checkoutReservation";

const VERIFIED_PROVIDER_CHECKOUT = Symbol("verified-provider-checkout");

async function assertLiveCheckoutQuote(tx: any, input: {
  cartId: string;
  paymentCollectionId: string | null;
  sessionId: string;
  providerId: string;
  quote: any;
}) {
  const liveCart = await tx.cart.findUnique({
    where: { id: input.cartId },
    include: {
      user: { select: { id: true } },
      items: { include: { menuItem: { select: { id: true } }, modifiers: { select: { id: true } } } },
    },
  });
  const liveSession = await tx.paymentSession.findUnique({ where: { id: input.sessionId } });
  assertCheckoutQuoteState({
    cart: liveCart,
    session: liveSession,
    quote: input.quote,
    cartId: input.cartId,
    paymentCollectionId: input.paymentCollectionId,
    providerId: input.providerId,
    sessionId: input.sessionId,
  });
  return liveSession;
}

interface CompleteActiveCartArgs {
  cartId: string;
  paymentSessionId?: string;
}

export default async function completeActiveCart(
  root: any,
  { cartId, paymentSessionId }: CompleteActiveCartArgs,
  context: Context,
  internal?: { token: symbol; providerId: string; providerPaymentId: string }
) {
  const sudoContext = context.sudo();

  if (internal?.token !== VERIFIED_PROVIDER_CHECKOUT) await assertCanAccessCart(context, cartId, "checkout");

  let cart = await sudoContext.query.Cart.findOne({
    where: { id: cartId },
    query: `
      id
      orderType
      subtotal
      email
      customerName
      customerPhone
      deliveryAddress
      deliveryAddress2
      deliveryCity
      deliveryState
      deliveryZip
      deliveryCountryCode
      tipPercent
      user { id }
      order { id orderNumber secretKey status }
      paymentCollection {
        id
        amount
        paymentSessions {
          id
          idempotencyKey
          isSelected
          isInitiated
          amount
          data
          paymentProvider {
            id
            code
            capturePaymentFunction
            getPaymentStatusFunction
          }
        }
      }
      items {
        id
        thumbnail
        quantity
        specialInstructions
        menuItem {
          id
          name
          price
          thumbnail
        }
        modifiers {
          id
          name
          priceAdjustment
        }
      }
    `,
  });

  if (!cart) throw new Error("Cart not found");
  if (cart.order?.id) {
    if (isKitchenActiveOrderStatus(cart.order.status)) await syncKitchenTicketsForOrder(cart.order.id, context);
    return cart.order;
  }
  if (!cart.items?.length) throw new Error("Cart is empty");

  const selectedSession = paymentSessionId
    ? cart.paymentCollection?.paymentSessions?.find(
        (session: any) => session.id === paymentSessionId
      )
    : cart.paymentCollection?.paymentSessions?.find((session: any) => session.isSelected);

  if (!selectedSession) {
    throw new Error("No selected payment session found for this cart.");
  }

  if (!selectedSession.isSelected || (selectedSession.data as any)?.state === "cancelled") throw new Error("Payment session was cancelled or replaced; refresh checkout");

  const sessionData = (selectedSession.data || {}) as Record<string, any>;
  // The durable server-priced quote predates provider confirmation. Never
  // reprice or reject its purchased menu snapshots after money has moved.
  const quote = sessionData.checkoutQuote;
  if (quote?.version === 1) cart = { ...cart, ...quote.cart, paymentCollection: cart.paymentCollection };
  const validatedItems = quote?.version === 1 ? quote.items : await Promise.all(
    cart.items.map((item: any) =>
      validateCartItemInput(context, {
        menuItemId: item.menuItem?.id,
        quantity: item.quantity,
        modifierIds: (item.modifiers || []).map((modifier: any) => modifier.id),
        specialInstructions: item.specialInstructions,
      })
    )
  );


  let paymentData: Record<string, any> = { ...sessionData };

  const providerCode = selectedSession.paymentProvider?.code || sessionData?.providerCode;
  const providerPaymentId = sessionData?.paymentIntentId || sessionData?.orderId;
  const paymentProvider = selectedSession.paymentProvider;

  if (internal?.token === VERIFIED_PROVIDER_CHECKOUT && (paymentProvider?.id !== internal.providerId || providerPaymentId !== internal.providerPaymentId || !quote)) throw new Error("Verified provider event does not match this checkout quote");

  if (!paymentProvider) {
    throw new Error("Selected payment session is missing payment provider information.");
  }

  const isManual =
    providerCode === "pp_system_default" || providerCode?.startsWith("pp_manual");
  let paymentResult: { status: string; paymentIntentId: string | null } = {
    status: "manual_pending",
    paymentIntentId: null,
  };

  const settings = await getStoreDeliverySettings(context);
  const currencyCode = quote?.currencyCode || settings?.currencyCode || "USD";
  const subtotal = validatedItems.reduce(
    (sum: number, item: any) => sum + item.unitPrice * item.quantity,
    0
  );

  if (!quote) assertDeliveryAddressComplete({
    orderType: cart.orderType,
    deliveryAddress: cart.deliveryAddress,
    deliveryCity: cart.deliveryCity,
    deliveryCountryCode: cart.deliveryCountryCode,
    deliveryZip: cart.deliveryZip,
  });

  if (!quote) assertDeliveryAddressEligible({
    orderType: cart.orderType,
    storeSettings: settings,
    deliveryCountryCode: cart.deliveryCountryCode,
    deliveryZip: cart.deliveryZip,
  });

  const { tax, tip, pickupDiscount, deliveryFee, total, deliveryMinimumNotMet } = quote?.pricing || calculateRestaurantTotals({
    subtotal,
    orderType: cart.orderType,
    tipPercent: cart.tipPercent,
    deliveryFee: settings?.deliveryFee,
    deliveryMinimum: settings?.deliveryMinimum,
    pickupDiscountPercent: settings?.pickupDiscount,
    taxRate: settings?.taxRate,
    currencyCode,
  });

  if (deliveryMinimumNotMet) {
    throw new Error(`Delivery orders require a minimum subtotal of ${settings?.deliveryMinimum || "0.00"}.`);
  }

  const orderTypeMap: Record<string, string> = {
    pickup: "takeout",
    delivery: "delivery",
  };

  const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}-${require("crypto").randomBytes(3).toString("hex").toUpperCase()}`;
  const customerId = cart.user?.id;
  const secretKey = !customerId ? require("crypto").randomBytes(32).toString("hex") : "";
  const isDeliveryOrder = cart.orderType === "delivery";
  if (Number(selectedSession.amount || 0) !== total && !isManual) {
    throw new Error("Cart total changed. Please return to payment and confirm your payment method again.");
  }

  const prisma = context.prisma as any;
  if (quote?.version === 1) {
    await prisma.$transaction(async (tx: any) => {
      const current = await assertLiveCheckoutQuote(tx, {
        cartId,
        paymentCollectionId: cart.paymentCollection?.id || null,
        sessionId: selectedSession.id,
        providerId: paymentProvider.id,
        quote,
      });
      if (!isManual) {
        await tx.paymentSession.update({ where: { id: current.id }, data: { data: { ...current.data, state: "finalizing" } } });
      }
    }, { isolationLevel: "Serializable" });
  } else if (!isManual) {
    await prisma.$transaction(async (tx: any) => {
      const current = await tx.paymentSession.findUnique({ where: { id: selectedSession.id } });
      if (!current?.isSelected || ["cancelled", "cancelling"].includes(current.data?.state)) throw new Error("Checkout is being cancelled; no capture was started");
      await tx.paymentSession.update({ where: { id: current.id }, data: { data: { ...current.data, state: "finalizing" } } });
    }, { isolationLevel: "Serializable" });
  }

  if (!isManual) {
    if (!providerPaymentId) {
      throw new Error("Selected payment session is missing provider payment data.");
    }
    try {
    const status = await getPaymentStatus({
      provider: paymentProvider,
      paymentId: providerPaymentId,
    });

    assertCheckoutProviderObservation(status, total, currencyCode);
    if (status.status === "succeeded") {
      paymentResult = { status: "succeeded", paymentIntentId: providerPaymentId };
    } else if (status.status === "requires_capture") {
      const captured = await capturePayment({
        provider: paymentProvider,
        paymentId: providerPaymentId,
        amount: total,
        idempotencyKey: `capture:${selectedSession.idempotencyKey || selectedSession.id}`,
      });
      assertCapturedCheckoutPayment(captured, total, currencyCode);
      const captureId =
        captured.data?.purchase_units?.[0]?.payments?.captures?.[0]?.id ||
        captured.data?.id ||
        null;
      paymentData = {
        ...paymentData,
        capture: captured.data || captured,
        captureId,
      };
      const capturedStatus = await getPaymentStatus({
        provider: paymentProvider,
        paymentId: providerPaymentId,
      });
      assertCheckoutProviderObservation(capturedStatus, total, currencyCode);
      paymentResult = {
        status: "succeeded",
        paymentIntentId: providerPaymentId,
      };
    } else {
      throw new Error(`Payment not successful. Status: ${status.status}`);
    }

    if (paymentResult.status === "failed") {
      throw new Error("Payment capture failed");
    }
    } catch (error) {
      const current = await (context.prisma as any).paymentSession.findUnique({ where: { id: selectedSession.id } });
      if (current?.data?.state === "finalizing") await (context.prisma as any).paymentSession.update({ where: { id: current.id }, data: { data: { ...current.data, state: "unknown" } } });
      throw error;
    }
  }


  const paymentMethodMap: Record<string, string> = {
    pp_stripe_stripe: "credit_card",
    pp_paypal_paypal: "paypal",
    pp_system_default: "cash",
  };
  const paymentIdempotencyKey = `checkout:${selectedSession.idempotencyKey || selectedSession.id}`;
  const result = await prisma.$transaction(async (tx: any) => {
    const lockedCart = await tx.cart.findUnique({
      where: { id: cartId },
      include: {
        user: { select: { id: true } },
        items: { include: { menuItem: { select: { id: true } }, modifiers: { select: { id: true } } } },
      },
    });
    if (!lockedCart) throw new Error("Cart not found");
    if (lockedCart.orderId) {
      const existingOrder = await tx.restaurantOrder.findUnique({ where: { id: lockedCart.orderId } });
      return { order: existingOrder, payment: null, replay: true };
    }

    const currentSession = await tx.paymentSession.findUnique({ where: { id: selectedSession.id } });
    if (!currentSession?.isSelected || ["cancelled", "cancelling"].includes(currentSession.data?.state)) throw new Error("Checkout was cancelled before order placement; reconcile its payment if needed");
    if (quote?.version === 1) assertCheckoutQuoteState({
      cart: lockedCart,
      session: currentSession,
      quote,
      cartId,
      paymentCollectionId: cart.paymentCollection?.id || null,
      providerId: paymentProvider.id,
      sessionId: selectedSession.id,
    });
    const order = await tx.restaurantOrder.create({
      data: {
        orderNumber,
        orderType: orderTypeMap[cart.orderType || "pickup"] || "takeout",
        orderSource: "online",
        status: isManual ? "open" : "sent_to_kitchen",
        guestCount: 1,
        subtotal,
        tax,
        tip,
        discount: pickupDiscount,
        total,
        currencyCode,
        customerId: customerId || null,
        customerName: cart.customerName || "",
        customerEmail: cart.email || "",
        customerPhone: cart.customerPhone || "",
        deliveryAddress: isDeliveryOrder ? cart.deliveryAddress || "" : "",
        deliveryAddress2: isDeliveryOrder ? cart.deliveryAddress2 || "" : "",
        deliveryCity: isDeliveryOrder ? cart.deliveryCity || "" : "",
        deliveryState: isDeliveryOrder ? cart.deliveryState || "" : "",
        deliveryZip: isDeliveryOrder ? cart.deliveryZip || "" : "",
        deliveryCountryCode: isDeliveryOrder ? cart.deliveryCountryCode || "" : "",
        secretKey,

      },
    });
    if (quote?.pricingPolicy) await freezeOrderPricingPolicy(tx, order.id, quote.pricingPolicy, context.session?.itemId);
    else await getOrderPricingPolicy(tx, order.id, settings);
    const snapshotItems = validatedItems.map((item: any) => ({
            quantity: item.quantity,
            price: item.unitPrice,
            itemNameSnapshot: item.menuItem.name,
            itemThumbnailSnapshot: item.menuItem.thumbnail || "",
            kitchenStationSnapshot: item.menuItem.kitchenStation || "expo",
            menuItemIdSnapshot: item.menuItem.id,
            modifiersSnapshot: item.modifiers.map((modifier: any) => ({
              id: modifier.id,
              name: modifier.name,
              modifierGroup: modifier.modifierGroup,
              modifierGroupLabel: modifier.modifierGroupLabel || null,
              priceAdjustment: modifier.priceAdjustment,
            })),
            specialInstructions: item.specialInstructions,
            menuItemId: quote ? null : item.menuItem.id,
            appliedModifiers: !quote && item.modifiers.length
              ? { connect: item.modifiers.map((modifier: any) => ({ id: modifier.id })) }
              : undefined,
          }));
    for (const [index, snapshot] of snapshotItems.entries()) {
      const item = await tx.orderItem.create({ data: { ...snapshot, orderId: order.id, originalOrderIdSnapshot: order.id } });
      if (quote) await attachCheckoutRecipeWithClient(tx, selectedSession.id, index, item.id, context.session?.itemId);
    }
    const payment = await tx.payment.create({
      data: {
        idempotencyKey: paymentIdempotencyKey,
        reservedAt: new Date(),
        amount: total,
        status: paymentResult.status === "succeeded" ? "succeeded" : "pending",
        paymentMethod: paymentMethodMap[providerCode || "pp_system_default"] || "cash",
        currencyCode,
        tipAmount: tip,
        providerPaymentId: paymentResult.paymentIntentId || "",
        data: paymentData || {},
        processedAt: paymentResult.status === "succeeded" ? new Date() : null,
        orderId: order.id,
        paymentProviderId: paymentProvider.id,
        paymentCollectionId: cart.paymentCollection?.id || null,
      },
    });
    if (cart.paymentCollection?.id) {
      await tx.paymentCollection.update({ where: { id: cart.paymentCollection.id }, data: { amount: total } });
    }
    if (isManual && !quote && Number(selectedSession.amount || 0) !== total) {
      await tx.paymentSession.update({ where: { id: selectedSession.id }, data: { amount: total } });
    }
    await tx.cart.update({ where: { id: cartId }, data: { orderId: order.id } });
    await appendAuditEventWithClient(tx, context.session?.itemId, {
      eventKey: `checkout-completed:${order.id}`,
      eventType: "checkout.completed",
      entityType: "RestaurantOrder",
      entityId: order.id,
      after: { total, paymentStatus: payment.status },
      metadata: { paymentSessionId: selectedSession.id, paymentIdempotencyKey },
    });
    if (payment.status === "succeeded") {
      await issueReceiptWithClient(tx, context.session?.itemId, {
        kind: "sale",
        entityId: payment.id,
        orderId: order.id,
        paymentId: payment.id,
        amount: total,
        currencyCode,
        snapshot: {
          orderNumber: order.orderNumber,
          items: validatedItems,
          subtotal,
          tax,
          tip,
          discount: pickupDiscount,
          deliveryFee,
          total,
        },
      });
    }
    await enqueueRestaurantNotification(tx, context.session?.itemId, {
      eventKey: `notification:order-confirmed:${order.id}`, entityType: "RestaurantOrder", entityId: order.id,
      to: cart.email || "", subject: `Order ${order.orderNumber} received`,
      text: `Your ${order.orderType} order ${order.orderNumber} has been received. Total: ${total} minor units ${currencyCode}. Payment: ${payment.status}. Please contact the restaurant with your order number for changes.`,
    });
    return { order, payment, replay: false };
  }, { isolationLevel: "Serializable" });

  if (isKitchenActiveOrderStatus(result.order.status)) {
    await syncKitchenTicketsForOrder(result.order.id, context);
  }
  return {
    id: result.order.id,
    orderNumber: result.order.orderNumber,
    secretKey: result.order.secretKey,
    status: result.order.status,
  };
}

/** Internal capability used only after webhook signature and provider-scoped session correlation. */
export async function completeVerifiedCheckout(context: Context, input: { cartId: string; paymentSessionId: string; providerId: string; providerPaymentId: string }) {
  return completeActiveCart(null, input, context, { token: VERIFIED_PROVIDER_CHECKOUT, providerId: input.providerId, providerPaymentId: input.providerPaymentId });
}
