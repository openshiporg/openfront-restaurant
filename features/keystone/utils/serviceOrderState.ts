import { reservedTenderValue } from "./paymentState";

/** Shared service invariants. Money collection never proves preparation or handoff. */
export const ACTIVE_SERVICE_STATUSES = ["open", "sent_to_kitchen", "in_progress", "ready", "dispatched", "served"];
export const RESERVED_TENDER_STATUSES = ["processing", "authorized", "succeeded", "unknown", "partially_refunded"];
export function assertMutableServiceOrder(order: any) {
  if (!order) throw new Error("Order not found");
  if (!ACTIVE_SERVICE_STATUSES.includes(order.status) || ["served", "dispatched"].includes(order.status)) throw new Error("Served or closed checks cannot be edited");
  if ((order.payments || []).some((payment: any) => RESERVED_TENDER_STATUSES.includes(payment.status))) {
    throw new Error("Resolve reserved or successful tenders before changing check charges");
  }
}

/** After handoff, allow only a payable comp; production/void history stays immutable. */
export function assertServiceItemCorrectionAllowed(order: any, type: "void" | "comp"): boolean {
  if (!order) throw new Error("Order not found");
  if (order.status !== "served") {
    assertMutableServiceOrder(order);
    return false;
  }
  if (type !== "comp") throw new Error("Served production cannot be voided; use an approved comp for a payable correction");
  if ((order.payments || []).some((payment: any) => ["pending", "processing", "authorized", "unknown"].includes(payment.status))) {
    throw new Error("Resolve uncertain tenders before applying a served-check comp");
  }
  return true;
}

export function hasKitchenWorkCoverage(order: any, tickets: any[], allowedTicketStatuses: string[]) {
  const requiredIds = (order?.orderItems || []).filter((item: any) => item?.id && !item.isVoided).map((item: any) => item.id);
  if (!requiredIds.length) return true;
  const coveredIds = new Set<string>();
  for (const ticket of tickets || []) {
    if (!allowedTicketStatuses.includes(ticket.status)) continue;
    // The normalized relation is authoritative when loaded. Legacy pure callers
    // without it may use the immutable ticket payload as a compatibility fallback.
    const ticketItems = Array.isArray(ticket.orderItems) ? ticket.orderItems : Array.isArray(ticket.items) ? ticket.items : [];
    for (const item of ticketItems) {
      const id = typeof item === "string" ? item : item?.id;
      if (id) coveredIds.add(id);
    }
  }
  return requiredIds.every((id: string) => coveredIds.has(id));
}

export function assertCorrectedBalanceCoversCapturedPayments(order: any, correctedTotal: number) {
  const captured = (order.payments || []).reduce((sum: number, payment: any) =>
    sum + (["succeeded", "partially_refunded", "refunded"].includes(payment.status) ? reservedTenderValue(payment) : 0), 0);
  if (captured > correctedTotal) throw new Error("Corrected check total is below captured payments; use an approved refund/correction workflow");
}
export function assertServiceTransition(order: any, next: string, tickets: any[] = []) {
  const transitions: Record<string, string[]> = {
    open: ["sent_to_kitchen"], sent_to_kitchen: ["in_progress"],
    in_progress: ["ready"], ready: order.orderType === "delivery" ? ["dispatched"] : ["served"], dispatched: order.orderType === "delivery" ? ["served", "ready"] : [], served: ["completed"], completed: [], cancelled: [],
  };
  if (order.status === next) return;
  if (!(transitions[order.status] || []).includes(next)) throw new Error(`Order cannot transition from ${order.status} to ${next}`);
  if (["dispatched", "served", "completed"].includes(next)) {
    const allowedKitchenStates = next === "completed" ? ["served", "cancelled"] : ["ready", "served", "cancelled"];
    if (tickets.some(ticket => !allowedKitchenStates.includes(ticket.status))) throw new Error("Kitchen work must be served before closing service");
    if ((order.courses || []).some((course: any) => course.onHold || course.status === "pending")) throw new Error("Resolve held courses before closing service");
    const coverageStatuses = next === "completed" ? ["served"] : ["ready", "served"];
    if (!hasKitchenWorkCoverage(order, tickets, coverageStatuses)) throw new Error("Every active order item needs a ready or served kitchen ticket before handoff or closure");
  }
  if (next === "completed") {
    const paid = (order.payments || []).filter((payment: any) => ["succeeded", "partially_refunded"].includes(payment.status))
      .reduce((sum: number, payment: any) => sum + Math.max(0, Number(payment.amount || 0) - Number(payment.refundedAmount || 0)), 0);
    if (paid < Number(order.total || 0)) throw new Error("Check cannot be closed until payment is complete");
    if ((order.payments || []).some((payment: any) => ["processing", "authorized", "unknown"].includes(payment.status))) throw new Error("Resolve uncertain tenders before closing the check");
  }
}
/** Retry only serialization failures. The callback must contain database work only. */
export async function serviceTransaction<T>(prisma: any, operation: (tx: any) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await prisma.$transaction(operation, { isolationLevel: "Serializable" }); }
    catch (error: any) { if (error?.code !== "P2034" || attempt >= 2) throw error; }
  }
}
export async function assertTablesAvailable(tx: any, ids: string[], guestCount = 1, existingOrderId?: string, allowSeated = false) {
  if (!ids.length) return [];
  const tables = await tx.table.findMany({ where: { id: { in: ids } }, include: { orders: { where: { status: { in: ACTIVE_SERVICE_STATUSES } }, select: { id: true } } } });
  if (tables.length !== ids.length) throw new Error("One or more tables were not found");
  for (const table of tables) {
    const own = table.orders.some((order: any) => order.id === existingOrderId);
    const seated = allowSeated && !table.orders.length && table.status === "occupied" && (
      await tx.reservation.count({ where: { assignedTableId: table.id, status: "seated" } }) ||
      await tx.waitlistEntry.count({ where: { tableId: table.id, status: "seated" } })
    );
    if (table.orders.some((order: any) => order.id !== existingOrderId) || (!own && !seated && table.status !== "available")) throw new Error(`Table ${table.tableNumber} is unavailable`);
  }
  if (tables.reduce((sum: number, table: any) => sum + Number(table.capacity || 0), 0) < guestCount) throw new Error("Table capacity is insufficient");
  return tables;
}
