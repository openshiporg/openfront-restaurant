import test from "node:test";
import assert from "node:assert/strict";
import { restaurantNotifications } from "../features/keystone/utils/restaurantNotifications";

function notificationContext(count = 125) {
  const queued: any[] = Array.from({ length: count }, (_, index) => ({
    id: `queued-${String(index).padStart(3, "0")}`,
    eventType: "notification.queued",
    entityType: "GiftCard",
    entityId: `gift-${index}`,
    createdAt: new Date(Date.UTC(2026, 0, 1) - index * 1000),
    metadata: { to: `guest${index}@example.test`, subject: `Gift notice ${index}` },
  }));
  const statusEvents = queued.flatMap((row, index) => {
    const status = index < 75 ? (index % 2 ? "acknowledged" : "suppressed") : ["unknown", "failed", "queued"][index % 3];
    return status === "queued" ? [] : [{
      id: `state-${index}`,
      eventType: `notification.${status}`,
      entityType: "RestaurantNotification",
      entityId: row.id,
      createdAt: row.createdAt,
      metadata: { status, sequence: 1, error: status === "failed" ? "Transport rejected" : undefined },
    }];
  });
  let queryCount = 0;
  const context: any = {
    session: { itemId: "manager", data: { role: { canManageOrders: true } } },
    prisma: {
      auditEvent: {
        findUnique: async ({ where }: any) => queued.find((row) => row.id === where.id) || null,
        findMany: async (args: any) => {
          queryCount++;
          if (args.where.eventType === "notification.queued") {
            let rows = queued.slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
            if (args.cursor?.id) {
              const index = rows.findIndex((row) => row.id === args.cursor.id);
              rows = index < 0 ? [] : rows.slice(index + (args.skip || 0));
            }
            return rows.slice(0, args.take);
          }
          const ids = args.where.entityId.in as string[];
          return statusEvents.filter((event) => ids.includes(event.entityId));
        },
      },
    },
  };
  return { context, queryCount: () => queryCount };
}

test("notification queue filters latest status before keyset pagination and reaches old unresolved rows", async () => {
  const { context } = notificationContext();
  const first = await restaurantNotifications(null, { status: "unresolved", limit: 10 }, context);
  assert.equal(first.items.length, 10);
  assert.deepEqual(first.items.map((row: any) => row.id), Array.from({ length: 10 }, (_, i) => `queued-${String(i + 75).padStart(3, "0")}`));
  assert.equal(first.hasMore, true);
  assert.equal(first.nextCursor, "queued-084");

  const second = await restaurantNotifications(null, { status: "unresolved", limit: 10, cursor: first.nextCursor }, context);
  assert.equal(second.items[0].id, "queued-085");
  assert.equal(second.items[9].id, "queued-094");
  assert.equal(second.hasMore, true);
  assert.equal(second.nextCursor, "queued-094");

  const unknown = await restaurantNotifications(null, { status: "unknown", limit: 50 }, context);
  assert.ok(unknown.items.length > 0);
  assert.ok(unknown.items.every((row: any) => row.status === "unknown"));
});

test("notification queue validates filters/cursors and authorizes before querying", async () => {
  const { context, queryCount } = notificationContext(2);
  await assert.rejects(() => restaurantNotifications(null, { status: "not-a-state", limit: 10 }, context), /status filter/);
  await assert.rejects(() => restaurantNotifications(null, { status: "all", limit: 101 }, context), /page size/);
  await assert.rejects(() => restaurantNotifications(null, { status: "all", limit: 10, cursor: "missing" }, context), /cursor/);
  const beforeUnauthorized = queryCount();
  await assert.rejects(() => restaurantNotifications(null, { status: "all" }, { ...context, session: undefined } as any), /Order management/);
  assert.equal(queryCount(), beforeUnauthorized);
});
