import crypto from "crypto";
import type { Context } from ".keystone/types";
import { handleWebhook } from "../utils/paymentProviderAdapter";
import { finalizePaidOrder } from "../utils/orderCompletion";

function normalizeHeaders(headers: any) {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers || {})) {
    normalized[String(key).toLowerCase()] = Array.isArray(value)
      ? String(value[0] || "")
      : String(value ?? "");
  }
  return normalized;
}

function getCandidateProviderPaymentIds(type: string, resource: any) {
  const ids = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === "string" && value.trim()) ids.add(value.trim());
  };
  add(resource?.id);
  add(resource?.payment_intent);
  add(resource?.supplementary_data?.related_ids?.order_id);
  add(resource?.supplementary_data?.related_ids?.capture_id);
  if (type.startsWith("PAYMENT.CAPTURE.")) {
    add(resource?.supplementary_data?.related_ids?.order_id);
    add(resource?.id);
  }
  return Array.from(ids);
}

async function findPaymentByProviderIds(providerPaymentIds: string[], context: Context) {
  const sudo = context.sudo();
  for (const providerPaymentId of providerPaymentIds) {
    const payments = await sudo.query.Payment.findMany({
      where: { providerPaymentId: { equals: providerPaymentId } },
      query: "id status data order { id status orderSource }",
      take: 1,
    });
    if (payments[0]) return payments[0];
  }
  return null;
}

export default async function handlePaymentProviderWebhook(
  _root: unknown,
  {
    providerCode,
    event,
    headers,
    rawBody,
  }: { providerCode: string; event: any; headers: any; rawBody?: string | null },
  context: Context
) {
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
  if (existing[0]?.status === "processed" || existing[0]?.status === "ignored") {
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
  const payment = candidateIds.length ? await findPaymentByProviderIds(candidateIds, context) : null;
  if (!payment) {
    await (context.sudo().db as any).PaymentWebhookEvent.updateOne({
      where: { id: inbox.id },
      data: { status: "ignored", processedAt: new Date().toISOString(), attempts: 1 },
    });
    return { success: true, error: null };
  }

  try {
    const prisma = context.prisma as any;
    await prisma.$transaction(async (tx: any) => {
      const currentInbox = await tx.paymentWebhookEvent.findUnique({ where: { eventKey } });
      if (["processed", "ignored"].includes(currentInbox?.status || "")) return;
      let status: string | null = null;
      if (["payment_intent.succeeded", "charge.succeeded", "CHECKOUT.ORDER.APPROVED", "PAYMENT.CAPTURE.COMPLETED"].includes(type)) {
        status = "succeeded";
      } else if (["payment_intent.payment_failed", "PAYMENT.CAPTURE.DENIED", "PAYMENT.CAPTURE.DECLINED"].includes(type)) {
        status = "failed";
      } else if (["payment_intent.canceled", "PAYMENT.CAPTURE.REVERSED", "CHECKOUT.ORDER.VOIDED"].includes(type)) {
        status = "cancelled";
      }
      if (status) {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status,
            processedAt: status === "succeeded" ? new Date() : null,
            errorMessage: status === "failed"
              ? resource.last_payment_error?.message || resource.status_details?.reason || "Payment failed"
              : "",
            data: {
              ...(payment.data || {}),
              webhookType: type,
              webhookEventId: providerEventId,
              webhookResourceId: resource.id || null,
              captureId: resource.supplementary_data?.related_ids?.capture_id || resource.latest_charge || null,
            },
          },
        });
        if (
          status === "succeeded" &&
          payment.order?.id &&
          payment.order.orderSource === "online" &&
          payment.order.status === "open"
        ) {
          await tx.restaurantOrder.update({ where: { id: payment.order.id }, data: { status: "sent_to_kitchen" } });
        }
      }
      await tx.paymentWebhookEvent.update({
        where: { id: inbox.id },
        data: {
          paymentId: payment.id,
          status: status ? "processed" : "ignored",
          attempts: Number(currentInbox?.attempts || 0) + 1,
          processedAt: new Date(),
          error: "",
        },
      });
    }, { isolationLevel: "Serializable" });
    if (
      ["payment_intent.succeeded", "charge.succeeded", "CHECKOUT.ORDER.APPROVED", "PAYMENT.CAPTURE.COMPLETED"].includes(type) &&
      payment.order?.id &&
      payment.order.orderSource === "pos"
    ) {
      await finalizePaidOrder(payment.order.id, context);
    }
    return { success: true, error: null };
  } catch (error) {
    await (context.sudo().db as any).PaymentWebhookEvent.updateOne({
      where: { id: inbox.id },
      data: {
        status: "failed",
        attempts: 1,
        error: error instanceof Error ? error.message : "Unknown webhook processing error",
      },
    });
    throw error;
  }
}
