import { ACTIVE_SERVICE_STATUSES } from "./serviceOrderState";
export function reservationIntervalsOverlap(start: Date, duration: number, otherStart: Date, otherDuration: number) {
  return start.getTime() < otherStart.getTime() + otherDuration * 60000 && otherStart.getTime() < start.getTime() + duration * 60000;
}
export async function assertReservationWindow(tx: any, tableId: string | null | undefined, party: number, start: Date, duration: number, excludeId?: string) {
  if (!Number.isFinite(start.getTime()) || !Number.isInteger(duration) || duration < 15 || duration > 1440) throw new Error("Invalid reservation interval (15–1440 minutes required)");
  if (!tableId) return;
  const table = await tx.table.findUnique({ where: { id: tableId } });
  if (!table || table.capacity < party) throw new Error("Assigned table is missing or too small");
  // No same-calendar-day truncation: prior-day reservations may continue after midnight.
  const reservations = await tx.reservation.findMany({ where: { assignedTableId: tableId, status: { in: ["pending", "confirmed", "seated"] }, reservationDate: { lt: new Date(start.getTime() + duration * 60000) } }, take: 10000 });
  if (reservations.length >= 10000) throw new Error("Reservation history requires operator review before allocating this table");
  if (reservations.some((reservation: any) => reservation.id !== excludeId && reservationIntervalsOverlap(start, duration, new Date(reservation.reservationDate), Number(reservation.duration || 90)))) throw new Error("Table already has an overlapping reservation");
}
export async function assertSeatAvailable(tx: any, tableId: string, party: number, reservationId?: string) {
  const table = await tx.table.findUnique({ where: { id: tableId } });
  if (!table || table.capacity < party || !["available", "reserved"].includes(table.status)) throw new Error("Table is unavailable or too small");
  const [checks, reservations, waitlist] = await Promise.all([
    tx.restaurantOrder.count({ where: { tables: { some: { id: tableId } }, status: { in: ACTIVE_SERVICE_STATUSES } } }),
    tx.reservation.count({ where: { assignedTableId: tableId, status: "seated", ...(reservationId ? { id: { not: reservationId } } : {}) } }),
    tx.waitlistEntry.count({ where: { tableId, status: "seated" } }),
  ]);
  if (checks || reservations || waitlist) throw new Error("Table is already allocated to active service");
}
export async function releaseTableIfUnused(tx: any, tableId: string, status = "cleaning") {
  const [checks, reservations, waitlist] = await Promise.all([
    tx.restaurantOrder.count({ where: { tables: { some: { id: tableId } }, status: { in: ACTIVE_SERVICE_STATUSES } } }),
    tx.reservation.count({ where: { assignedTableId: tableId, status: "seated" } }),
    tx.waitlistEntry.count({ where: { tableId, status: "seated" } }),
  ]);
  if (!checks && !reservations && !waitlist) await tx.table.update({ where: { id: tableId }, data: { status } });
}
