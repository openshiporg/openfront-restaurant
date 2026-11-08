import * as cookie from "cookie";
import { GraphQLError } from "graphql";
import type { Context } from ".keystone/types";
import { isSignedIn, permissions } from "../access";
import { cartIdFromProof, verifyCartProof } from "./cartProof";

// Missing and foreign carts get the same clear refusal. A GraphQLError is not masked as
// "Unexpected error." by Yoga, and the message matches existing checks.
export function cartRefusal(message: "Cart not found" | "Cart item not found") {
  return new GraphQLError(message, { extensions: { code: "CART_NOT_FOUND" } });
}
type CartAccessMode = "read" | "write" | "checkout";
function requestProof(context: Context): string | undefined {
  const headers = context.req?.headers as Record<string, any> | undefined;
  const header = headers?.["x-restaurant-cart-proof"];
  if (typeof header === "string") return header;
  try { const jar = cookie.parse(headers?.cookie || ""); return jar._restaurant_cart_p || jar._restaurant_cart_proof; } catch { return undefined; }
}
function canBypass(context: Context, mode: CartAccessMode) {
  return permissions.canManageOrders({ session: context.session }) ||
    (mode === "read" && permissions.canReadOrders({ session: context.session }));
}
export async function assertCanAccessCart(context: Context, cartId: string, mode: CartAccessMode = "write") {
  const bypass = canBypass(context, mode);
  const proof = requestProof(context);
  const human = isSignedIn({ session: context.session });
  const validProof = verifyCartProof(proof, cartId);
  // Anonymous and scoped service callers cannot probe privileged cart lookups by ID.
  if (!bypass && !human && !validProof) throw cartRefusal("Cart not found");
  const cart = await context.sudo().query.Cart.findOne({ where: { id: cartId }, query: "id user { id }" });
  if (!cart) throw cartRefusal("Cart not found");
  if (!bypass) {
    const owner = human && cart.user?.id === context.session?.itemId;
    const guest = !cart.user?.id && validProof && !(context.session as any)?.apiKeyId;
    if (!owner && !guest) throw cartRefusal("Cart not found");
  }
  if (mode === "write") {
    const state = await context.sudo().query.Cart.findOne({
      where: { id: cartId }, query: "paymentCollection { paymentSessions { isSelected data paymentProvider { code } } }",
    });
    const reserved = state?.paymentCollection?.paymentSessions?.some((session: any) =>
      session.isSelected && session.data?.checkoutQuote &&
      ["initializing", "provider_pending", "ready", "unknown", "finalizing", "cancelling"].includes(session.data?.state));
    if (reserved) throw new Error("Checkout is reserved. Resolve or cancel its payment before changing this cart.");
  }
  return cart;
}
export async function assertCanAccessCartItem(context: Context, cartItemId: string, mode: CartAccessMode = "write") {
  const bypass = canBypass(context, mode);
  const proof = requestProof(context);
  const proofCartId = cartIdFromProof(proof);
  if (!bypass && !isSignedIn({ session: context.session })) {
    if (!proofCartId || !verifyCartProof(proof, proofCartId)) throw cartRefusal("Cart item not found");
    await assertCanAccessCart(context, proofCartId, mode);
  }
  // This projection contains no customer, amount or provider data.
  const item = await context.sudo().query.CartItem.findOne({ where: { id: cartItemId }, query: "id cart { id user { id } }" });
  if (!item?.cart?.id) throw cartRefusal("Cart item not found");
  await assertCanAccessCart(context, item.cart.id, mode);
  return item;
}
