import type { Context } from ".keystone/types";

/**
 * getCustomerOrders — List orders for the currently authenticated user.
 * Uses sudo() to bypass access control, then filters by customer.id === session.itemId.
 */
export default async function getCustomerOrders(
  root: any,
  { limit = 10, offset = 0 }: { limit?: number; offset?: number },
  context: Context
) {
  const sessionUserId = context.session?.itemId;

  if (!sessionUserId) {
    throw new Error("Not authenticated");
  }

  const sudoContext = context.sudo();

  const orders = await sudoContext.query.RestaurantOrder.findMany({
    where: {
      customer: { id: { equals: sessionUserId } },
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(50, Math.max(1, Number(limit) || 10)),
    skip: Math.max(0, Number(offset) || 0),
    query: `
      id
      orderNumber
      orderType
      status
      total
      createdAt
      customerName
      orderItems {
        id
        quantity
        price
        itemNameSnapshot
        itemThumbnailSnapshot
        modifiersSnapshot
        menuItem {
          id
          name
        }
      }
    `,
  });

  return orders;
}
