import { businessDayStart } from "../../lib/financial-ledger";
import { appendAuditEventWithClient } from "./audit";
import { idempotencyFingerprint as canonicalFingerprint } from "./idempotency";

export type AttendanceState = { revision: number; breakStartedAt?: string | null; paidBreak?: boolean; attested?: boolean; approved?: boolean; shiftId?: string | null };
export function latestAttendanceState(events: any[]): AttendanceState {
  return events.reduce((state, event) => Number(event.after?.revision) > state.revision ? event.after : state, { revision: 0 } as AttendanceState);
}
export async function readAttendanceState(tx: any, entryId: string) {
  return latestAttendanceState(await tx.auditEvent.findMany({ where: { entityType: "TimeEntry", entityId: entryId, eventType: "attendance.state" }, take: 2000 }));
}
export function paidHours(entry: any) {
  if (!entry.clockIn || !entry.clockOut) return 0;
  return Math.max(0, (new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / 3_600_000 - Number(entry.breakMinutes || 0) / 60);
}
export function validateTimeWindow(clockIn: unknown, clockOut: unknown, breaks: unknown) {
  const start = new Date(String(clockIn)); const end = new Date(String(clockOut)); const breakMinutes = Number(breaks);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start || end.getTime() - start.getTime() > 48 * 3_600_000) throw new Error("Time entry must span more than zero and at most 48 hours");
  if (!Number.isSafeInteger(breakMinutes) || breakMinutes < 0 || breakMinutes * 60_000 > end.getTime() - start.getTime()) throw new Error("Invalid unpaid break minutes");
  return { clockIn: start, clockOut: end, breakMinutes: String(breakMinutes) };
}
export async function writeAttendanceState(tx: any, actorId: string, entryId: string, previous: AttendanceState, patch: Partial<AttendanceState>) {
  const state = { ...previous, ...patch, revision: previous.revision + 1 };
  await appendAuditEventWithClient(tx, actorId, { eventKey: `attendance:state:${entryId}:${state.revision}`, eventType: "attendance.state", entityType: "TimeEntry", entityId: entryId, after: state });
  return state;
}
export async function attendanceTransaction(context: any, actorId: string, key: string, request: any, execute: (tx: any) => Promise<any>) {
  if (!/^[A-Za-z0-9:_-]{8,160}$/.test(key || "")) throw new Error("A stable attendance request key is required");
  const eventKey = `attendance:request:${actorId}:${key}`;
  const fingerprint = canonicalFingerprint(request);
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await context.prisma.$transaction(async (tx: any) => {
        const previous = await tx.auditEvent.findUnique({ where: { eventKey } });
        if (previous) {
          if (previous.metadata?.fingerprint !== fingerprint) throw new Error("Attendance request key belongs to different input");
          return previous.after;
        }
        const result = await execute(tx);
        await appendAuditEventWithClient(tx, actorId, { eventKey, eventType: "attendance.request", entityType: "TimeEntry", entityId: result.entryId || result.requestId || actorId, metadata: { fingerprint }, after: result });
        return result;
      }, { isolationLevel: "Serializable" });
    } catch (error: any) { if (attempt < 3 && ["P2034", "P2002"].includes(error?.code)) continue; throw error; }
  }
}

export async function attendanceDateRange(tx: any, fromDate?: string, toDate?: string) {
  if (!fromDate && !toDate) return null;
  if (!fromDate || !toDate || !/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) throw new Error("Select both attendance dates");
  const first = new Date(`${fromDate}T00:00:00Z`), last = new Date(`${toDate}T00:00:00Z`);
  if (!Number.isFinite(first.getTime()) || !Number.isFinite(last.getTime()) || first.toISOString().slice(0,10) !== fromDate || last.toISOString().slice(0,10) !== toDate || last < first || last.getTime() - first.getTime() > 366 * 86400000) throw new Error("Attendance range must be valid and at most one year");
  const settings = await tx.storeSettings.findUnique({ where: { id: 1 } });
  const boundary = async (day: string) => {
    const events = await tx.auditEvent.findMany({ where: { entityType: "BusinessDay", eventType: "business_day.opened", entityId: { lte: day } }, orderBy: { entityId: "desc" }, take: 1 });
    const policy = events[0]?.after;
    return businessDayStart(day, policy?.timezone || settings?.timezone || "America/New_York", policy?.cutoffMinutes || 0);
  };
  last.setUTCDate(last.getUTCDate() + 1);
  return { gte: await boundary(fromDate), lt: await boundary(last.toISOString().slice(0,10)) };
}
