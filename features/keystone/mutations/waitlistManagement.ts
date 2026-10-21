import { appendAuditEventWithClient } from "../utils/audit";
import type { Context } from ".keystone/types";
import { permissions } from "../access";
import { serviceTransaction } from "../utils/serviceOrderState";
import { assertSeatAvailable, releaseTableIfUnused } from "../utils/serviceSeating";

interface CreateWaitlistEntryArgs {
  customerName: string;
  phoneNumber: string;
  partySize: number;
  quotedWaitTime?: number | null;
  notes?: string | null;
}

interface UpdateWaitlistStatusArgs {
  entryId: string;
  action: "notify" | "seat" | "complete" | "cancel" | "no_show";
  tableId?: string | null;
  contactConfirmed?: boolean | null;
}

interface WaitlistMutationResult {
  success: boolean;
  error: string | null;
}

function normalizePartySize(value: unknown) {
  return Math.max(1, Math.floor(Number(value || 1)));
}

function normalizeQuotedWait(value: unknown) {
  return Math.max(0, Math.floor(Number(value || 15)));
}

export async function createWaitlistEntry(
  root: any,
  args: CreateWaitlistEntryArgs,
  context: Context
): Promise<WaitlistMutationResult> {
  if (!permissions.canManageKitchen({ session: context.session })) {
    return { success: false, error: "Not authorized to manage waitlist" };
  }

  const customerName = args.customerName?.trim();
  const phoneNumber = args.phoneNumber?.trim();
  if (!customerName) return { success: false, error: "Guest name is required" };
  if (!phoneNumber) return { success: false, error: "Phone number is required" };

  try {
    await context.sudo().db.WaitlistEntry.createOne({
      data: {
        customerName,
        phoneNumber,
        partySize: normalizePartySize(args.partySize),
        quotedWaitTime: normalizeQuotedWait(args.quotedWaitTime),
        notes: args.notes?.trim() || "",
        status: "waiting",
        addedBy: context.session?.itemId ? { connect: { id: context.session.itemId } } : undefined,
      },
    });

    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function updateWaitlistStatus(
  root: any,
  args: UpdateWaitlistStatusArgs,
  context: Context
): Promise<WaitlistMutationResult> {
  if (!permissions.canManageKitchen({ session: context.session })) {
    return { success: false, error: "Not authorized to manage waitlist" };
  }

  if (!args.entryId) return { success: false, error: "Waitlist entry is required" };

  try {
    await serviceTransaction(context.prisma, async tx => {
      const entry = await tx.waitlistEntry.findUnique({ where: { id: args.entryId } });
      if (!entry) throw new Error("Waitlist entry not found");
      const next: Record<string, string> = { notify: "notified", seat: "seated", complete: "completed", cancel: "cancelled", no_show: "no_show" };
      const status = next[args.action];
      if (!status) throw new Error("Invalid waitlist action");
      if (entry.status === status) return;
      if (["cancelled", "no_show", "completed"].includes(entry.status) || (entry.status === "seated" && status !== "completed") || (status === "completed" && entry.status !== "seated")) throw new Error("Invalid waitlist lifecycle transition");
      const now = new Date();
      if (status === "notified") {
        if (!args.contactConfirmed) throw new Error("Contact the guest first, then confirm manual contact");
        await appendAuditEventWithClient(tx, context.session?.itemId, { eventKey: `waitlist-contact:${entry.id}`, eventType: "waitlist.manual_contact", entityType: "WaitlistEntry", entityId: entry.id, after: { channel: "manual_phone", contactedAt: now.toISOString() } });
      }
      if (status === "seated") {
        if (!args.tableId) throw new Error("Select a table before seating");
        await assertSeatAvailable(tx, args.tableId, entry.partySize);
        await tx.table.update({ where: { id: args.tableId }, data: { status: "occupied" } });
      }
      await tx.waitlistEntry.update({ where: { id: entry.id }, data: {
        status, notifiedAt: status === "notified" ? now : undefined,
        seatedAt: status === "seated" ? now : undefined, tableId: status === "seated" ? args.tableId : undefined,
      } });
      if (status === "completed" && entry.tableId) await releaseTableIfUnused(tx, entry.tableId);
    });

    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
