import { shopperError } from "../utils/shopperError";
import { cartMutationTransaction, touchMutableCart } from "../utils/cartMutationTransaction";
import type { Context } from ".keystone/types";
import { permissions } from "../access";
import { assertCanAccessCart } from "../utils/cartAccess";
import {
  assertDeliveryAddressComplete,
  assertDeliveryAddressEligible,
  assertDeliveryModeAllowed,
  getStoreDeliverySettings,
  normalizeDeliveryFields,
} from "../utils/deliveryValidation";
import { checkScheduledTime } from "../../lib/order-ahead";

const ALLOWED_TIP_PERCENTS = new Set(["0", "15", "18", "20", "25"]);
const ALLOWED_ORDER_TYPES = new Set(["pickup", "delivery"]);

type ActiveCartUpdateInput = {
  orderType?: string | null;
  email?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  deliveryAddress?: string | null;
  deliveryAddress2?: string | null;
  deliveryCity?: string | null;
  deliveryState?: string | null;
  deliveryZip?: string | null;
  deliveryCountryCode?: string | null;
  tipPercent?: string | null;
  userId?: string | null;
  /** ISO time for order ahead; "" or null means as soon as possible. */
  scheduledFor?: string | null;
};

function boundedText(value: unknown, field: string, maximum: number) {
  if (value == null) return undefined;
  if (typeof value !== "string") throw shopperError(`${field} must be text`, "INVALID_CART_INPUT");
  const normalized = value.trim();
  if (normalized.length > maximum) throw shopperError(`${field} cannot exceed ${maximum} characters`, "INVALID_CART_INPUT");
  return normalized;
}

async function updateActiveCart(
  _root: unknown,
  { cartId, data }: { cartId: string; data: ActiveCartUpdateInput },
  context: Context
) {
  await assertCanAccessCart(context, cartId, "write");
  const sudo = context.sudo();

  const cart = await sudo.query.Cart.findOne({
    where: { id: cartId },
    query: `
      id
      orderType
      deliveryAddress
      deliveryAddress2
      deliveryCity
      deliveryState
      deliveryCountryCode
      deliveryZip
      scheduledFor
      user { id }
      order { id }
    `,
  });
  if (!cart) throw new Error("Cart not found");
  if (cart.order?.id) throw shopperError("Completed carts cannot be changed", "CART_COMPLETED");
  await touchMutableCart(context, cartId);

  const deliveryInput = Object.fromEntries(
    Object.entries({
      deliveryAddress: data.deliveryAddress,
      deliveryAddress2: data.deliveryAddress2,
      deliveryCity: data.deliveryCity,
      deliveryState: data.deliveryState,
      deliveryZip: data.deliveryZip,
      deliveryCountryCode: data.deliveryCountryCode,
    }).filter(([, value]) => value !== undefined)
  );
  const normalizedDelivery = normalizeDeliveryFields(deliveryInput);
  const nextOrderType = data.orderType ?? cart.orderType ?? "pickup";
  if (!ALLOWED_ORDER_TYPES.has(nextOrderType)) throw shopperError("Invalid order type", "INVALID_ORDER_TYPE");
  if (data.tipPercent != null && !ALLOWED_TIP_PERCENTS.has(data.tipPercent)) {
    throw shopperError("Invalid tip percentage", "INVALID_TIP");
  }

  const storeSettings = await getStoreDeliverySettings(context);
  assertDeliveryModeAllowed({ orderType: nextOrderType, storeSettings });

  const isUpdatingDeliveryAddress = Object.values(normalizedDelivery).some(
    (value) => value !== undefined
  );
  if (isUpdatingDeliveryAddress) {
    const delivery = {
      orderType: nextOrderType,
      deliveryAddress: normalizedDelivery.deliveryAddress ?? cart.deliveryAddress,
      deliveryCity: normalizedDelivery.deliveryCity ?? cart.deliveryCity,
      deliveryCountryCode:
        normalizedDelivery.deliveryCountryCode ?? cart.deliveryCountryCode,
      deliveryZip: normalizedDelivery.deliveryZip ?? cart.deliveryZip,
    };
    assertDeliveryAddressComplete(delivery);
    assertDeliveryAddressEligible({
      ...delivery,
      storeSettings,
    });
  }

  // Order ahead: validate a chosen time against store hours and prep time. Changing between
  // pickup and delivery changes the prep time, so a kept time is re-checked too.
  let scheduledFor: Date | null | undefined;
  if (data.scheduledFor !== undefined || (data.orderType && data.orderType !== cart.orderType && cart.scheduledFor)) {
    const requested = data.scheduledFor !== undefined ? data.scheduledFor : cart.scheduledFor;
    if (!requested) scheduledFor = null;
    else {
      const hoursSettings = await sudo.query.StoreSettings.findOne({ where: { id: "1" }, query: "timezone hours estimatedPickup estimatedDelivery" });
      const check = checkScheduledTime(hoursSettings, nextOrderType, requested);
      if (!check.ok) {
        if (data.scheduledFor !== undefined) throw shopperError(check.message, "SCHEDULED_TIME_UNAVAILABLE");
        scheduledFor = null;
      } else scheduledFor = new Date(requested);
    }
  }

  let userId: string | undefined;
  if (data.userId) {
    const canAssignAnotherUser = permissions.canManageOrders({ session: context.session });
    if (!canAssignAnotherUser && data.userId !== context.session?.itemId) {
      throw new Error("Cart owner must match the authenticated customer");
    }
    const user = await sudo.query.User.findOne({ where: { id: data.userId }, query: "id" });
    if (!user) throw new Error("Customer not found");
    userId = user.id;
  }

  const updateData = {
    orderType: nextOrderType,
    email: boundedText(data.email, "Email", 320),
    customerName: boundedText(data.customerName, "Customer name", 160),
    customerPhone: boundedText(data.customerPhone, "Phone", 64),
    ...normalizedDelivery,
    tipPercent: data.tipPercent ?? undefined,
    scheduledFor,
    user: userId ? { connect: { id: userId } } : undefined,
  };

  return sudo.db.Cart.updateOne({
    where: { id: cartId },
    data: updateData,
  });
}

export default function updateActiveCartTransactional(...args: Parameters<typeof updateActiveCart>) {
  return cartMutationTransaction(args[2], (tx) => updateActiveCart(args[0], args[1], tx));
}
