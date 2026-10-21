import assert from "node:assert/strict";
import test from "node:test";
import { createCartProof, verifyCartProof } from "../features/keystone/utils/cartProof";
import { assertCanAccessCart, assertCanAccessCartItem } from "../features/keystone/utils/cartAccess";
import { permissions, isSignedIn } from "../features/keystone/access";
import { apiKeyIsUsable, validApiKeyScopes } from "../features/keystone/utils/apiKeyPolicy";
import { authenticateApiKey, refreshHumanSession } from "../features/keystone/utils/requestAuthentication";
import { User } from "../features/keystone/models/User";
import { Discount } from "../features/keystone/models/Discount";
import { Recipe } from "../features/keystone/models/Recipe";
import { PaymentProvider } from "../features/keystone/models/PaymentProvider";
import { ApiKey } from "../features/keystone/models/ApiKey";
import updateActiveUser from "../features/keystone/mutations/updateActiveUser";
import { paymentAdapterPayload, executeAdapterFunction } from "../features/keystone/utils/paymentProviderAdapter";
const bcrypt = require("bcryptjs");
const secret = "test-only-not-a-live-secret-1234567890";
function session(role: any = {}, extra: any = {}) { return { itemId: "owner", listKey: "User", data: { isActive: true, role }, ...extra } as any; }
function field(list: any, key: string) { return list.fields[key]({ fieldKey: key, listKey: "Test", lists: {}, provider: "postgresql" }); }
function cartContext(options: { proof?: string; userId?: string; principal?: any; frozen?: boolean } = {}) {
  let reads = 0;
  const cart = { id: "cart123", user: options.userId ? { id: options.userId } : null };
  const context: any = { session: options.principal, req: { headers: options.proof ? { "x-restaurant-cart-proof": options.proof } : { cookie: "_restaurant_cart_id=cart123" } } };
  context.sudo = () => ({ query: {
    Cart: { findOne: async ({ query }: any) => { reads++; return query.includes("paymentCollection") ? { paymentCollection: { paymentSessions: options.frozen ? [{ isSelected: true, paymentProvider: { code: "pp_stripe" }, data: { checkoutQuote: {}, state: "unknown" } }] : [] } } : cart; } },
    CartItem: { findOne: async () => { reads++; return { id: "line", cart }; } },
  } });
  return { context, reads: () => reads };
}

test("guest cart proof rejects tampering, wrong cart, malformed data and expiry", () => {
  const proof = createCartProof("cart123", { secret, expiresAt: 1000 });
  assert.equal(verifyCartProof(proof, "cart123", { secret, now: 999 }), true);
  for (const candidate of [undefined, "cart123", proof + ".extra", proof.replace("cart123", "foreign"), proof.slice(0, -1) + "z"]) assert.equal(verifyCartProof(candidate, "cart123", { secret, now: 999 }), false);
  assert.equal(verifyCartProof(proof, "cart123", { secret, now: 1000 }), false);
  assert.equal(verifyCartProof(proof, "foreign", { secret, now: 999 }), false);
});

test("raw IDs fail before privileged reads; guest possession cannot access assigned carts", async () => {
  const anonymous = cartContext();
  await assert.rejects(assertCanAccessCart(anonymous.context, "cart123", "read"));
  assert.equal(anonymous.reads(), 0);
  await assert.rejects(assertCanAccessCartItem(anonymous.context, "line"));
  assert.equal(anonymous.reads(), 0);
  const proof = createCartProof("cart123");
  assert.equal((await assertCanAccessCart(cartContext({ proof }).context, "cart123", "read")).id, "cart123");
  await assert.rejects(assertCanAccessCart(cartContext({ proof, userId: "foreign" }).context, "cart123", "read"));
  await assert.rejects(assertCanAccessCart(cartContext({ proof, userId: "foreign", principal: session() }).context, "cart123", "read"));
  assert.equal((await assertCanAccessCart(cartContext({ userId: "owner", principal: session() }).context, "cart123", "read")).id, "cart123");
});

test("parent item ownership, reserved checkout freeze and retry are enforced", async () => {
  const proof = createCartProof("cart123");
  const guest = cartContext({ proof });
  assert.equal((await assertCanAccessCartItem(guest.context, "line")).id, "line");
  await assert.rejects(assertCanAccessCartItem(cartContext({ proof, userId: "foreign" }).context, "line"));
  const frozen = cartContext({ proof, frozen: true });
  await assert.rejects(assertCanAccessCart(frozen.context, "cart123", "write"), /reserved/);
  for (let attempt = 0; attempt < 2; attempt++) assert.equal((await assertCanAccessCart(frozen.context, "cart123", "checkout")).id, "cart123");
});

test("API permissions intersect current roles with scopes and never provide customer identity", () => {
  const admin = session({ canManagePayments: true, canReadOrders: true, canManagePeople: true });
  const key = { ...admin, apiKeyId: "key", apiKeyScopes: ["read_orders"] };
  assert.equal(permissions.canReadOrders({ session: key }), true);
  assert.equal(permissions.canManagePayments({ session: key }), false);
  assert.equal(permissions.canManagePeople({ session: key }), false);
  assert.equal(isSignedIn({ session: key }), false);
  assert.equal(permissions.canReadOrders({ session: { ...key, data: { isActive: true, role: {} } } }), false);
  assert.equal(permissions.canManagePayments({ session: { ...admin, data: { ...admin.data, isActive: false } } }), false);
  assert.equal(validApiKeyScopes(["read_orders"], admin.data.role), true);
  assert.equal(validApiKeyScopes(["write_orders"], admin.data.role), false);
  assert.equal(validApiKeyScopes(["invented"], admin.data.role), false);
});

test("API key expiry, revocation and socket IP restrictions fail closed", () => {
  const key = { status: "active", userId: "owner", scopes: ["read_orders"], restrictedToIPs: ["192.0.2.10"] };
  assert.equal(apiKeyIsUsable(key, { socket: { remoteAddress: "::ffff:192.0.2.10" } }), true);
  assert.equal(apiKeyIsUsable(key, { socket: { remoteAddress: "192.0.2.20" }, headers: { "x-forwarded-for": "192.0.2.10" } }), false);
  for (const patch of [{ status: "revoked" }, { expiresAt: "2020-01-01" }, { expiresAt: "broken" }, { userId: null }, { scopes: ["all"] }]) assert.equal(apiKeyIsUsable({ ...key, ...patch }, { socket: { remoteAddress: "192.0.2.10" } }), false);
});

test("hashed API authentication refreshes activity and never accepts an unhashed token", async () => {
  const token = `of_${"a".repeat(32)}`;
  const hash = await bcrypt.hash(token, 4);
  let active = true;
  let key: any = { id: "key", userId: "owner", status: "active", scopes: ["read_orders"], tokenSecret: hash };
  const context: any = { prisma: { apiKey: { update: async () => ({ id: "key" }) } }, req: { socket: { remoteAddress: "192.0.2.10" } }, sudo: () => ({ db: { ApiKey: { findMany: async () => [key], updateOne: async () => ({ id: "key" }) }, User: { findOne: async () => ({ id: "owner", isActive: active }) } } }) };
  assert.equal((await authenticateApiKey(context, token))?.apiKeyId, "key");
  assert.equal(await authenticateApiKey(context, `of_${"b".repeat(32)}`), undefined);
  active = false;
  assert.equal(await authenticateApiKey(context, token), undefined);
  assert.equal(await refreshHumanSession(context, session()), undefined);
  active = true;
  assert.equal((await refreshHumanSession(context, session()))?.itemId, "owner");
  assert.equal(await refreshHumanSession(context, session({}, { apiKeyId: "key" })), undefined);
  key = { ...key, tokenSecret: token };
  assert.equal(await authenticateApiKey(context, token), undefined);
});

test("real model field policies protect employment and credentials while retaining manager configuration", () => {
  const ordinary = { session: session() };
  const manager = { session: session({ canManageStaff: true, canManagePayments: true }) };
  for (const key of ["employeeId", "staffRole", "hireDate", "hourlyRate", "staffPermissions", "isActive", "certifications"]) {
    const policy = field(User, key).access;
    assert.equal(policy.create(ordinary), false, key);
    assert.equal(policy.update(ordinary), false, key);
    assert.equal(policy.update(manager), true, key);
  }
  const creds = field(PaymentProvider, "credentials").access;
  assert.equal(creds.read(ordinary), false);
  assert.equal(creds.read(manager), false);
  assert.equal(creds.update(ordinary), false);
  assert.equal(creds.update(manager), true);
  assert.equal(creds.update({ session: session({ canManagePayments: true }, { apiKeyId: "key", apiKeyScopes: ["write_payments"] }) }), false);
  assert.equal((Discount.access as any).operation.delete(ordinary), false);
  assert.equal((Discount.access as any).operation.delete({ session: session({ canManageDiscounts: true }) }), true);
});

test("recipes are unavailable to anonymous/customers and readable by authorized inventory/product roles", () => {
  const read = (Recipe.access as any).operation.query;
  assert.equal(read({}), false);
  assert.equal(read({ session: session() }), false);
  for (const permission of ["canReadInventory", "canManageInventory", "canReadProducts", "canManageProducts"]) assert.equal(read({ session: session({ [permission]: true }) }), true);
});

test("API ownership is assigned by backend, revoked keys cannot reactivate and unknown scopes fail", async () => {
  const resolve = (ApiKey.hooks as any).resolveInput;
  const result = resolve({ operation: "create", inputData: { tokenSecret: `of_${"z".repeat(32)}` }, resolvedData: { user: { connect: { id: "foreign" } }, tokenPreview: "spoofed" }, context: { session: session() } });
  assert.equal(result.user.connect.id, "owner");
  assert.equal(result.tokenPreview, `of_${"z".repeat(9)}...`);
  const errors: string[] = [];
  await (ApiKey.hooks as any).validate({ operation: "update", resolvedData: { status: "active", scopes: ["all"] }, item: { status: "revoked" }, context: { session: session() }, addValidationError: (s: string) => errors.push(s) });
  assert.equal(errors.length, 2);
});

test("profile mutation rejects service credentials and routes human updates through normal access", async () => {
  let writes = 0;
  const context: any = { session: session(), query: { User: { findOne: async () => ({ id: "owner" }) } }, db: { User: { updateOne: async ({ data }: any) => { writes++; return data; } } }, sudo: () => { throw new Error("Unexpected privilege bypass"); } };
  assert.deepEqual(await updateActiveUser(null, { data: { name: "New name" } }, context), { name: "New name" });
  await assert.rejects(updateActiveUser(null, { data: { hourlyRate: "200" } }, context), /Unsupported/);
  context.session = session({}, { apiKeyId: "key", apiKeyScopes: ["read_orders"] });
  await assert.rejects(updateActiveUser(null, { data: { name: "No" } }, context), /authenticated/);
  assert.equal(writes, 1);
});

test("adapter payload projects only provider data and never forwards application credentials", async () => {
  const payload: any = paymentAdapterPayload({ id: "p", code: "pp_custom", credentials: { token: "provider-specific" }, unrelatedSecret: "hidden", capturePaymentFunction: "https://untrusted.test" }, { amount: 100, provider: { id: "attacker" }, extra: "omitted", headers: { authorization: "session", cookie: "user", "stripe-signature": "signature" } });
  assert.deepEqual(payload.provider, { id: "p", code: "pp_custom", credentials: { token: "provider-specific" } });
  assert.deepEqual(payload.headers, { "stripe-signature": "signature" });
  assert.equal(payload.extra, undefined);
  await assert.rejects(executeAdapterFunction({ provider: { createPaymentFunction: "../../secret" }, functionName: "createPaymentFunction", args: {} }), /registered/);
});

test("external adapter response and failure handling use mocked transport without leaking credentials", async () => {
  const originalFetch = globalThis.fetch;
  let received: any;
  try {
    globalThis.fetch = async (_url, options) => {
      received = { ...options, body: JSON.parse(String(options?.body)) };
      return new Response(JSON.stringify({ refundId: "refund123", status: "succeeded" }), { status: 200 });
    };
    const provider = { id: "p", code: "pp_external", credentials: { token: "secret-test-only" }, refundPaymentFunction: "https://adapter.example/refund" };
    const result = await executeAdapterFunction({ provider, functionName: "refundPaymentFunction", args: { paymentId: "pi_test", refundId: "refund123", idempotencyKey: "same-attempt", amount: 100, order: { id: "order", secretKey: "customer-secret", paymentCollection: { credentials: "other-provider" } } } });
    assert.equal(result.refundId, "refund123");
    assert.equal(received.redirect, "error");
    assert.equal(received.body.refundId, "refund123");
    assert.deepEqual(received.body.order, { id: "order" });
    globalThis.fetch = async () => { throw new Error("secret-test-only"); };
    await assert.rejects(executeAdapterFunction({ provider, functionName: "refundPaymentFunction", args: {} }), error => !String(error).includes("secret-test-only") && String(error).includes("reconcile"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("recipe food cost percentage uses venue currency minor units, including zero and three decimal currencies", async () => {
  const resolver = field(Recipe, "foodCostPercentage").output.resolve;
  for (const [currencyCode, price] of [["USD", 1000], ["JPY", 10], ["KWD", 10000]] as const) {
    const context = { sudo: () => ({ query: {
      MenuItem: { findOne: async () => ({ price }) },
      Ingredient: { findOne: async () => ({ costPerUnit: "2.50" }) },
      StoreSettings: { findOne: async () => ({ currencyCode }) },
    } }) };
    assert.equal(await resolver({ item: { menuItemId: "menu", recipeIngredients: [{ ingredientId: "i", quantity: 1 }], yield: 1 } }, {}, context), 25);
  }
});
