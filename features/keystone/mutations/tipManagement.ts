import type { Context } from ".keystone/types";
import { permissions } from "../access";
import {
  assertTipConservation,
  calculateTipDistributions,
} from "../../lib/tip-allocation";
import { appendAuditEvent } from "../utils/audit";

interface CreateTipPoolArgs {
  date: string;
  tipPoolType: "individual" | "pool_by_role" | "house_pool";
  cashTips: string;
  creditTips: string;
}

interface UpdateTipPoolStatusArgs {
  tipPoolId: string;
  action: "distribute" | "reopen";
}

interface TipPoolMutationResult {
  success: boolean;
  error: string | null;
}

function dollarsToCents(value: unknown) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed * 100));
}

function getBusinessDayWindow(date: string) {
  const start = new Date(date);
  if (Number.isNaN(start.getTime())) throw new Error("Business date is invalid");
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function calculateHours(entry: any) {
  if (typeof entry.hoursWorked === "number") return entry.hoursWorked;
  if (!entry.clockIn || !entry.clockOut) return 0;
  const start = new Date(entry.clockIn);
  const end = new Date(entry.clockOut);
  return Math.max(0, Math.round(((end.getTime() - start.getTime()) / 3_600_000) * 100) / 100);
}

async function calculateDistributions({
  tipPoolType,
  totalTipsCents,
  startDate,
  endDate,
  context,
}: {
  tipPoolType: string;
  totalTipsCents: number;
  startDate: string;
  endDate: string;
  context: Context;
}) {
  if (tipPoolType === "individual") return [];

  const entries = await context.sudo().query.Shift.findMany({
    where: {
      status: { equals: "completed" },
      clockIn: { gte: startDate, lte: endDate },
    },
    query: "id role hoursWorked clockIn clockOut staff { id name }",
  });

  const distributions = calculateTipDistributions(
    tipPoolType as "house_pool" | "pool_by_role",
    totalTipsCents,
    entries.map((entry: any) => ({
      staffId: entry.staff?.id || "",
      staffName: entry.staff?.name || "",
      role: entry.role || "",
      hoursWorked: calculateHours(entry),
    }))
  );
  assertTipConservation(totalTipsCents, distributions);
  return distributions;
}

export async function createTipPoolLedger(
  root: any,
  args: CreateTipPoolArgs,
  context: Context
): Promise<TipPoolMutationResult> {
  if (!permissions.canManageStaff({ session: context.session })) {
    return { success: false, error: "Not authorized to manage tip pools" };
  }

  if (!["individual", "pool_by_role", "house_pool"].includes(args.tipPoolType)) {
    return { success: false, error: "Invalid tip pool type" };
  }

  try {
    const { start, end } = getBusinessDayWindow(args.date);
    const cashTips = dollarsToCents(args.cashTips);
    const creditTips = dollarsToCents(args.creditTips);
    const totalTips = cashTips + creditTips;

    if (totalTips <= 0) return { success: false, error: "Tip pool must include cash or credit tips" };

    const existing = await context.sudo().query.TipPool.findMany({
      where: {
        date: { gte: start.toISOString(), lte: end.toISOString() },
        tipPoolType: { equals: args.tipPoolType },
        status: { in: ["open", "calculated"] },
      },
      query: "id status tipPoolType",
      take: 1,
    });

    if (existing.length > 0) {
      return { success: false, error: "An open or calculated tip pool already exists for this date and type" };
    }

    const distributions = await calculateDistributions({
      tipPoolType: args.tipPoolType,
      totalTipsCents: totalTips,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      context,
    });

    if (args.tipPoolType !== "individual" && distributions.length === 0) {
      return { success: false, error: "No completed shifts found for this tip pool" };
    }

    const tipPool = await context.sudo().db.TipPool.createOne({
      data: {
        date: start.toISOString(),
        tipPoolType: args.tipPoolType,
        totalTips,
        cashTips,
        creditTips,
        distributions,
        status: "calculated",
        createdBy: context.session?.itemId ? { connect: { id: context.session.itemId } } : undefined,
      },
    });
    await appendAuditEvent(context, {
      eventType: "tip_pool.calculated",
      entityType: "TipPool",
      entityId: tipPool.id,
      after: { totalTips, distributions },
    });

    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function updateTipPoolStatus(
  root: any,
  args: UpdateTipPoolStatusArgs,
  context: Context
): Promise<TipPoolMutationResult> {
  if (!permissions.canManageStaff({ session: context.session })) {
    return { success: false, error: "Not authorized to manage tip pools" };
  }

  try {
    const tipPool = await context.sudo().query.TipPool.findOne({
      where: { id: args.tipPoolId },
      query: "id status",
    });
    if (!tipPool) return { success: false, error: "Tip pool not found" };

    if (args.action === "distribute") {
      if (tipPool.status !== "calculated") return { success: false, error: "Only calculated tip pools can be distributed" };
      await context.sudo().db.TipPool.updateOne({ where: { id: args.tipPoolId }, data: { status: "distributed" } });
      await appendAuditEvent(context, {
        eventType: "tip_pool.marked_distributed",
        entityType: "TipPool",
        entityId: args.tipPoolId,
        before: { status: tipPool.status },
        after: { status: "distributed" },
      });
    } else if (args.action === "reopen") {
      if (tipPool.status !== "distributed") return { success: false, error: "Only distributed tip pools can be reopened" };
      await context.sudo().db.TipPool.updateOne({ where: { id: args.tipPoolId }, data: { status: "calculated" } });
      await appendAuditEvent(context, {
        eventType: "tip_pool.reopened",
        entityType: "TipPool",
        entityId: args.tipPoolId,
        before: { status: tipPool.status },
        after: { status: "calculated" },
      });
    } else {
      return { success: false, error: "Invalid tip pool action" };
    }

    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
