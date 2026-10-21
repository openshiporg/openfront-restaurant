import { permissions } from "../access";
import { assertTipConservation, calculateTipDistributions, isTipEligibleRole } from "../../lib/tip-allocation";
import { toMinorUnits } from "../../storefront/lib/currency";
import { appendAuditEventWithClient } from "../utils/audit";
import { attendanceDateRange, paidHours, readAttendanceState } from "../utils/attendance";
import { idempotencyFingerprint } from "../utils/idempotency";

type TipArgs = { date: string; tipPoolType: "individual" | "pool_by_role" | "house_pool"; cashTips: string; creditTips: string; sourceNote?: string; individualStaffId?: string | null };
function dayKey(value: string) {
  const day = value?.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || "") || new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) throw new Error("Business date is invalid");
  return day;
}
export async function calculateRestaurantTipPool(tx: any, args: TipArgs) {
  if (!["individual", "pool_by_role", "house_pool"].includes(args.tipPoolType)) throw new Error("Invalid tip pool type");
  const day = dayKey(args.date);
  const settings = await tx.storeSettings.findUnique({ where: { id: 1 } });
  const businessDays = await tx.auditEvent.findMany({ where: { entityType: "BusinessDay", entityId: { lte: day }, eventType: "business_day.opened" }, orderBy: { entityId: "desc" }, take: 1 });
  const timezone = businessDays[0]?.after?.timezone || settings?.timezone || "America/New_York";
  const cutoff = businessDays[0]?.after?.cutoffMinutes || 0;
  const convert = (value: string) => {
    if (!Number.isFinite(Number(value)) || Number(value) < 0) throw new Error("Tip amounts must be nonnegative numbers");
    const result = toMinorUnits(value, settings?.currencyCode || "USD");
    if (!Number.isSafeInteger(result)) throw new Error("Tip amount is too large");
    return result;
  };
  const cashTips = convert(args.cashTips); const creditTips = convert(args.creditTips); const totalTips = cashTips + creditTips;
  if (!Number.isSafeInteger(totalTips) || totalTips <= 0) throw new Error("Tip pool must contain a positive amount");
  const midnight = new Date(`${day}T00:00:00Z`).getTime();
  const entries = await tx.timeEntry.findMany({ where: { clockIn: { gte: new Date(midnight - 2 * 86400000), lt: new Date(midnight + 3 * 86400000) } }, include: { staff: { select: { id: true, name: true } } }, take: 10001 });
  if (entries.length > 10000) throw new Error("Too many time entries; narrow the reconciliation scope");
  const window = await attendanceDateRange(tx, day, day);
  const eligible = [];
  for (const entry of entries) {
    if ((new Date(entry.clockIn) < window!.gte || new Date(entry.clockIn) >= window!.lt) || !isTipEligibleRole(entry.role) || !entry.staffId) continue;
    const state = await readAttendanceState(tx, entry.id);
    if (!entry.clockOut || !state.attested || !state.approved) throw new Error("All eligible time entries for this business day must be closed, employee-attested and manager-approved");
    eligible.push({ staffId: entry.staffId, staffName: entry.staff?.name || "", role: entry.role, hoursWorked: paidHours(entry), entryId: entry.id, revision: state.revision });
  }
  let distributions;
  if (args.tipPoolType === "individual") {
    if (!args.individualStaffId) throw new Error("Select the employee receiving individual tips");
    const recipient = eligible.filter(row => row.staffId === args.individualStaffId);
    if (!recipient.length) throw new Error("Individual recipient has no approved time for this business day");
    distributions = [{ ...recipient[0], hoursWorked: recipient.reduce((n, row) => n + row.hoursWorked, 0), amount: totalTips }];
  } else distributions = calculateTipDistributions(args.tipPoolType, totalTips, eligible);
  assertTipConservation(totalTips, distributions);
  return { day, timezone, cutoff, currencyCode: settings?.currencyCode || "USD", cashTips, creditTips, totalTips, distributions, timeEvidence: eligible.map(row => ({ entryId: row.entryId, revision: row.revision, hoursWorked: row.hoursWorked })) };
}
export async function previewRestaurantTipPool(_root: unknown, args: TipArgs, context: any) {
  if (!permissions.canManageStaff({ session: context.session })) throw new Error("Staff management permission required");
  return calculateRestaurantTipPool(context.prisma, args);
}
export async function createTipPoolLedger(_root: unknown, args: TipArgs, context: any) {
  if (!permissions.canManageStaff({ session: context.session })) return { success: false, error: "Not authorized to manage tip pools" };
  try {
    const sourceNote = args.sourceNote?.trim();
    if (!sourceNote || sourceNote.length > 1000) throw new Error("Record the source or reconciliation reference for the declared tips");
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await context.prisma.$transaction(async (tx: any) => {
          const result = await calculateRestaurantTipPool(tx, args);
          const fingerprint = idempotencyFingerprint({ ...args, date: result.day });
          const date = new Date(`${result.day}T12:00:00Z`);
          const existing = await tx.tipPool.findMany({ where: { date: { gte: new Date(`${result.day}T00:00:00Z`), lt: new Date(new Date(`${result.day}T00:00:00Z`).getTime() + 86400000) } }, take: 2 });
          if (existing.length) {
            let evidence: any = {}; try { evidence = JSON.parse(existing[0].notes || "{}"); } catch {}
            if (existing.length === 1 && evidence.fingerprint === fingerprint) return { success: true, error: null };
            throw new Error("A tip pool already accounts for this business day; reconcile it before creating another allocation");
          }
          const { day, timezone, cutoff, timeEvidence, currencyCode } = result;
          const notes = JSON.stringify({ source: "manual_reconciled_declaration", sourceNote: sourceNote, day, timezone, cutoff, currencyCode, timeEvidence, fingerprint });
          const pool = await tx.tipPool.create({ data: { date, tipPoolType: args.tipPoolType, cashTips: result.cashTips, creditTips: result.creditTips, totalTips: result.totalTips, distributions: result.distributions, notes, status: "calculated", createdById: context.session.itemId } });
          await appendAuditEventWithClient(tx, context.session.itemId, { eventKey: `tip-pool:calculated:${pool.id}`, eventType: "tip_pool.calculated", entityType: "TipPool", entityId: pool.id, reason: sourceNote, after: { totalTips: result.totalTips, distributions: result.distributions }, metadata: { day, timezone, cutoff, timeEvidence, fingerprint } });
          return { success: true, error: null };
        }, { isolationLevel: "Serializable" });
      } catch (error: any) { if (attempt < 3 && ["P2034", "P2002"].includes(error.code)) continue; throw error; }
    }
  } catch (error: any) { return { success: false, error: error.message }; }
}
export async function updateTipPoolStatus(_root: unknown, args: { tipPoolId: string; action: string; payoutReference?: string }, context: any) {
  if (!permissions.canManageStaff({ session: context.session })) return { success: false, error: "Not authorized to manage tip pools" };
  try {
    const payoutReference = args.payoutReference?.trim();
    if (!payoutReference || payoutReference.length > 500) throw new Error("A payout or payout-reversal reference is required");
    return await context.prisma.$transaction(async (tx: any) => {
      const pool = await tx.tipPool.findUnique({ where: { id: args.tipPoolId } });
      if (!pool) throw new Error("Tip pool not found");
      const distributed = args.action === "distribute";
      if (!distributed && args.action !== "reopen") throw new Error("Invalid tip pool action");
      const eventKey = `tip-pool:${args.action}:${pool.id}:${idempotencyFingerprint({ reference: args.payoutReference })}`;
      if (await tx.auditEvent.findUnique({ where: { eventKey } })) return { success: true, error: null };
      if (pool.status !== (distributed ? "calculated" : "distributed")) throw new Error("Tip pool state changed; refresh before recording acknowledgement");
      assertTipConservation(pool.totalTips, pool.distributions as any);
      await tx.tipPool.update({ where: { id: pool.id }, data: { status: distributed ? "distributed" : "calculated" } });
      await appendAuditEventWithClient(tx, context.session.itemId, { eventKey, eventType: distributed ? "tip_pool.payout_acknowledged" : "tip_pool.payout_reversal_acknowledged", entityType: "TipPool", entityId: pool.id, reason: payoutReference, before: { status: pool.status }, after: { status: distributed ? "distributed" : "calculated" }, metadata: { payoutReference: payoutReference, amount: pool.totalTips, distributions: pool.distributions } });
      return { success: true, error: null };
    }, { isolationLevel: "Serializable" });
  } catch (error: any) { return { success: false, error: error.message }; }
}
