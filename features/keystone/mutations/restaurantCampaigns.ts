import crypto from "node:crypto";
import type { Context } from ".keystone/types";
import { permissions } from "../access";
import { serviceTransaction } from "../utils/serviceOrderState";
import { appendAuditEventWithClient } from "../utils/audit";
import { eligibleCampaignRecipient } from "../utils/restaurantCampaigns";
import { enqueueRestaurantNotification, deliverQueuedNotification } from "../utils/restaurantNotifications";
import { smtpNotificationTransport } from "../../integrations/notifications/smtp";
function authorize(context: Context) { if (!permissions.canManageUsers(context) || !permissions.canManageOrders(context)) throw new Error("User and order management are required for campaigns"); }
export async function previewRestaurantCampaign(_root: unknown, _args: unknown, context: Context) {
  authorize(context); const tx = context.prisma as any;
  const users = await tx.user.findMany({ where: { isActive: true, staffRole: null }, orderBy: { id: "asc" }, take: 501, select: { id: true } });
  const recipients: any[] = [];
  for (const user of users.slice(0, 500)) { const recipient = await eligibleCampaignRecipient(tx, user.id); if (recipient) recipients.push(recipient); }
  return { recipients, examined: Math.min(users.length, 500), limited: users.length > 500, note: "Manual campaigns examine at most 500 customer accounts. Consent is checked again at queue and send." };
}
export async function createRestaurantCampaign(_root: unknown, input: { requestKey: string; subject: string; text: string; customerIds: string[] }, context: Context) {
  authorize(context);
  const subject = input.subject.trim(), text = input.text.trim(), ids = [...new Set(input.customerIds)].sort();
  if (!/^[\w-]{8,100}$/.test(input.requestKey) || !subject || subject.length > 150 || /[\r\n]/.test(subject) || text.length < 3 || text.length > 8000 || !ids.length || ids.length > 100) throw new Error("Campaign requires a subject, 3–8000 character message and 1–100 selected recipients");
  const fingerprint = crypto.createHash("sha256").update(JSON.stringify({ subject, text, ids })).digest("hex");
  return serviceTransaction(context.prisma, async tx => {
    const eventKey = `campaign:${input.requestKey}`; const prior = await tx.auditEvent.findUnique({ where: { eventKey } });
    if (prior) { if (prior.metadata.fingerprint !== fingerprint) throw new Error("Campaign request key was reused with different content"); return { id: prior.id, queued: prior.metadata.queued, suppressed: prior.metadata.suppressed }; }
    const eligible: any[] = [];
    for (const id of ids) { const recipient = await eligibleCampaignRecipient(tx, id); if (recipient) eligible.push(recipient); }
    const campaign = await appendAuditEventWithClient(tx, context.session?.itemId, { eventKey, eventType: "campaign.created", entityType: "RestaurantCampaign", entityId: input.requestKey, metadata: { fingerprint, subject, text, selected: ids.length, queued: eligible.length, suppressed: ids.length - eligible.length, dispatchMode: "explicit_operator" } });
    for (const recipient of eligible) await enqueueRestaurantNotification(tx, context.session?.itemId, { eventKey: `campaign-notification:${campaign.id}:${recipient.id}`, entityType: "RestaurantCampaign", entityId: campaign.id, to: recipient.email, subject, text: `${text}\n\nYou opted in to restaurant marketing. Manage your email preferences in your restaurant account, or contact the restaurant to stop these messages.`, marketing: { customerId: recipient.id, campaignId: campaign.id, consentEventId: recipient.consentEventId } });
    return { id: campaign.id, queued: eligible.length, suppressed: ids.length - eligible.length };
  });
}
export async function dispatchRestaurantCampaign(_root: unknown, { campaignId }: { campaignId: string }, context: Context, transport = smtpNotificationTransport) {
  authorize(context); const tx = context.prisma as any;
  const campaign = await tx.auditEvent.findUnique({ where: { id: campaignId } }); if (campaign?.eventType !== "campaign.created") throw new Error("Campaign not found");
  const rows = await tx.auditEvent.findMany({ where: { eventType: "notification.queued", entityType: "RestaurantCampaign", entityId: campaignId }, take: 100 });
  const outcomes = [];
  // A bounded explicit action processes ten messages; accepted/suppressed rows
  // are harmless replays and never resent. Unknown outcomes require individual review.
  for (const row of rows) {
    const events = await tx.auditEvent.findMany({ where: { entityType: "RestaurantNotification", entityId: row.id }, take: 100 });
    const state = events.reduce((best: any, event: any) => Number(event.metadata?.sequence || 0) > Number(best?.metadata?.sequence || 0) ? event : best, null);
    if (!["queued", "failed"].includes(state?.metadata?.status || "queued")) continue;
    try { outcomes.push(await deliverQueuedNotification(context, row.id, typeof transport === "function" ? transport : smtpNotificationTransport, false)); }
    catch { outcomes.push({ id: row.id, status: "review_required", error: "Review the original notification attempt before retrying" }); }
    if (outcomes.length >= 10) break;
  }
  return { campaignId, outcomes, note: "At most ten attempts per explicit dispatch; use notifications for uncertain delivery review." };
}
