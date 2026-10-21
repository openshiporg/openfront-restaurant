import type { Context } from ".keystone/types";

import { createCartProof } from "../utils/cartProof";

const ALLOWED_ORDER_TYPES = new Set(["pickup", "delivery"]);

export default async function createActiveCart(
  _root: unknown,
  { orderType = "pickup" }: { orderType?: string | null },
  context: Context
) {
  if ((context.session as any)?.apiKeyId) throw new Error("Customer session required");
  const normalizedOrderType = ALLOWED_ORDER_TYPES.has(orderType || "") ? orderType! : "pickup";
  const userId = context.session?.itemId;

  const cart = await context.sudo().query.Cart.createOne({
    data: {
      orderType: normalizedOrderType,
      tipPercent: "0",
      user: userId ? { connect: { id: userId } } : undefined,
    },
    query: "id orderType tipPercent",
  });
  return { ...cart, accessProof: createCartProof(cart.id) };
}
