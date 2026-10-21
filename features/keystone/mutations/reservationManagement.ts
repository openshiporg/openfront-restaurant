import type { Context } from ".keystone/types";
import { permissions } from "../access";
import { serviceTransaction } from "../utils/serviceOrderState";
import { assertReservationWindow, assertSeatAvailable, releaseTableIfUnused } from "../utils/serviceSeating";
interface UpsertReservationArgs {
  reservationId?: string | null;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  reservationDate: string;
  partySize: number;
  duration?: number | null;
  status?: string | null;
  specialRequests?: string | null;
  assignedTableId?: string | null;
}

interface UpdateReservationStatusArgs {
  reservationId: string;
  action: "pending" | "confirm" | "seat" | "complete" | "cancel" | "no_show";
  tableId?: string | null;
}

interface ReservationMutationResult {
  success: boolean;
  error: string | null;
}

export async function upsertReservation(_root: unknown, args: UpsertReservationArgs, context: Context): Promise<ReservationMutationResult> {
  if (!permissions.canManageTables({ session: context.session })) return { success: false, error: "Not authorized to manage reservations" };
  try {
    if (!args.customerName?.trim() || !args.customerPhone?.trim()) throw new Error("Guest name and phone are required");
    const partySize = Number(args.partySize), duration = Number(args.duration || 90), status = args.status || "confirmed";
    if (!Number.isInteger(partySize) || partySize < 1) throw new Error("Party size must be a positive integer");
    if (!["pending", "confirmed"].includes(status)) throw new Error("Use reservation lifecycle actions for seating or closing");
    const reservationDate = new Date(args.reservationDate);
    await serviceTransaction(context.prisma, async tx => {
      if (args.reservationId) {
        const current = await tx.reservation.findUnique({ where: { id: args.reservationId } });
        if (!current || !["pending", "confirmed"].includes(current.status)) throw new Error("Only unseated active reservations can be edited");
      }
      await assertReservationWindow(tx, args.assignedTableId, partySize, reservationDate, duration, args.reservationId || undefined);
      const data = { customerName: args.customerName.trim(), customerPhone: args.customerPhone!.trim(), customerEmail: args.customerEmail?.trim() || "", reservationDate, partySize, duration, status, specialRequests: args.specialRequests?.trim() || "", assignedTableId: args.assignedTableId || null };
      if (args.reservationId) await tx.reservation.update({ where: { id: args.reservationId }, data });
      else await tx.reservation.create({ data });
    });
    return { success: true, error: null };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Unknown error" }; }
}
export async function updateReservationStatus(_root: unknown, args: UpdateReservationStatusArgs, context: Context): Promise<ReservationMutationResult> {
  if (!permissions.canManageTables({ session: context.session })) return { success: false, error: "Not authorized to manage reservations" };
  try {
    await serviceTransaction(context.prisma, async tx => {
      const reservation = await tx.reservation.findUnique({ where: { id: args.reservationId } });
      if (!reservation) throw new Error("Reservation not found");
      const next: Record<string, string> = { pending: "pending", confirm: "confirmed", seat: "seated", complete: "completed", cancel: "cancelled", no_show: "no_show" };
      const status = next[args.action];
      if (!status) throw new Error("Invalid reservation action");
      if (reservation.status === status) return;
      const allowed: Record<string, string[]> = { pending: ["confirmed", "cancelled", "no_show", "seated"], confirmed: ["pending", "cancelled", "no_show", "seated"], seated: ["completed"] };
      if (!(allowed[reservation.status] || []).includes(status)) throw new Error("Invalid reservation lifecycle transition");
      let tableId = reservation.assignedTableId;
      if (status === "seated") {
        tableId = args.tableId || tableId;
        if (!tableId) throw new Error("Assign a table before seating");
        await assertReservationWindow(tx, tableId, reservation.partySize, new Date(reservation.reservationDate), reservation.duration || 90, reservation.id);
        await assertSeatAvailable(tx, tableId, reservation.partySize, reservation.id);
        await tx.table.update({ where: { id: tableId }, data: { status: "occupied" } });
      }
      await tx.reservation.update({ where: { id: reservation.id }, data: { status, assignedTableId: tableId } });
      if (tableId && ["completed", "cancelled", "no_show"].includes(status)) await releaseTableIfUnused(tx, tableId, status === "completed" ? "cleaning" : "available");
    });
    return { success: true, error: null };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Unknown error" }; }
}
