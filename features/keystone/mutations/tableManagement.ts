import type { Context } from ".keystone/types";
import { permissions } from "../access";
import { ACTIVE_SERVICE_STATUSES, assertTablesAvailable, serviceTransaction } from "../utils/serviceOrderState";
import { releaseTableIfUnused } from "../utils/serviceSeating";
import { appendAuditEventWithClient } from "../utils/audit";
async function moveTables(args: { orderId: string; tableIds: string[]; fromTableId?: string }, context: Context) {
  if (!permissions.canManageTables({ session: context.session })) return { success: false, error: "Not authorized" };
  try {
    await serviceTransaction(context.prisma, async tx => {
      const order = await tx.restaurantOrder.findUnique({ where: { id: args.orderId }, include: { tables: true } });
      if (!order || !ACTIVE_SERVICE_STATUSES.includes(order.status)) throw new Error("Order is not an active check");
      const ids = [...new Set(args.tableIds)];
      if (!ids.length) throw new Error("Select at least one destination table");
      const current = order.tables.map((table: any) => table.id);
      if (args.fromTableId && !current.includes(args.fromTableId)) {
        if (ids.every(id => current.includes(id))) return; // same transfer retry
        throw new Error("Source table does not belong to this check");
      }
      const next = [...new Set([...current.filter((id: string) => id !== args.fromTableId), ...ids])];
      await assertTablesAvailable(tx, next, order.guestCount || 1, order.id);
      await tx.restaurantOrder.update({ where: { id: order.id }, data: { tables: { set: next.map(id => ({ id })) } } });
      await tx.table.updateMany({ where: { id: { in: next } }, data: { status: "occupied" } });
      if (args.fromTableId && !next.includes(args.fromTableId)) await releaseTableIfUnused(tx, args.fromTableId);
      await appendAuditEventWithClient(tx, context.session?.itemId, { eventType: args.fromTableId ? "service.table_transferred" : "service.tables_combined", entityType: "RestaurantOrder", entityId: order.id, before: { tableIds: current }, after: { tableIds: next } });
    });
    return { success: true, error: null };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Unknown error" }; }
}
export async function transferTable(_root: unknown, args: { orderId: string; fromTableId: string; toTableId: string }, context: Context) {
  if (args.fromTableId === args.toTableId) return { success: false, error: "Select a different destination table" };
  return moveTables({ orderId: args.orderId, fromTableId: args.fromTableId, tableIds: [args.toTableId] }, context);
}
export async function combineTables(_root: unknown, args: { orderId: string; tableIds: string[] }, context: Context) { return moveTables(args, context); }
/** Only never-used tables may be removed; service history retains its resource reference. */
export async function deleteUnusedRestaurantTable(_root: unknown, args: { tableId: string }, context: Context) {
  if (!permissions.canManageTables({ session: context.session })) return { success: false, error: "Not authorized" };
  try {
    await serviceTransaction(context.prisma, async tx => {
      const table = await tx.table.findUnique({ where: { id: args.tableId } });
      if (!table) return;
      const [orders, reservations, waitlist] = await Promise.all([
        tx.restaurantOrder.count({ where: { tables: { some: { id: args.tableId } } } }),
        tx.reservation.count({ where: { assignedTableId: args.tableId } }),
        tx.waitlistEntry.count({ where: { tableId: args.tableId } }),
      ]);
      if (orders || reservations || waitlist || table.status !== "available") throw new Error("Only available tables with no service history may be deleted");
      await tx.table.delete({ where: { id: args.tableId } });
    });
    return { success: true, error: null };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Unknown error" }; }
}
export async function setRestaurantTableCapacity(_root: unknown, args: { tableId: string; capacity: number }, context: Context) {
  if (!permissions.canManageTables({ session: context.session })) return { success: false, error: "Not authorized" };
  try {
    if (!Number.isSafeInteger(args.capacity) || args.capacity < 1 || args.capacity > 100) throw new Error("Table capacity must be between 1 and 100");
    await serviceTransaction(context.prisma, async tx => {
      const table = await tx.table.findUnique({ where: { id: args.tableId } });
      if (!table) throw new Error("Table not found");
      const reservations = await tx.reservation.findMany({ where: { assignedTableId: args.tableId, status: { in: ["pending", "confirmed", "seated"] } }, take: 10000 });
      const waiting = await tx.waitlistEntry.findMany({ where: { tableId: args.tableId, status: "seated" }, take: 1000 });
      if (reservations.length >= 10000 || waiting.length >= 1000 || [...reservations, ...waiting].some((party: any) => party.partySize > args.capacity)) throw new Error("Capacity cannot fall below an allocated party size");
      const orders = await tx.restaurantOrder.findMany({ where: { tables: { some: { id: args.tableId } }, status: { in: ACTIVE_SERVICE_STATUSES } }, include: { tables: true }, take: 1000 });
      if (orders.length >= 1000 || orders.some((order: any) => order.tables.reduce((sum: number, resource: any) => sum + (resource.id === args.tableId ? args.capacity : resource.capacity), 0) < Number(order.guestCount || 1))) throw new Error("Capacity cannot fall below the active check's party size");
      await tx.table.update({ where: { id: args.tableId }, data: { capacity: args.capacity } });
    });
    return { success: true, error: null };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Unknown error" }; }
}
