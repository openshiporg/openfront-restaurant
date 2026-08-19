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
};

function boundedText(value: unknown, field: string, maximum: number) {
  if (value == null) return undefined;
  if (typeof value !== "string") throw new Error(`${field} must be text`);
  const normalized = value.trim();
  if (normalized.length > maximum) throw new Error(`${field} cannot exceed ${maximum} characters`);
  return normalized;
}

export default async function updateActiveCart(
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
      user { id }
      order { id }
    `,
  });
  if (!cart) throw new Error("Cart not found");
  if (cart.order?.id) throw new Error("Completed carts cannot be changed");

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
  if (!ALLOWED_ORDER_TYPES.has(nextOrderType)) throw new Error("Invalid order type");
  if (data.tipPercent != null && !ALLOWED_TIP_PERCENTS.has(data.tipPercent)) {
    throw new Error("Invalid tip percentage");
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
    user: userId ? { connect: { id: userId } } : undefined,
  };

  return sudo.db.Cart.updateOne({
    where: { id: cartId },
    data: updateData,
  });
}
