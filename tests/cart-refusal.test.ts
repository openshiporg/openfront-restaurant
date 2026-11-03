import assert from "node:assert/strict";
import test from "node:test";
import { GraphQLError } from "graphql";
import { assertCanAccessCart, assertCanAccessCartItem } from "../features/keystone/utils/cartAccess";

function context(userId: string | undefined, cart: { id: string; user: { id: string } | null } | null) {
  const ctx: any = { session: userId ? { itemId: userId, listKey: "User", data: { isActive: true, role: null } } : undefined, req: { headers: {} } };
  ctx.sudo = () => ({ query: {
    Cart: { findOne: async ({ query }: any) => (query.includes("paymentCollection") ? { paymentCollection: null } : cart) },
    CartItem: { findOne: async () => (cart ? { id: "line", cart } : null) },
  } });
  return ctx;
}
const refused = (message: string) => (error: unknown) =>
  error instanceof GraphQLError && error.message === message && error.extensions.code === "CART_NOT_FOUND";

test("someone else's cart is a clear GraphQL refusal, not a masked plain Error", async () => {
  await assert.rejects(assertCanAccessCart(context("stranger", { id: "c1", user: { id: "owner" } }), "c1", "write"), refused("Cart not found"));
  await assert.rejects(assertCanAccessCartItem(context("stranger", { id: "c1", user: { id: "owner" } }), "line", "write"), refused("Cart not found"));
});
test("missing carts and anonymous callers without proof get the same refusal", async () => {
  await assert.rejects(assertCanAccessCart(context("stranger", null), "c404", "read"), refused("Cart not found"));
  await assert.rejects(assertCanAccessCart(context(undefined, { id: "c1", user: null }), "c1", "read"), refused("Cart not found"));
  await assert.rejects(assertCanAccessCartItem(context(undefined, { id: "c1", user: null }), "line", "write"), refused("Cart item not found"));
});
test("the owner still reaches the cart", async () => {
  const cart = await assertCanAccessCart(context("owner", { id: "c1", user: { id: "owner" } }), "c1", "write");
  assert.equal(cart.id, "c1");
});
