import test from "node:test";
import assert from "node:assert/strict";
import { User } from "../features/keystone/models/User";
import { GUEST_FLAG_EPOCH } from "../features/keystone/security/guest-user";

// Keystone order for create: resolveInput -> field/list validation -> beforeOperation -> DB write.
const hooks = (User as any).hooks ?? (User as any).listConfig?.hooks;
const MIN_PASSWORD = 8;
function fakeDb() {
  const rows: any[] = [{ id: "g1", email: "g@x.com", hasAccount: false, createdAt: new Date(GUEST_FLAG_EPOCH.getTime() + 60000), roleId: null, staffRole: null, employeeId: null, accounts: [], carts: [{ id: "c" }], orders: [], restaurantOrders: [] }];
  return { rows, user: {
    findFirst: async ({ where }: any) => rows.find((u) => u.email.toLowerCase() === where.email.equals.toLowerCase()) || null,
    update: async ({ where, data }: any) => { Object.assign(rows.find((u) => u.id === where.id), data); },
  } };
}
async function publicCreate(prisma: any, input: any) {
  const context = { session: undefined, prisma };
  const resolvedData = await hooks.resolveInput({ operation: "create", inputData: input, resolvedData: { ...input }, context });
  if (String(resolvedData.password || "").length < MIN_PASSWORD) return "validation-failed"; // validation stops the operation
  await hooks.beforeOperation({ operation: "create", inputData: input, resolvedData, context });
  return "written";
}

test("a create that fails validation (short password) does not retire the guest's email", async () => {
  const db = fakeDb();
  assert.equal(await publicCreate(db, { email: "g@x.com", name: "n", password: "short", hasAccount: false }), "validation-failed");
  assert.equal(db.rows[0].email, "g@x.com");
});

test("resolveInput alone never retires; a valid guest create retires the earlier guest", async () => {
  const db = fakeDb();
  await hooks.resolveInput({ operation: "create", inputData: { email: "g@x.com" }, resolvedData: { email: "g@x.com" }, context: { session: undefined, prisma: db } });
  assert.equal(db.rows[0].email, "g@x.com");
  assert.equal(await publicCreate(db, { email: "g@x.com", name: "n", password: "a-long-enough-password-1", hasAccount: false }), "written");
  assert.match(db.rows[0].email, /@guest\.invalid$/);
});
