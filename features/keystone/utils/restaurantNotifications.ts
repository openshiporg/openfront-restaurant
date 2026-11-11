import crypto from "node:crypto";
import type { Context } from ".keystone/types";
import { permissions } from "../access";
import { appendAuditEventWithClient } from "./audit";
import { eligibleCampaignRecipient } from "./restaurantCampaigns";

export type NotificationMessage = { to: string; subject: string; text: string; messageId: string };
export type NotificationTransport = (message: NotificationMessage) => Promise<{ accepted: boolean; reference?: string; providerResponse?: string }>;
export async function enqueueRestaurantNotification(tx: any, actorId: string | null | undefined, input: { eventKey: string; entityType: string; entityId: string; to: string; subject: string; text: string; marketing?: { customerId: string; campaignId: string; consentEventId: string } }) {
  if (!input.to) return null;
  const invalidRecipient = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.to);
  return appendAuditEventWithClient(tx, actorId, { eventKey: input.eventKey, eventType: "notification.queued", entityType: input.entityType, entityId: input.entityId, metadata: { to: input.to, invalidRecipient, subject: input.subject.replace(/[\r\n]/g, " ").slice(0, 200), text: input.text.slice(0, 10000), ...(input.marketing ? { marketing: input.marketing } : {}) } });
}
function authorize(context: Context) {
  if (!permissions.canManageOrders({ session: context.session })) throw new Error("Order management is required for customer notifications");
}
async function notificationState(tx: any, notificationId: string) {
  const row = await tx.auditEvent.findUnique({ where: { id: notificationId } });
  if (!row || row.eventType !== "notification.queued") throw new Error("Notification not found");
  const events = await tx.auditEvent.findMany({ where: { entityType: "RestaurantNotification", entityId: notificationId }, take: 100 });
  const latest = events.reduce((best: any, event: any) => Number(event.metadata?.sequence || 0) > Number(best?.metadata?.sequence || 0) ? event : best, null);
  return { row, status: latest?.metadata?.status || "queued", sequence: Number(latest?.metadata?.sequence || 0), latest };
}
async function recordState(tx: any, actorId: string | undefined, notificationId: string, sequence: number, status: string, metadata: Record<string, unknown> = {}) {
  return appendAuditEventWithClient(tx, actorId, { eventKey: `notification-state:${notificationId}:${sequence}`, eventType: `notification.${status}`, entityType: "RestaurantNotification", entityId: notificationId, metadata: { ...metadata, sequence, status } });
}
const ORDER_CONFIRMATION_PREFIX = "notification:order-confirmed:";
const ORDER_READY_PREFIX = "notification:order-ready:";
// Guest transactional mail the server sends on its own; everything else waits for staff in Notifications.
const SYSTEM_PREFIXES = [ORDER_CONFIRMATION_PREFIX, ORDER_READY_PREFIX, "reservation-confirmation:", "gift-delivery:", "gift-receipt:"];

/** Sends one queued guest email by its event key, through the same claim state machine. Never throws. */
export async function deliverSystemNotificationNow(context: Context, eventKey: string, transport: NotificationTransport) {
  try {
    if (!SYSTEM_PREFIXES.some((prefix) => eventKey.startsWith(prefix))) return { status: "not_system" };
    const row = await (context.prisma as any).auditEvent.findUnique({ where: { eventKey } });
    if (!row || row.eventType !== "notification.queued") return { status: "no_event" };
    return await deliverQueuedNotification(context, row.id, transport, false, true);
  } catch {
    return { status: "failed" };
  }
}

/**
 * In-process delivery of ONE order's "received" confirmation right after checkout commits, so a guest
 * checkout does not depend on staff pressing Send. It can only deliver the row whose event key is
 * notification:order-confirmed:<orderId>, and it uses the same claim/processing/accepted state machine
 * as the staff button, so the button cannot resend a row this already accepted. Never throws.
 */
export async function deliverOrderConfirmationNow(context: Context, orderId: string, transport: NotificationTransport) {
  try {
    const row = await (context.prisma as any).auditEvent.findUnique({ where: { eventKey: `${ORDER_CONFIRMATION_PREFIX}${orderId}` } });
    if (!row || row.eventType !== "notification.queued" || row.entityType !== "RestaurantOrder" || row.entityId !== orderId) return { id: "", status: "no_event", error: null };
    return await deliverQueuedNotification(context, row.id, transport, false, true);
  } catch {
    return { id: "", status: "failed", error: "Order confirmation was not delivered; staff can send it from Notifications" };
  }
}
/**
 * "Your order is ready" for an online pickup order, the first time it reaches ready (Toast/Square default).
 * Queued and sent once per order through the same claim state machine; dine-in, delivery and POS orders are skipped. Never throws.
 */
export async function notifyOnlinePickupReady(context: Context, orderId: string, transport: NotificationTransport) {
  try {
    const prisma = context.prisma as any;
    const order = await prisma.restaurantOrder.findUnique({ where: { id: orderId }, select: { id: true, status: true, orderType: true, orderSource: true, orderNumber: true, customerEmail: true, customer: { select: { email: true } } } });
    if (!order || order.status !== "ready" || order.orderType !== "takeout" || order.orderSource !== "online") return { status: "skipped" };
    const to = order.customerEmail || order.customer?.email || "";
    if (!to) return { status: "no_recipient" };
    const settings = await prisma.storeSettings.findUnique({ where: { id: "1" }, select: { name: true, address: true } });
    const store = settings?.name?.trim() || "the restaurant";
    await prisma.$transaction((tx: any) => enqueueRestaurantNotification(tx, null, {
      eventKey: `${ORDER_READY_PREFIX}${order.id}`, entityType: "RestaurantOrder", entityId: order.id, to,
      subject: `Order ${order.orderNumber} is ready for pickup`,
      text: `Your order ${order.orderNumber} from ${store} is ready for pickup.${settings?.address ? `\n\n${settings.address}` : ""}\n\nSee you soon.`,
    }));
    const row = await prisma.auditEvent.findUnique({ where: { eventKey: `${ORDER_READY_PREFIX}${order.id}` } });
    if (!row || row.eventType !== "notification.queued") return { status: "no_event" };
    return await deliverQueuedNotification(context, row.id, transport, false, true);
  } catch {
    return { status: "failed" };
  }
}

export async function deliverQueuedNotification(context: Context, notificationId: string, transport: NotificationTransport, retryUnknown = false, system = false) {
  if (!system) authorize(context);
  const prisma = context.prisma as any;
  const claim = await prisma.$transaction(async (tx: any) => {
    const state = await notificationState(tx, notificationId);
    if (system && !SYSTEM_PREFIXES.some((prefix) => String(state.row.eventKey || "").startsWith(prefix))) throw new Error("System delivery is limited to order confirmations and ready notices");
    if (state.row.metadata?.marketing && !system && !permissions.canManageUsers(context)) throw new Error("User management is required to dispatch marketing");
    if (["accepted", "acknowledged", "suppressed"].includes(state.status)) return { ...state, replay: true };
    if (state.row.eventKey?.startsWith("gift-delivery:")) {
      const gift = await tx.giftCard.findUnique({ where: { id: state.row.entityId } });
      if (!gift || gift.isDisabled || gift.balance !== gift.value) {
        await recordState(tx, context.session?.itemId, notificationId, state.sequence + 1, "suppressed", { reason: "Gift value changed before delivery; contact the recipient with current balance" });
        return { ...state, status: "suppressed", replay: true };
      }
    }
    if (state.row.metadata?.marketing && !await eligibleCampaignRecipient(tx, state.row.metadata.marketing.customerId, state.row.metadata.to)) {
      await recordState(tx, context.session?.itemId, notificationId, state.sequence + 1, "suppressed", { reason: "Customer is no longer eligible or affirmatively opted in" });
      return { ...state, status: "suppressed", replay: true };
    }
    if (state.status === "processing" && (!retryUnknown || Date.now() - new Date(state.latest.createdAt).getTime() < 5 * 60 * 1000)) throw new Error("Notification already has an in-flight attempt; reconcile it before retrying");
    if (state.status === "unknown" && !retryUnknown) throw new Error("Previous delivery outcome is unknown. Confirm the possible duplicate before retrying");
    if (state.sequence >= 40) throw new Error("Notification retry limit reached; contact the customer manually");
    const attemptId = crypto.randomUUID();
    await recordState(tx, context.session?.itemId, notificationId, state.sequence + 1, "processing", { attemptId });
    return { ...state, sequence: state.sequence + 1, attemptId, replay: false };
  }, { isolationLevel: "Serializable" });
  if (claim.replay) return { id: notificationId, status: claim.status, error: null };
  let status = "unknown", reference = "", providerResponse = "", error: string | null = null;
  try {
    // Recheck after the claim and immediately before the transport boundary.
    if (claim.row.metadata?.marketing && !await eligibleCampaignRecipient(prisma, claim.row.metadata.marketing.customerId, claim.row.metadata.to)) {
      status = "suppressed";
    } else {
    const result = claim.row.metadata?.invalidRecipient ? { accepted: false } : await transport({ ...claim.row.metadata, messageId: `<restaurant-${notificationId}@notifications.local>` });
    status = result.accepted ? "accepted" : "failed";
    reference = result.reference || "";
    providerResponse = result.providerResponse || "";
    if (!result.accepted) error = "Transport rejected the notification";
    }
  } catch { error = "Delivery outcome is unknown; reconcile the original attempt before retrying"; }
  await prisma.$transaction(async (tx: any) => {
    const current = await notificationState(tx, notificationId);
    if (current.sequence !== claim.sequence || current.status !== "processing") throw new Error("Notification state changed during delivery; reconcile the original attempt");
    await recordState(tx, context.session?.itemId, notificationId, current.sequence + 1, status, { attemptId: claim.attemptId, reference, ...(providerResponse ? { providerResponse } : {}), error });
  }, { isolationLevel: "Serializable" });
  return { id: notificationId, status, error };
}
export async function acknowledgeRestaurantNotification(_root: unknown, { notificationId, reason }: { notificationId: string; reason: string }, context: Context) {
  authorize(context); if (!reason?.trim()) throw new Error("Manual contact/reconciliation evidence is required");
  return (context.prisma as any).$transaction(async (tx: any) => {
    const state = await notificationState(tx, notificationId);
    if (state.status === "processing" && Date.now() - new Date(state.latest.createdAt).getTime() < 5 * 60 * 1000) throw new Error("Notification is still in flight");
    if (state.status !== "acknowledged") await recordState(tx, context.session?.itemId, notificationId, state.sequence + 1, "acknowledged", { reason: reason.trim() });
    return { id: notificationId, status: "acknowledged", error: null };
  }, { isolationLevel: "Serializable" });
}
const NOTIFICATION_FILTERS = new Set(["all", "unresolved", "queued", "processing", "unknown", "failed", "accepted", "acknowledged", "suppressed"]);
const NOTIFICATION_SCAN_BATCH = 100;

function matchesNotificationStatus(status: string, filter: string) {
  if (filter === "all") return true;
  if (filter === "unresolved") return !["acknowledged", "suppressed"].includes(status);
  return status === filter;
}

/** Paginate after computing each row's latest state, not before filtering the queue. */
export async function restaurantNotifications(_root: unknown, args: { status?: string | null; limit?: number | null; cursor?: string | null }, context: Context) {
  authorize(context);
  const filter = args.status || "unresolved";
  const limit = args.limit ?? 50;
  const cursor = args.cursor || null;
  if (!NOTIFICATION_FILTERS.has(filter)) throw new Error("Unsupported notification status filter");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Notification page size is invalid");
  if (cursor && cursor.length > 200) throw new Error("Notification cursor is invalid");

  const prisma = context.prisma as any;
  if (cursor) {
    const cursorRow = await prisma.auditEvent.findUnique({ where: { id: cursor }, select: { id: true, eventType: true } });
    if (cursorRow?.eventType !== "notification.queued") throw new Error("Notification cursor is invalid");
  }

  const items: any[] = [];
  let scanCursor = cursor;
  let nextCursor: string | null = null;
  let hasMore = false;
  while (true) {
    const batch = await prisma.auditEvent.findMany({
      where: { eventType: "notification.queued" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(scanCursor ? { cursor: { id: scanCursor }, skip: 1 } : {}),
      take: NOTIFICATION_SCAN_BATCH,
    });
    if (!batch.length) break;
    const ids = batch.map((row: any) => row.id);
    const states = await prisma.auditEvent.findMany({
      where: { entityType: "RestaurantNotification", entityId: { in: ids } },
    });
    const latestByNotification = new Map<string, any>();
    for (const event of states) {
      const current = latestByNotification.get(event.entityId);
      if (!current || Number(event.metadata?.sequence || 0) > Number(current.metadata?.sequence || 0)) {
        latestByNotification.set(event.entityId, event);
      }
    }

    for (const row of batch) {
      const latest = latestByNotification.get(row.id);
      const status = latest?.metadata?.status || "queued";
      if (matchesNotificationStatus(status, filter)) {
        if (items.length === limit) {
          hasMore = true;
          break;
        }
        items.push({
          id: row.id,
          recipient: row.metadata?.to,
          subject: row.metadata?.subject,
          entityId: row.entityId,
          status,
          error: latest?.metadata?.error || latest?.metadata?.reason || null,
        });
      }
      scanCursor = row.id;
    }
    if (hasMore) {
      nextCursor = scanCursor;
      break;
    }
    if (batch.length < NOTIFICATION_SCAN_BATCH) break;
  }
  return { items, status: filter, limit, hasMore, nextCursor: hasMore ? nextCursor : null };
}
