import { finalizeRefundWithClient } from "./refundLedger";

export type VerifiedProviderRefund = { id: string; amount: number; currencyCode: string; status: string; requestKey?: string; data?: unknown };
export function providerRefundObservation(resource: any): VerifiedProviderRefund {
  const currencyCode = String(resource.currency || resource.amount?.currency_code || "").toUpperCase();
  let amount = resource.amount;
  if (typeof amount === "object") {
    const value = String(amount.value || "");
    if (!/^\d+(\.\d+)?$/.test(value)) throw new Error("Provider refund has an invalid decimal amount");
    const digits = new Intl.NumberFormat("en", { style: "currency", currency: currencyCode }).resolvedOptions().maximumFractionDigits ?? 2;
    const [whole, fraction = ""] = value.split(".");
    if (fraction.length > digits && Number(fraction.slice(digits)) !== 0) throw new Error("Provider refund precision exceeds the currency minor unit");
    amount = Number(BigInt(whole) * BigInt(10 ** digits) + BigInt(fraction.slice(0, digits).padEnd(digits, "0") || "0"));
  }
  if (!resource.id || !Number.isSafeInteger(amount) || amount <= 0 || !/^[A-Z]{3}$/.test(currencyCode)) throw new Error("Provider refund identity, amount and currency are required");
  const status = ["succeeded", "COMPLETED", "completed"].includes(resource.status) ? "succeeded" : ["failed", "FAILED", "CANCELLED"].includes(resource.status) ? "failed" : "unknown";
  return { id: resource.id, amount, currencyCode, status, requestKey: resource.metadata?.restaurantRefundKey, data: resource };
}
/** Called only after provider signature verification or an authenticated provider
 * status read. External refunds record observed money; they invent no approval. */
export async function recordVerifiedProviderRefund(tx: any, input: { paymentId: string; providerId: string; providerCode: string; refund: VerifiedProviderRefund; actorId?: string | null }) {
  const payment = await tx.payment.findUnique({ where: { id: input.paymentId }, include: { order: true } });
  if (!payment?.order || payment.paymentProviderId !== input.providerId) throw new Error("Provider refund does not belong to this payment provider");
  if (payment.currencyCode.toUpperCase() !== input.refund.currencyCode) throw new Error("Provider refund currency differs from the original tender");
  const matches = await tx.refund.findMany({ where: { paymentId: payment.id, providerRefundId: input.refund.id } });
  let refund = matches[0];
  if (!refund && input.refund.requestKey) {
    const local = await tx.refund.findUnique({ where: { idempotencyKey: input.refund.requestKey } });
    if (local?.paymentId === payment.id) refund = local;
  }
  if (refund && Number(refund.amount) !== input.refund.amount) throw new Error("Provider refund identity changed amount");
  if (!refund) refund = await tx.refund.create({ data: {
    idempotencyKey: `external-refund:${input.providerCode}:${input.refund.id}`, providerRefundId: input.refund.id,
    amount: input.refund.amount, currencyCode: input.refund.currencyCode, status: "unknown", paymentId: payment.id,
    orderId: payment.order.id, reason: "Refund confirmed by provider; initiated outside Restaurant", requestedById: null, approvedById: null,
    providerData: { origin: "provider_external", resource: input.refund.data },
  } });
  return finalizeRefundWithClient(tx, { refundId: refund.id, payment, finalStatus: input.refund.status, providerRefundId: input.refund.id, providerResult: { origin: refund.approvedById ? "restaurant" : "provider_external", data: input.refund.data }, actorId: input.actorId });
}
