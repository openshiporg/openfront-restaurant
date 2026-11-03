import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isRetirableGuest, resolveOrderCustomer, resolvePublicHasAccount, retireReturningGuest, retiredGuestEmail } from "../features/keystone/security/guest-user";

const EPOCH = new Date("2026-11-02T22:00:00.000Z");
const NEW = "2026-11-02T22:30:00.000Z", OLD = "2026-10-01T00:00:00.000Z";
const root = join(__dirname, "..");

function db(users: any[]) {
  const rows = users.map((u) => ({ roleId: null, staffRole: null, employeeId: null, carts: [{ id: "c" }], restaurantOrders: [], ...u }));
  return { rows, user: {
    findFirst: async ({ where }: any) => rows.find((u) => u.email.toLowerCase() === where.email.equals.toLowerCase()) || null,
    update: async ({ where, data }: any) => { Object.assign(rows.find((u) => u.id === where.id)!, data); },
  } };
}

test("a repeat guest email frees the old guest record (created after the epoch)", async () => {
  const prisma = db([{ id: "g1", email: "a@x.com", hasAccount: false, createdAt: new Date(NEW) }]);
  assert.equal(await retireReturningGuest(prisma as any, "A@x.com", EPOCH), true);
  assert.equal(prisma.rows[0].email, retiredGuestEmail("g1"));
  assert.equal(await prisma.user.findFirst({ where: { email: { equals: "a@x.com" } } }), null);
});

test("a registered customer (hasAccount true) is never retired or hijacked", async () => {
  const prisma = db([{ id: "m1", email: "a@x.com", hasAccount: true, createdAt: new Date("2030-01-01") }]);
  assert.equal(await retireReturningGuest(prisma as any, "a@x.com", EPOCH), false);
  assert.equal(prisma.rows[0].email, "a@x.com");
});

test("rows from before the epoch (old guests and old sign-ups are indistinguishable), staff and role users are kept", async () => {
  for (const u of [
    { id: "o", hasAccount: false, createdAt: new Date(OLD) },
    { id: "r", hasAccount: false, createdAt: new Date("2030-01-01"), roleId: "role1" },
    { id: "s", hasAccount: false, createdAt: new Date("2030-01-01"), staffRole: "server" },
    { id: "e", hasAccount: false, createdAt: new Date("2030-01-01"), employeeId: "E1" },
  ]) {
    const prisma = db([{ email: "a@x.com", ...u }]);
    assert.equal(await retireReturningGuest(prisma as any, "a@x.com", EPOCH), false, u.id);
    assert.equal(prisma.rows[0].email, "a@x.com");
  }
});

test("the second guest is a new row, so it cannot see the first guest's data", async () => {
  const prisma = db([{ id: "g1", email: "a@x.com", hasAccount: false, createdAt: new Date("2030-01-01") }]);
  await retireReturningGuest(prisma as any, "a@x.com", EPOCH);
  prisma.rows.push({ id: "g2", email: "a@x.com", hasAccount: false, createdAt: new Date("2030-01-02"), roleId: null, staffRole: null, employeeId: null });
  assert.notEqual((await prisma.user.findFirst({ where: { email: { equals: "a@x.com" } } }))!.id, "g1");
  assert.match(prisma.rows[0].email, /@guest\.invalid$/);
});

test("empty or unknown email does nothing", async () => {
  const prisma = db([]);
  assert.equal(await retireReturningGuest(prisma as any, ""), false);
  assert.equal(await retireReturningGuest(prisma as any, "none@x.com"), false);
  assert.equal(isRetirableGuest(null), false);
});

test("public create defaults to member; only an explicit false is a guest", () => {
  for (const v of [{}, undefined, { hasAccount: true }, { hasAccount: "false" }, { hasAccount: 0 }, { email: "a@x.com", name: "a", password: "p" }]) assert.equal(resolvePublicHasAccount(v as any), true);
  assert.equal(resolvePublicHasAccount({ hasAccount: false }), false);
});

test("sign-up inputs (dashboard, storefront) are members and not retirable", () => {
  for (const input of [{ email: "a@x.com", name: "a", password: "p" }, { email: "a@x.com", name: "a", password: "p", hasAccount: true }]) {
    const hasAccount = resolvePublicHasAccount(input);
    assert.equal(hasAccount, true);
    assert.equal(isRetirableGuest({ id: "u", hasAccount, createdAt: NEW, carts: [] } as any, EPOCH), false);
  }
});

test("the guest checkout create sends hasAccount:false explicitly", () => {
  const src = readFileSync(join(root, "features/storefront/lib/data/user.ts"), "utf8");
  assert.match(src.slice(src.indexOf("CreateGuest") > 0 ? src.indexOf("CreateGuest") : src.indexOf("password: randomPassword") - 200), /hasAccount: false,\s*password: randomPassword/);
});

test("a guest with no cart or order is never retired; with a cart or order it is", async () => {
  const none = db([{ id: "x", email: "a@x.com", hasAccount: false, createdAt: NEW, carts: [], restaurantOrders: [] }]);
  assert.equal(await retireReturningGuest(none as any, "a@x.com", EPOCH), false);
  assert.equal(none.rows[0].email, "a@x.com");
  const withOrder = db([{ id: "y", email: "a@x.com", hasAccount: false, createdAt: NEW, carts: [], restaurantOrders: [{ id: "o" }] }]);
  assert.equal(await retireReturningGuest(withOrder as any, "a@x.com", EPOCH), true);
});

test("anonymous create with a member's email never retires it (unique constraint then refuses)", async () => {
  const member = resolvePublicHasAccount({ email: "m@x.com" });
  const prisma = db([{ id: "m", email: "m@x.com", hasAccount: member, createdAt: NEW, carts: [] }]);
  assert.equal(await retireReturningGuest(prisma as any, "M@x.com", EPOCH), false);
  assert.equal(prisma.rows[0].email, "m@x.com");
});

const CART_AT = "2026-11-02T22:00:00.000Z";
test("guest order: the per-checkout user is not linked, is flagged guest, and gets a secret key", () => {
  const r = resolveOrderCustomer({ createdAt: CART_AT, user: { id: "u1", hasAccount: false, createdAt: "2026-11-02T22:05:00.000Z" } });
  assert.deepEqual({ ...r }, { customerId: undefined, isGuest: true });
});
test("signed-in customer (hasAccount true) stays linked and is not a guest", () => {
  const r = resolveOrderCustomer({ createdAt: CART_AT, user: { id: "u2", hasAccount: true, createdAt: "2026-01-01T00:00:00.000Z" } });
  assert.deepEqual({ ...r }, { customerId: "u2", isGuest: false });
});
test("a legacy customer (hasAccount false but older than the cart) stays linked", () => {
  const r = resolveOrderCustomer({ createdAt: CART_AT, user: { id: "u3", hasAccount: false, createdAt: "2026-01-01T00:00:00.000Z" } });
  assert.deepEqual({ ...r }, { customerId: "u3", isGuest: false });
});
test("no user at all is a guest", () => {
  assert.deepEqual({ ...resolveOrderCustomer({ createdAt: CART_AT, user: null }) }, { customerId: undefined, isGuest: true });
});

test("source contracts: sign-up sends hasAccount true, the model hook retires returning guests, the migration is additive, completeActiveCart uses resolveOrderCustomer and records isGuestOrder", () => {
  const read = (p: string) => readFileSync(join(root, p), "utf8");
  assert.match(read("features/storefront/lib/data/user.ts"), /data: \{ email, password, name, phone, hasAccount: true \}/);
  assert.match(read("features/dashboard/actions/auth.ts"), /hasAccount: true/);
  const guestCreate = read("features/storefront/lib/data/user.ts").split("export async function createGuestUser")[1];
  assert.doesNotMatch(guestCreate, /hasAccount: true/);
  assert.match(read("features/keystone/models/User.ts"), /beforeOperation[\s\S]*await retireReturningGuest\(context\.prisma, \(resolvedData as any\)\?\.email\)/);
  assert.doesNotMatch(read("features/keystone/models/User.ts").split("beforeOperation")[0], /retireReturningGuest\(/);
  assert.match(read("features/keystone/models/User.ts"), /!permissions\.canManagePeople/);
  const dir = readdirSync(join(root, "migrations")).find((d) => /user_has_account/.test(d))!;
  const sql = read(`migrations/${dir}/migration.sql`);
  assert.match(sql, /ALTER TABLE "User" ADD COLUMN "hasAccount" BOOLEAN NOT NULL DEFAULT false/);
  assert.doesNotMatch(sql, /^\s*(UPDATE|DELETE|DROP)/m);
  assert.ok(existsSync(join(root, "features/keystone/security/guest-user.ts")));
  const cart = read("features/keystone/mutations/completeActiveCart.ts");
  assert.match(cart, /resolveOrderCustomer\(liveCustomerContext\)/);
  // The quote snapshot is merged over the cart (and only has user { id }); classification must read the live values.
  assert.ok(cart.indexOf("const liveCustomerContext = { createdAt: cart.createdAt, user: cart.user }") < cart.indexOf("cart = { ...cart, ...quote.cart"));
  assert.match(cart, /isGuestOrder: isGuest/);
  assert.match(cart, /user \{ id hasAccount createdAt \}/);
});
