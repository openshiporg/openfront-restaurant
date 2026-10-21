import { isSignedIn, permissions } from "../access";
import { appendAuditEventWithClient } from "../utils/audit";
import { attendanceDateRange, attendanceTransaction, paidHours, readAttendanceState, validateTimeWindow, writeAttendanceState } from "../utils/attendance";

async function staffPrincipal(context: any, readOnly = false) {
  if (!isSignedIn({ session: context.session })) throw new Error("Staff session required");
  const actor = await context.prisma.user.findUnique({ where: { id: context.session.itemId } });
  if (!actor?.isActive || (!actor.staffRole && !permissions.canManageStaff({ session: context.session }) && !(readOnly && permissions.canReadStaff({ session: context.session })))) throw new Error("Active staff record required");
  return actor;
}
export async function restaurantAttendance(_root: unknown, args: { fromDate?: string; toDate?: string; skip?: number; take?: number }, context: any) {
  const actor = await staffPrincipal(context, true);
  const manager = permissions.canManageStaff({ session: context.session });
  const skip = args.skip ?? 0, take = args.take ?? 100;
  if (!Number.isSafeInteger(skip) || skip < 0 || !Number.isSafeInteger(take) || take < 1 || take > 200) throw new Error("Invalid attendance page");
  const window = await attendanceDateRange(context.prisma, args.fromDate, args.toDate);
  const where = { ...((manager || permissions.canReadStaff({ session: context.session })) ? {} : { staffId: actor.id }), ...(window ? { clockIn: window } : {}) };
  const page = await context.prisma.timeEntry.findMany({ where, orderBy: [{ clockIn: "desc" }, { id: "desc" }], skip, take: take + 1, include: { staff: { select: { id: true, name: true } } } });
  const entries = page.slice(0, take);
  const enriched = [];
  for (const entry of entries) {
    const state = await readAttendanceState(context.prisma, entry.id);
    const corrections = await context.prisma.auditEvent.findMany({ where: { entityType: "TimeEntry", entityId: entry.id, eventType: "attendance.correction_requested" }, take: 20, orderBy: { occurredAt: "desc" } });
    const pending = [];
    for (const correction of corrections) if (!await context.prisma.auditEvent.findUnique({ where: { eventKey: `attendance:correction-approved:${correction.id}` } })) pending.push({ id: correction.id, actorId: correction.actorId, reason: correction.reason, proposed: correction.after });
    enriched.push({ ...entry, state, paidHours: paidHours(entry), corrections: pending });
  }
  const activeEntry = await context.prisma.timeEntry.findFirst({ where: { staffId: actor.id, clockOut: null } });
  if (activeEntry) activeEntry.state = await readAttendanceState(context.prisma, activeEntry.id);
  return { activeEntry, actorId: actor.id, canManageStaff: manager, entries: enriched, hasMore: page.length > take, skip, take, windowStart: window?.gte.toISOString(), windowEnd: window?.lt.toISOString() };
}

export async function recordRestaurantAttendance(_root: unknown, args: { action: string; entryId?: string; shiftId?: string; idempotencyKey: string; paidBreak?: boolean }, context: any) {
  const actor = await staffPrincipal(context);
  if (args.paidBreak && !permissions.canManageStaff({ session: context.session })) throw new Error("Paid-break classification requires staff management approval");
  return attendanceTransaction(context, actor.id, args.idempotencyKey, args, async tx => {
    const now = new Date();
    if (args.action === "clock_in") {
      const open = await tx.timeEntry.findFirst({ where: { staffId: actor.id, clockOut: null } });
      if (open) throw new Error("You already have an open time entry");
      const shift = args.shiftId ? await tx.shift.findUnique({ where: { id: args.shiftId } }) : await tx.shift.findFirst({ where: { staffId: actor.id, status: "scheduled", startTime: { lte: now }, endTime: { gt: now } }, orderBy: { startTime: "asc" } });
      if (args.shiftId && (!shift || shift.staffId !== actor.id || shift.status !== "scheduled")) throw new Error("Scheduled shift does not belong to you or has already started");
      const entry = await tx.timeEntry.create({ data: { staffId: actor.id, clockIn: now, hourlyRate: shift?.hourlyRate || actor.hourlyRate, role: shift?.role || (actor.staffRole === "admin" ? "manager" : actor.staffRole === "chef" ? "cook" : actor.staffRole) || "manager", breakMinutes: "0" } });
      const state = await writeAttendanceState(tx, actor.id, entry.id, { revision: 0 }, { shiftId: shift?.id || null, attested: false, approved: false });
      if (shift) await tx.shift.update({ where: { id: shift.id }, data: { status: "started", clockIn: now } });
      return { entryId: entry.id, state };
    }
    const entry = await tx.timeEntry.findUnique({ where: { id: args.entryId || "" } });
    if (!entry) throw new Error("Time entry not found");
    const manager = permissions.canManageStaff({ session: context.session });
    if (args.action === "approve_time") {
      if (!manager || entry.staffId === actor.id) throw new Error("A different staff manager must approve time");
    } else if (entry.staffId !== actor.id) throw new Error("Time entry belongs to another employee");
    const previous = await readAttendanceState(tx, entry.id);
    if (args.action === "approve_time") {
      if (!entry.clockOut || !previous.attested) throw new Error("Employee must close and attest time before approval");
      const state = previous.approved ? previous : await writeAttendanceState(tx, actor.id, entry.id, previous, { approved: true });
      return { entryId: entry.id, state };
    }
    if (args.action === "attest") {
      if (!entry.clockOut) throw new Error("Close the time entry before attesting");
      const state = previous.attested ? previous : await writeAttendanceState(tx, actor.id, entry.id, previous, { attested: true, approved: false });
      return { entryId: entry.id, state };
    }
    if (entry.clockOut) throw new Error("Closed time requires an approved correction");
    if (args.action === "start_break") {
      if (previous.breakStartedAt) throw new Error("A break is already in progress");
      const state = await writeAttendanceState(tx, actor.id, entry.id, previous, { breakStartedAt: now.toISOString(), paidBreak: Boolean(args.paidBreak), attested: false, approved: false });
      return { entryId: entry.id, state };
    }
    if (args.action === "end_break") {
      if (!previous.breakStartedAt) throw new Error("No break is in progress");
      const minutes = Math.max(0, Math.round((now.getTime() - new Date(previous.breakStartedAt).getTime()) / 60_000));
      await tx.timeEntry.update({ where: { id: entry.id }, data: { breakMinutes: String(Number(entry.breakMinutes || 0) + (previous.paidBreak ? 0 : minutes)) } });
      const state = await writeAttendanceState(tx, actor.id, entry.id, previous, { breakStartedAt: null, paidBreak: false });
      return { entryId: entry.id, state };
    }
    if (args.action === "clock_out") {
      if (previous.breakStartedAt) throw new Error("End your break before clocking out");
      validateTimeWindow(entry.clockIn, now, entry.breakMinutes || 0);
      await tx.timeEntry.update({ where: { id: entry.id }, data: { clockOut: now } });
      if (previous.shiftId) await tx.shift.update({ where: { id: previous.shiftId }, data: { status: "completed", clockOut: now } });
      const state = await writeAttendanceState(tx, actor.id, entry.id, previous, { attested: false, approved: false });
      return { entryId: entry.id, state };
    }
    throw new Error("Unknown attendance action");
  });
}

export async function requestRestaurantTimeCorrection(_root: unknown, args: { entryId: string; clockIn: string; clockOut: string; breakMinutes: number; reason: string; idempotencyKey: string }, context: any) {
  const actor = await staffPrincipal(context);
  if (!args.reason?.trim() || args.reason.length > 1000) throw new Error("A correction reason is required");
  const proposed = validateTimeWindow(args.clockIn, args.clockOut, args.breakMinutes);
  return attendanceTransaction(context, actor.id, args.idempotencyKey, args, async tx => {
    const entry = await tx.timeEntry.findUnique({ where: { id: args.entryId } });
    if (!entry || (entry.staffId !== actor.id && !permissions.canManageStaff({ session: context.session }))) throw new Error("Time entry not found");
    const state = await readAttendanceState(tx, entry.id);
    const event = await appendAuditEventWithClient(tx, actor.id, { eventKey: `attendance:correction:${actor.id}:${args.idempotencyKey}`, eventType: "attendance.correction_requested", entityType: "TimeEntry", entityId: entry.id, reason: args.reason.trim(), before: { clockIn: entry.clockIn?.toISOString() || null, clockOut: entry.clockOut?.toISOString() || null, breakMinutes: String(entry.breakMinutes), revision: state.revision }, after: { clockIn: proposed.clockIn.toISOString(), clockOut: proposed.clockOut.toISOString(), breakMinutes: proposed.breakMinutes } });
    return { entryId: entry.id, requestId: event.id };
  });
}

export async function approveRestaurantTimeCorrection(_root: unknown, args: { requestId: string; idempotencyKey: string }, context: any) {
  const actor = await staffPrincipal(context);
  if (!permissions.canManageStaff({ session: context.session })) throw new Error("Staff management permission required");
  return attendanceTransaction(context, actor.id, args.idempotencyKey, args, async tx => {
    const request = await tx.auditEvent.findUnique({ where: { id: args.requestId } });
    if (!request || request.eventType !== "attendance.correction_requested") throw new Error("Correction request not found");
    const entry = await tx.timeEntry.findUnique({ where: { id: request.entityId } });
    if (!entry || request.actorId === actor.id || entry.staffId === actor.id) throw new Error("A different manager must approve this correction");
    if (await tx.auditEvent.findUnique({ where: { eventKey: `attendance:correction-approved:${request.id}` } })) return { entryId: entry.id, requestId: request.id };
    const state = await readAttendanceState(tx, entry.id);
    if (state.revision !== request.before?.revision) throw new Error("Time changed after this correction was requested; submit a new correction");
    const proposed = validateTimeWindow(request.after.clockIn, request.after.clockOut, request.after.breakMinutes);
    const overlap = await tx.timeEntry.findFirst({ where: { staffId: entry.staffId, id: { not: entry.id }, clockIn: { lt: proposed.clockOut }, OR: [{ clockOut: null }, { clockOut: { gt: proposed.clockIn } }] } });
    if (overlap) throw new Error("Correction overlaps another time entry");
    await tx.timeEntry.update({ where: { id: entry.id }, data: proposed });
    if (state.shiftId) await tx.shift.update({ where: { id: state.shiftId }, data: { status: "completed", clockIn: proposed.clockIn, clockOut: proposed.clockOut } });
    await writeAttendanceState(tx, actor.id, entry.id, state, { breakStartedAt: null, attested: false, approved: false });
    await appendAuditEventWithClient(tx, actor.id, { eventKey: `attendance:correction-approved:${request.id}`, eventType: "attendance.correction_approved", entityType: "TimeEntry", entityId: entry.id, reason: request.reason, approverId: actor.id, before: request.before, after: request.after, metadata: { requestedBy: request.actorId, requestId: request.id } });
    return { entryId: entry.id, requestId: request.id };
  });
}
