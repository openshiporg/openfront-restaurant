import crypto from "crypto";
import type { Context } from ".keystone/types";
import { providerRefundObservation, recordVerifiedProviderRefund } from "../utils/providerRefunds";
import { handleWebhook, getPaymentStatus } from "../utils/paymentProviderAdapter";
import { writeSaleEvidence } from "../utils/paymentEvidence";
import { finalizePaidOrder } from "../utils/orderCompletion";
import { nextPaymentStatus, webhookPaymentStatus, firstSettlementTime } from "../utils/paymentState";
import { completeVerifiedCheckout } from "./completeActiveCart";
import { syncKitchenTicketsForOrder } from "../utils/kitchenTicketSync";

function normalizeHeaders(headers: any) {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers || {})) {
    normalized[String(key).toLowerCase()] = Array.isArray(value)
      ? String(value[0] || "")
      : String(value ?? "");
  }
  return normalized;
}

async function markWebhookFailedUnlessTerminal(context: Context, inboxId: string, error: string) {
  // Correlation errors and post-commit projection errors can race a second delivery.
  // Keep processed/ignored inbox records terminal and count only nonterminal failures.
  await (context.prisma as any).paymentWebhookEvent.updateMany({
    where: { id: inboxId, status: { notIn: ["processed", "ignored"] } },
    data: { status: "failed", attempts: { increment: 1 }, error },
  });
}

function getCandidateProviderPaymentIds(type: string, resource: any) {
  const ids = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === "string" && value.trim()) ids.add(value.trim());
  };
  add(resource?.id);
  add(resource?.payment_intent);
  add(resource?.charge);
  add(resource?.supplementary_data?.related_ids?.order_id);
  add(resource?.supplementary_data?.related_ids?.capture_id);
  for (const link of resource?.links || []) {
    if (link.rel === "up" && typeof link.href === "string") {
      const capture = link.href.match(/\/v2\/payments\/captures\/([^/?#]+)/);
      if (capture) add(capture[1]);
    }
  }
  if (type.startsWith("PAYMENT.CAPTURE.")) {
    add(resource?.supplementary_data?.related_ids?.order_id);
    add(resource?.id);
  }
  return Array.from(ids);
}

async function findPaymentByProviderIds(providerPaymentIds: string[], providerId: string, context: Context) {
  const sudo = context.sudo();
  const matches = new Map<string, any>();
  const addMatches = (payments: readonly any[]) => {
    for (const payment of payments) if (payment?.id) matches.set(payment.id, payment);
    if (matches.size > 1) throw new Error("Provider payment reference matches multiple local payments; manual reconciliation required");
  };
  for (const providerPaymentId of providerPaymentIds) {
    const payments = await sudo.query.Payment.findMany({
      where: { providerPaymentId: { equals: providerPaymentId }, paymentProvider: { id: { equals: providerId } } },
      query: "id status data order { id status orderSource }",
      take: 2,
    });
    addMatches(payments);
  }
  const legacyMatches = await (context.prisma as any).payment.findMany({
    where: { paymentProviderId: providerId, OR: providerPaymentIds.flatMap(id => [{ data: { path: ["captureId"], equals: id } }, { data: { path: ["chargeId"], equals: id } }]) },
    include: { order: true },
    take: 2,
  });
  addMatches(legacyMatches);
  return matches.values().next().value || null;
}

export default async function handlePaymentProviderWebhook(
  _root: unknown,
  {
    providerCode,
    event,
    headers,
    rawBody,
  }: { providerCode: string; event: any; headers: any; rawBody?: string | null },
  context: Context,
  offlineAdapters?: { getPaymentStatus?: typeof getPaymentStatus }
) {
  const readProviderStatus = offlineAdapters?.getPaymentStatus || getPaymentStatus;
  if (!providerCode || !/^[a-z0-9_-]+$/i.test(providerCode)) throw new Error("Invalid provider code");
  if (!event || typeof event !== "object") throw new Error("Webhook event payload is required");
  const normalizedHeaders = normalizeHeaders(headers);
  const providers = await context.sudo().query.PaymentProvider.findMany({
    where: { code: { equals: providerCode } },
    query: "id code isInstalled createPaymentFunction capturePaymentFunction refundPaymentFunction getPaymentStatusFunction generatePaymentLinkFunction handleWebhookFunction credentials metadata",
    take: 1,
  });
  const provider = providers[0];
  if (!provider?.isInstalled) throw new Error(`Payment provider ${providerCode} not found or not installed`);
  if (!provider.handleWebhookFunction || provider.handleWebhookFunction === "manual") {
    throw new Error(`Provider ${providerCode} does not support authenticated webhook handling`);
  }

  const parsed = await handleWebhook({
    provider,
    event,
    headers: normalizedHeaders,
    rawBody: rawBody || undefined,
  });
  if (!parsed?.isValid || !parsed?.type) throw new Error("Webhook verification failed");
  const type = String(parsed.type);
  const resource = parsed.resource || {};
  const providerEventId = String(parsed.event?.id || event?.id || "");
  const eventKey = `${providerCode}:${providerEventId || crypto.createHash("sha256").update(rawBody || JSON.stringify(event)).digest("hex")}`;

  const existing = await (context.sudo().query as any).PaymentWebhookEvent.findMany({
    where: { eventKey: { equals: eventKey } },
    query: "id status",
    take: 1,
  });
  if (existing[0]?.status === "ignored" && webhookPaymentStatus(type) === null && !["charge.refunded", "refund.created", "refund.updated", "refund.failed", "PAYMENT.CAPTURE.REFUNDED"].includes(type)) {
    return { success: true, error: null };
  }

  let inbox = existing[0];
  if (!inbox) {
    inbox = await (context.sudo().query as any).PaymentWebhookEvent.createOne({
      data: {
        eventKey,
        providerCode,
        providerEventId,
        eventType: type,
        status: "received",
        payload: event,
        rawBody: rawBody || JSON.stringify(event),
        attempts: 0,
      },
      query: "id status",
    });
  }

  const candidateIds = getCandidateProviderPaymentIds(type, resource);
  let payment: any = null;
  try {
    payment = candidateIds.length ? await findPaymentByProviderIds(candidateIds, provider.id, context) : null;
    if (!payment && candidateIds.length && webhookPaymentStatus(type) === "succeeded") {
      const checkout = await (context.prisma as any).paymentSession.findFirst({
        where: { paymentProviderId: provider.id, OR: candidateIds.flatMap(id => [{ data: { path: ["paymentIntentId"], equals: id } }, { data: { path: ["orderId"], equals: id } }]) },
        include: { paymentCollection: { include: { cart: true } } },
      });
      const cartId = checkout?.paymentCollection?.cart?.id;
      const reference = checkout?.data?.paymentIntentId || checkout?.data?.orderId;
      if (cartId && checkout.data?.checkoutQuote && reference) {
        await completeVerifiedCheckout(context, { cartId, paymentSessionId: checkout.id, providerId: provider.id, providerPaymentId: reference });
        payment = await findPaymentByProviderIds(candidateIds, provider.id, context);
      }
    }
  } catch (error) {
    await markWebhookFailedUnlessTerminal(
      context,
      inbox.id,
      error instanceof Error ? error.message : "Provider payment correlation failed",
    );
    throw error;
  }
  if (!payment) {
    await markWebhookFailedUnlessTerminal(context, inbox.id, "Awaiting payment correlation; retry this verified event");
    throw new Error("Payment correlation pending; retry webhook");
  }

  try {
    const refundEvent = ["charge.refunded", "refund.created", "refund.updated", "refund.failed", "PAYMENT.CAPTURE.REFUNDED"].includes(type);
    let refundResources: any[] = [];
    if (refundEvent) {
      if (type === "charge.refunded") {
        refundResources = resource.refunds?.data || [];
        if (resource.refunds?.has_more || !refundResources.length) {
          const providerId = resource.payment_intent;
          if (!providerId) throw new Error("Refund event lacks an intent for complete provider reconciliation");
          const observed = await readProviderStatus({ provider, paymentId: providerId });
          if (!observed.refundsComplete) throw new Error("Provider refund list is incomplete; reconcile before acknowledging this event");
          refundResources = observed.refunds || [];
        }
        if (!refundResources.length) throw new Error("Refund event has no complete refund records");
      } else refundResources = [resource];
    }
    const prisma = context.prisma as any;
    await prisma.$transaction(async (tx: any) => {
      const currentInbox = await tx.paymentWebhookEvent.findUnique({ where: { eventKey } });
      if (currentInbox?.status === "processed") return;
      if (refundEvent) for (const resource of refundResources) await recordVerifiedProviderRefund(tx, { paymentId: payment.id, providerId: provider.id, providerCode, refund: providerRefundObservation(resource) });
      const currentPayment = await tx.payment.findUnique({ where: { id: payment.id } });
      const observation = webhookPaymentStatus(type);
      if (observation === "succeeded") {
        const received = providerRefundObservation({ ...resource, status: "succeeded", amount: typeof resource.amount === "object" ? resource.amount : resource.amount_received ?? resource.amount_captured ?? resource.amount });
        if (received.amount !== currentPayment.amount || received.currencyCode !== (currentPayment.currencyCode || "USD").toUpperCase()) throw new Error("Provider capture amount/currency differs from the reserved tender; reconciliation required");
      }
      const status = observation ? nextPaymentStatus(currentPayment.status, observation) : null;
      if (status) {
        const updatedPayment = await tx.payment.update({
          where: { id: payment.id },
          data: {
            status,
            processedAt: firstSettlementTime(currentPayment.processedAt, status),
            errorMessage: status === "failed"
              ? resource.last_payment_error?.message || resource.status_details?.reason || "Payment failed"
              : "",
            data: {
              ...(currentPayment.data || {}),
              webhookType: type,
              webhookEventId: providerEventId,
              webhookResourceId: resource.id || null,
              chargeId: resource.latest_charge || currentPayment.data?.chargeId || null,
              captureId: resource.supplementary_data?.related_ids?.capture_id || (type === "PAYMENT.CAPTURE.COMPLETED" ? resource.id : null) || currentPayment.data?.captureId || null,
            },
          },
        });
        if (status === "succeeded" && payment.order?.id) {
          const order = await tx.restaurantOrder.findUnique({ where: { id: payment.order.id } });
          const tenders = await tx.payment.findMany({ where: { orderId: order.id, status: { in: ["succeeded", "partially_refunded", "refunded"] } } });
          const paid = tenders.reduce((sum: number, tender: any) => sum + Math.max(0, Number(tender.amount || 0) - Number(tender.refundedAmount || 0)), 0);
          await writeSaleEvidence(tx, null, { payment: updatedPayment, order, remainingBalance: Math.max(0, Number(order.total || 0) - paid) });
        }
        if (
          status === "succeeded" &&
          payment.order?.id &&
          payment.order.orderSource === "online" &&
          payment.order.status === "open"
        ) {
          await tx.restaurantOrder.updateMany({ where: { id: payment.order.id, status: "open" }, data: { status: "sent_to_kitchen" } });
        }
      }
      await tx.paymentWebhookEvent.update({
        where: { id: inbox.id },
        data: {
          paymentId: payment.id,
          status: status || refundEvent ? "processed" : "ignored",
          attempts: Number(currentInbox?.attempts || 0) + 1,
          processedAt: new Date(),
          error: "",
        },
      });
    }, { isolationLevel: "Serializable" });
    if (
      webhookPaymentStatus(type) === "succeeded" &&
      payment.order?.id &&
      payment.order.orderSource === "pos"
    ) {
      await finalizePaidOrder(payment.order.id, context);
    }
    if (webhookPaymentStatus(type) === "succeeded" && payment.order?.id && payment.order.orderSource === "online") await syncKitchenTicketsForOrder(payment.order.id, context);
    return { success: true, error: null };
  } catch (error) {
    // Post-commit projection failures must not downgrade a terminal event.
    await markWebhookFailedUnlessTerminal(
      context,
      inbox.id,
      error instanceof Error ? error.message : "Unknown webhook processing error",
    );
    throw error;
  }
}
