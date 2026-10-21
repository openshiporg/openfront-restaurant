import { permissions } from "../access";
import { appendAuditEventWithClient } from "../utils/audit";
import { readAttendanceState, validateTimeWindow, writeAttendanceState } from "../utils/attendance";
const ROLES = ["server", "bartender", "host", "busser", "cook", "dishwasher", "manager"];
async function shiftTransaction(context: any, operation: (tx: any) => Promise<unknown>) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try { return await context.prisma.$transaction(operation, { isolationLevel: "Serializable" }); }
    catch (error: any) { if (attempt < 3 && ["P2034", "P2002"].includes(error.code)) continue; throw error; }
  }
}
export async function upsertShift(_root: unknown, args: { shiftId?: string; staffId?: string; role: string; startTime: string; endTime: string; hourlyRate?: string }, context: any) {
  if (!permissions.canManageStaff({ session: context.session })) return { success: false, error: "Not authorized to manage shifts" };
  try {
    const startTime = new Date(args.startTime); const endTime = new Date(args.endTime);
    if (!Number.isFinite(startTime.getTime()) || !Number.isFinite(endTime.getTime()) || endTime <= startTime) throw new Error("Invalid shift window");
    if (!ROLES.includes(args.role)) throw new Error("Invalid shift role");
    if (args.hourlyRate != null && (!Number.isFinite(Number(args.hourlyRate)) || Number(args.hourlyRate) < 0)) throw new Error("Invalid hourly rate");
    await shiftTransaction(context, async tx => {
      const previous = args.shiftId ? await tx.shift.findUnique({ where: { id: args.shiftId } }) : null;
      if (args.shiftId && !previous) throw new Error("Shift not found");
      if (previous && previous.status !== "scheduled") throw new Error("Started or closed schedules cannot overwrite actual attendance");
      const staff = args.staffId ? await tx.user.findUnique({ where: { id: args.staffId } }) : null;
      if (args.staffId && !staff?.isActive) throw new Error("Active staff member required");
      if (args.staffId) {
        const overlap = await tx.shift.findFirst({ where: { staffId: args.staffId, ...(args.shiftId ? { id: { not: args.shiftId } } : {}), status: { in: ["scheduled", "started"] }, startTime: { lt: endTime }, endTime: { gt: startTime } } });
        if (overlap) {
          if (!args.shiftId && overlap.startTime.getTime() === startTime.getTime() && overlap.endTime.getTime() === endTime.getTime() && overlap.role === args.role && String(overlap.hourlyRate || "") === String(args.hourlyRate || "")) return;
          throw new Error("Staff member has an overlapping shift");
        }
      }
      const data = { staffId: args.staffId || null, role: args.role, startTime, endTime, hourlyRate: args.hourlyRate || null };
      const shift = previous ? await tx.shift.update({ where: { id: previous.id }, data }) : await tx.shift.create({ data: { ...data, status: "scheduled" } });
      await appendAuditEventWithClient(tx, context.session.itemId, { eventType: previous ? "shift.rescheduled" : "shift.scheduled", entityType: "Shift", entityId: shift.id, after: { staffId: data.staffId, role: data.role, startTime: startTime.toISOString(), endTime: endTime.toISOString(), hourlyRate: data.hourlyRate } });
    });
    return { success: true, error: null };
  } catch (error: any) { return { success: false, error: error.message }; }
}
export async function updateShiftStatus(_root: unknown, args: { shiftId: string; action: string }, context: any) {
  if (!permissions.canManageStaff({ session: context.session })) return { success: false, error: "Not authorized to manage shifts" };
  try {
    await shiftTransaction(context, async tx => {
      const shift = await tx.shift.findUnique({ where: { id: args.shiftId } });
      if (!shift) throw new Error("Shift not found");
      const target: Record<string, string> = { start: "started", complete: "completed", no_show: "no_show", cancel: "called_out" };
      if (!target[args.action]) throw new Error("Invalid shift action");
      if (shift.status === target[args.action]) return;
      const now = new Date();
      if (args.action === "start") {
        if (shift.status !== "scheduled" || !shift.staffId) throw new Error("Only assigned scheduled shifts can start");
        if (await tx.timeEntry.findFirst({ where: { staffId: shift.staffId, clockOut: null } })) throw new Error("Staff member already has open attendance");
        const staff = await tx.user.findUnique({ where: { id: shift.staffId } });
        if (!staff?.isActive) throw new Error("Active staff member required");
        const entry = await tx.timeEntry.create({ data: { staffId: shift.staffId, role: shift.role, hourlyRate: shift.hourlyRate || staff.hourlyRate, clockIn: now, breakMinutes: "0" } });
        await writeAttendanceState(tx, context.session.itemId, entry.id, { revision: 0 }, { shiftId: shift.id, attested: false, approved: false });
        await tx.shift.update({ where: { id: shift.id }, data: { status: "started", clockIn: now } });
      } else {
        if (args.action === "no_show" && shift.status !== "scheduled") throw new Error("Only scheduled shifts can be no-show");
        if (args.action === "complete" && shift.status !== "started") throw new Error("Only started shifts can complete");
        if (args.action === "cancel" && !["scheduled", "started"].includes(shift.status)) throw new Error("Shift is already closed");
        if (shift.status === "started") {
          let entry = await tx.timeEntry.findFirst({ where: { staffId: shift.staffId, clockOut: null } });
          if (!entry && shift.clockIn && shift.staffId) {
            entry = await tx.timeEntry.create({ data: { staffId: shift.staffId, role: shift.role, hourlyRate: shift.hourlyRate, clockIn: shift.clockIn, breakMinutes: "0", notes: "Imported original recorded start from legacy scheduled shift; employee attestation required" } });
            await writeAttendanceState(tx, context.session.itemId, entry.id, { revision: 0 }, { shiftId: shift.id });
          }
          if (!entry) throw new Error("Missing actual attendance; submit a time correction");
          const state = await readAttendanceState(tx, entry.id);
          if (state.shiftId !== shift.id || state.breakStartedAt) throw new Error("Resolve attendance or active break before closing this shift");
          validateTimeWindow(entry.clockIn, now, entry.breakMinutes || 0);
          await tx.timeEntry.update({ where: { id: entry.id }, data: { clockOut: now } });
          await writeAttendanceState(tx, context.session.itemId, entry.id, state, { attested: false, approved: false });
        }
        await tx.shift.update({ where: { id: shift.id }, data: { status: target[args.action], ...(shift.status === "started" ? { clockOut: now } : {}) } });
      }
      await appendAuditEventWithClient(tx, context.session.itemId, { eventType: `shift.${args.action}`, entityType: "Shift", entityId: shift.id, reason: "Manager recorded scheduled-shift transition", before: { status: shift.status }, after: { status: target[args.action] } });
    });
    return { success: true, error: null };
  } catch (error: any) { return { success: false, error: error.message }; }
}
