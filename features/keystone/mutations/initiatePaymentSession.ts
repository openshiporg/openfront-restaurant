import crypto from "crypto";
import type { Context } from ".keystone/types";
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
  await assertCanAccessCart(context, cartId, "write");
  const sudo = context.sudo();
  const cart = await sudo.query.Cart.findOne({
    where: { id: cartId },
    query: `
      id updatedAt orderType deliveryAddress deliveryCity deliveryCountryCode deliveryZip tipPercent
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

  const validatedItems = await Promise.all(
    cart.items.map((item: any) => validateCartItemInput(context, {
      menuItemId: item.menuItem?.id,
      quantity: item.quantity,
      modifierIds: (item.modifiers || []).map((modifier: any) => modifier.id),
      specialInstructions: item.specialInstructions,
    }))
  );
  const subtotal = validatedItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const settings = await getStoreDeliverySettings(context);
  const currency = settings?.currencyCode || "USD";
  assertDeliveryAddressComplete({
    orderType: cart.orderType,
    deliveryAddress: cart.deliveryAddress,
    deliveryCity: cart.deliveryCity,
    deliveryCountryCode: cart.deliveryCountryCode,
    deliveryZip: cart.deliveryZip,
  });
  assertDeliveryAddressEligible({
    orderType: cart.orderType,
    storeSettings: settings,
    deliveryCountryCode: cart.deliveryCountryCode,
    deliveryZip: cart.deliveryZip,
  });

  const pricing = calculateRestaurantTotals({
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
  const idempotencyKey = sessionKey({
    cartId,
    cartUpdatedAt: cart.updatedAt,
    provider: provider.code,
    amount,
    items: validatedItems.map((item) => ({
      menuItemId: item.menuItem.id,
      quantity: item.quantity,
      modifierIds: item.modifiers.map((modifier: any) => modifier.id).sort(),
      specialInstructions: item.specialInstructions,
    })),
  });

  let collection = cart.paymentCollection;
  if (!collection) {
    collection = await sudo.query.PaymentCollection.createOne({
      data: { cart: { connect: { id: cart.id } }, amount, description: "default" },
      query: "id amount paymentSessions { id idempotencyKey isSelected isInitiated amount data paymentProvider { id code } }",
    });
  } else if (Number(collection.amount || 0) !== amount) {
    await sudo.query.PaymentCollection.updateOne({ where: { id: collection.id }, data: { amount } });
  }

  let paymentSession = collection.paymentSessions?.find(
    (candidate: any) => candidate.idempotencyKey === idempotencyKey
  );
  if (!paymentSession) {
    try {
      paymentSession = await sudo.query.PaymentSession.createOne({
        data: {
          paymentCollection: { connect: { id: collection.id } },
          paymentProvider: { connect: { id: provider.id } },
          amount,
          idempotencyKey,
          isSelected: true,
          isInitiated: false,
          data: { providerCode: provider.code, state: "initializing" },
        },
        query: SESSION_QUERY,
      });
    } catch (error) {
      const matches = await sudo.query.PaymentSession.findMany({
        where: { idempotencyKey: { equals: idempotencyKey } },
        query: SESSION_QUERY,
        take: 1,
      });
      paymentSession = matches[0];
      if (!paymentSession) throw error;
    }
  }

  for (const candidate of collection.paymentSessions || []) {
    if (candidate.id !== paymentSession.id && candidate.isSelected) {
      await sudo.query.PaymentSession.updateOne({ where: { id: candidate.id }, data: { isSelected: false } });
    }
  }
  if (paymentSession.isInitiated) {
    if (!paymentSession.isSelected) {
      await sudo.query.PaymentSession.updateOne({ where: { id: paymentSession.id }, data: { isSelected: true } });
    }
    return sudo.query.PaymentSession.findOne({ where: { id: paymentSession.id }, query: SESSION_QUERY });
  }

  const isManual = provider.code === "pp_system_default" || provider.code.startsWith("pp_manual");
  try {
    const providerData = isManual
      ? { providerCode: provider.code, status: "pending" }
      : await createPayment({
          provider,
          cart: { ...cart, subtotal },
          amount,
          currency: currency.toLowerCase(),
          idempotencyKey,
        });
    return sudo.query.PaymentSession.updateOne({
      where: { id: paymentSession.id },
      data: {
        isSelected: true,
        isInitiated: true,
        data: { ...providerData, providerCode: provider.code, state: "ready" },
      },
      query: SESSION_QUERY,
    });
  } catch (error) {
    await sudo.query.PaymentSession.updateOne({
      where: { id: paymentSession.id },
      data: {
        data: {
          providerCode: provider.code,
          state: "failed",
          error: error instanceof Error ? error.message : "Provider initiation failed",
        },
      },
    });
    throw error;
  }
}
