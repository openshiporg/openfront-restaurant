import type { Context } from ".keystone/types";

const ALLOWED_ORDER_TYPES = new Set(["pickup", "delivery"]);

export default async function createActiveCart(
  _root: unknown,
  { orderType = "pickup" }: { orderType?: string | null },
  context: Context
) {
  const normalizedOrderType = ALLOWED_ORDER_TYPES.has(orderType || "") ? orderType! : "pickup";
  const userId = context.session?.itemId;

  return context.sudo().query.Cart.createOne({
    data: {
      orderType: normalizedOrderType,
      tipPercent: "0",
      user: userId ? { connect: { id: userId } } : undefined,
    },
    query: "id orderType tipPercent",
  });
}
