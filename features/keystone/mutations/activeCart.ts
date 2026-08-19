import { Context } from ".keystone/types";
import { assertCanAccessCart } from "../utils/cartAccess";
import { calculateRestaurantTotals } from "../../lib/restaurant-order-pricing";

export default async function activeCart(root: any, { cartId }: { cartId?: string }, context: Context) {
  const sudoContext = context.sudo();
  
  if (!cartId) {
    throw new Error("Cart ID is required");
  }

  try {
    await assertCanAccessCart(context, cartId, "read");
  } catch (error) {
    if (error instanceof Error && (error.message === "Cart not found" || error.message === "Access denied")) {
      return null;
    }
    throw error;
  }

  const cart = await sudoContext.query.Cart.findOne({
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
      paymentCollection {
        id
        paymentSessions {
          id
          isSelected
          isInitiated
          amount
          data
          paymentProvider {
            id
            code
          }
        }
      }
      order {
        id
      }
    `
  });

  if (!cart) {
    return null;
  }

  const settings = await sudoContext.query.StoreSettings.findOne({
    where: { id: "1" },
    query: `currencyCode deliveryFee deliveryMinimum pickupDiscount taxRate`,
  });
  const currencyCode = settings?.currencyCode || "USD";
  const totals = calculateRestaurantTotals({
    subtotal: cart.subtotal || 0,
    orderType: cart.orderType,
    tipPercent: cart.tipPercent,
    deliveryFee: settings?.deliveryFee,
    deliveryMinimum: settings?.deliveryMinimum,
    pickupDiscountPercent: settings?.pickupDiscount,
    taxRate: settings?.taxRate,
    currencyCode,
  });

  return {
    ...cart,
    ...totals,
    currencyCode,
  };
}
