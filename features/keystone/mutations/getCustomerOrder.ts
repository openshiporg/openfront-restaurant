import { Context } from ".keystone/types";

export default async function getCustomerOrder(
  root: any,
  { orderId, secretKey }: { orderId: string; secretKey?: string },
  context: Context
) {
  const sudoContext = context.sudo();
  const sessionUserId = context.session?.itemId;

  const order = await sudoContext.query.RestaurantOrder.findOne({
    where: { id: orderId },
    query: `
      id
      orderNumber
      orderType
      orderSource
      status
      guestCount
      specialInstructions
      subtotal
      tax
      tip
      discount
      total
      customerName
      customerEmail
      customerPhone
      deliveryAddress
      deliveryAddress2
      deliveryCity
      deliveryState
      deliveryZip
      deliveryCountryCode
      secretKey
      createdAt
      updatedAt
      customer {
        id
      }
      orderItems {
        id
        thumbnail
        itemNameSnapshot
        itemThumbnailSnapshot
        modifiersSnapshot
        quantity
        unitPrice
        totalPrice
        specialInstructions
        menuItem {
          id
          name
          price
          thumbnail
        }
        modifiers: appliedModifiers {
          id
          name
          priceAdjustment
        }
      }
      payments {
        id
        amount
        paymentMethod
        status
        createdAt
      }
    `,
  });

  if (!order) {
    throw new Error("Order not found");
  }

  // If secretKey is provided, verify it matches
  if (secretKey) {
    if (order.secretKey !== secretKey) {
      throw new Error("Invalid secret key");
    }
    return order;
  }

  // If no secretKey, check user authentication
  if (!sessionUserId) {
    throw new Error("Not authenticated");
  }

  // Verify the order belongs to the user
  if (order.customer?.id === sessionUserId) {
    return order;
  }

  throw new Error("Order not found");
}
