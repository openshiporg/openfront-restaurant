import { isSignedIn, permissions } from "../access";
import { appendAuditEventWithClient } from "../utils/audit";
import { providerRefundObservation, recordVerifiedProviderRefund } from "../utils/providerRefunds";
import { REFUND_CORRELATION_PENDING_ERROR, VERIFIED_STRIPE_REFUND_EVENT_TYPES } from "../../lib/verified-refund-webhook";

const SAFE_STRIPE_REFUND_EVENTS = new Set<string>(VERIFIED_STRIPE_REFUND_EVENT_TYPES);
const MAX_REFUNDS_PER_EVENT = 100;

/**
 * Manager-only, local replay for the narrow Stripe refund events whose original
 * signature-verified inbox write failed solely because Payment correlation had
 * not arrived yet. This path intentionally has no payment-provider adapter calls.
 */
export default async function retryVerifiedRefundWebhook(
  _root: unknown,
  { eventId }: { eventId: string },
  context: any,
) {
  if (!isSignedIn({ session: context.session }) || !permissions.canManagePayments({ session: context.session })) {
    throw new Error("Not authorized to retry a provider refund event");
  }
  if (typeof eventId !== "string" || !eventId.trim()) throw new Error("A webhook event id is required");

  const providers = await context.sudo().query.PaymentProvider.findMany({
    where: { code: { equals: "pp_stripe_stripe" } },
    query: "id code isInstalled handleWebhookFunction",
    take: 1,
  });
  const provider = providers[0];
  // PayPal verification is remote and adapter URLs are configurable; this local
  // recovery is deliberately limited to the registered, locally-verified Stripe adapter.
  if (!provider?.isInstalled || provider.code !== "pp_stripe_stripe" || provider.handleWebhookFunction !== "stripe") {
    throw new Error("Local refund-event recovery is unavailable for this provider configuration");
  }

  for (let attempt = 0; ; attempt++) {
    try {
      return await (context.transaction as any)(async (transactionContext: any) => {
        const tx = transactionContext.prisma;
        const inbox = await tx.paymentWebhookEvent.findUnique({ where: { id: eventId } });
        if (!inbox) throw new Error("Verified refund event was not found");
        if (inbox.status === "processed") {
          return { success: true, status: "processed", refundCount: 0, alreadyProcessed: true };
        }
        if (inbox.status !== "failed" || inbox.error !== REFUND_CORRELATION_PENDING_ERROR) {
          throw new Error("Only failed refund events awaiting payment correlation can be replayed");
        }
        if (inbox.providerCode !== provider.code || !SAFE_STRIPE_REFUND_EVENTS.has(inbox.eventType || "")) {
          throw new Error("This verified event is outside the local refund-recovery boundary");
        }

        const event = inbox.payload as any;
        if (!event || event.type !== inbox.eventType || !event.data?.object || typeof event.data.object !== "object") {
          throw new Error("Stored refund event payload is incomplete");
        }
        const resource = event.data.object;
        const paymentIntentId = resource.payment_intent;
        if (typeof paymentIntentId !== "string" || !paymentIntentId.trim()) {
          throw new Error("Refund event lacks a payment-intent correlation; manual provider reconciliation is required");
        }

        let resources: any[];
        if (inbox.eventType === "charge.refunded") {
          const refundList = resource.refunds;
          if (refundList?.has_more !== false || !Array.isArray(refundList.data) || refundList.data.length === 0) {
            throw new Error("Refund event does not contain a complete refund list; provider reconciliation is required");
          }
          resources = refundList.data;
        } else {
          resources = [resource];
        }
        if (resources.length > MAX_REFUNDS_PER_EVENT) throw new Error("Refund event exceeds the local recovery limit");
        if (resources.some((refund: any) => refund.payment_intent && refund.payment_intent !== paymentIntentId)) {
          throw new Error("Refund resource does not match the event payment intent");
        }
        const observations = resources.map(providerRefundObservation);

        const payments = await tx.payment.findMany({
          where: { paymentProviderId: provider.id, providerPaymentId: paymentIntentId },
          include: { order: true },
          take: 2,
        });
        if (payments.length !== 1 || !payments[0]?.order) {
          throw new Error(payments.length > 1
            ? "Refund event matches multiple payments; retain it for manual review"
            : "Payment correlation pending; retain this event for manual review");
        }
        const payment = payments[0];
        if (payment.data?.purpose || payment.order.orderSource === "gift_card" || payment.paymentMethod === "gift_card") {
          throw new Error("Stored-value refund events require their dedicated provider-reconciliation workflow");
        }

        for (const refund of observations) {
          await recordVerifiedProviderRefund(tx, {
            paymentId: payment.id,
            providerId: provider.id,
            providerCode: provider.code,
            refund,
            actorId: context.session.itemId,
          });
        }
        await appendAuditEventWithClient(tx, context.session.itemId, {
          eventKey: `payment-webhook-refund-replay:${inbox.id}`,
          eventType: "payment.webhook_refund_replayed",
          entityType: "PaymentWebhookEvent",
          entityId: inbox.id,
          after: { paymentId: payment.id, refundIds: observations.map(refund => refund.id) },
          metadata: { providerCode: provider.code, providerEventId: inbox.providerEventId, eventType: inbox.eventType },
        });
        await tx.paymentWebhookEvent.update({
          where: { id: inbox.id },
          data: {
            paymentId: payment.id,
            status: "processed",
            attempts: Number(inbox.attempts || 0) + 1,
            processedAt: new Date(),
            error: "",
          },
        });
        return { success: true, status: "processed", refundCount: observations.length, alreadyProcessed: false };
      }, { isolationLevel: "Serializable" });
    } catch (error: any) {
      if (attempt < 2 && ["P2034", "P2002"].includes(error?.code)) continue;
      throw error;
    }
  }
}
