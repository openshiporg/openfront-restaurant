import assert from "node:assert/strict";
import test from "node:test";
import { GraphQLError } from "graphql";
import { shopperError } from "../features/keystone/utils/shopperError";
import { normalizeCartQuantity, normalizeSpecialInstructions, validateModifierSelections } from "../features/keystone/utils/cartItemValidation";
import { assertDeliveryAddressEligible } from "../features/keystone/utils/deliveryValidation";
import updateActiveCart from "../features/keystone/mutations/updateActiveCart";
import removeCartItem from "../features/keystone/mutations/removeCartItem";

const is = (message: string, code: string) => (e: unknown) =>
  e instanceof GraphQLError && e.message === message && e.extensions.code === code;

// Signed-in owner of cart c1. `cart` is what the sudo Cart lookups return.
function context(cart: any, fail?: Error) {
  const ctx: any = { session: { itemId: "owner", listKey: "User", data: { isActive: true, role: null } }, req: { headers: {} } };
  ctx.prisma = { cart: { update: async () => ({}) } };
  ctx.sudo = () => ({
    query: {
      Cart: { findOne: async ({ query }: any) => { if (fail) throw fail; return query.includes("paymentCollection") ? { paymentCollection: null } : cart; } },
      CartItem: { findOne: async () => ({ id: "i1", cart }) },
    },
  });
  ctx.transaction = async (op: any) => op(ctx);
  return ctx;
}
const mine = (extra: any = {}) => ({ id: "c1", orderType: "pickup", user: { id: "owner" }, order: null, ...extra });
const update = (data: any, ctx: any) => (updateActiveCart as any)(null, { cartId: "c1", data }, ctx);

test("invalid order type is INVALID_ORDER_TYPE (closed store not needed)", async () => {
  await assert.rejects(update({ orderType: "teleport" }, context(mine())), is("Invalid order type", "INVALID_ORDER_TYPE"));
});

test("a completed cart is CART_COMPLETED", async () => {
  await assert.rejects(update({ orderType: "pickup" }, context(mine({ order: { id: "o1" } }))), is("Completed carts cannot be changed", "CART_COMPLETED"));
  await assert.rejects((removeCartItem as any)(null, { cartId: "c1", itemId: "i1" }, context(mine({ order: { id: "o1" } }))), is("Completed carts cannot be changed", "CART_COMPLETED"));
});

test("invalid tip percentage is INVALID_TIP", async () => {
  await assert.rejects(update({ tipPercent: "999" }, context(mine())), is("Invalid tip percentage", "INVALID_TIP"));
});

test("quantity and instruction validation carry codes", () => {
  assert.throws(() => normalizeCartQuantity(0), is("Quantity must be a whole number between 1 and 99", "INVALID_QUANTITY"));
  assert.throws(() => normalizeSpecialInstructions("x".repeat(501)), is("Special instructions cannot exceed 500 characters", "INVALID_CART_INPUT"));
  assert.throws(() => validateModifierSelections([], ["m1", "m1"]), is("A modifier cannot be selected more than once", "INVALID_MODIFIERS"));
});

test("delivery rules are coded, setup problems stay masked", () => {
  assert.throws(() => assertDeliveryAddressEligible({ orderType: "delivery", storeSettings: { deliveryEnabled: false } }), is("Delivery is not available for this restaurant.", "DELIVERY_UNAVAILABLE"));
  assert.throws(
    () => assertDeliveryAddressEligible({ orderType: "delivery", storeSettings: { deliveryEnabled: true, countryCode: "US", deliveryPostalCodes: [] }, deliveryCountryCode: "US", deliveryZip: "10001" }),
    (e: unknown) => e instanceof Error && !(e instanceof GraphQLError),
  );
});

test("a foreign cart is still CART_NOT_FOUND", async () => {
  await assert.rejects(update({ orderType: "pickup" }, context(mine({ user: { id: "someone-else" } }))), is("Cart not found", "CART_NOT_FOUND"));
});

test("internal errors stay plain Errors (masked)", async () => {
  await assert.rejects(update({ orderType: "pickup" }, context(mine(), new Error("db down"))), (e: unknown) => e instanceof Error && !(e instanceof GraphQLError) && e.message === "db down");
});

test("shopperError carries the code", () => {
  assert.equal(shopperError("x", "Y").extensions.code, "Y");
});
