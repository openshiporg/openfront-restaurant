/** Provider observations never erase captured or refunded money. */
export function nextPaymentStatus(current: string, observed: string): string {
  if (["refunded", "partially_refunded"].includes(current)) return current;
  if (current === "succeeded") return current;
  if (observed === "succeeded") return observed;
  if (["failed", "cancelled"].includes(current)) return current;
  if (current === "authorized" && ["pending", "processing"].includes(observed)) return current;
  return observed;
}
export function webhookPaymentStatus(type: string): string | null {
  if (["payment_intent.succeeded", "charge.succeeded", "PAYMENT.CAPTURE.COMPLETED"].includes(type)) return "succeeded";
  if (type === "CHECKOUT.ORDER.APPROVED") return "authorized";
  if (["payment_intent.payment_failed", "PAYMENT.CAPTURE.DENIED", "PAYMENT.CAPTURE.DECLINED"].includes(type)) return "failed";
  if (["payment_intent.canceled", "CHECKOUT.ORDER.VOIDED"].includes(type)) return "cancelled";
  return null;
}
export function stripeRefundReference(id: string) {
  if (id.startsWith("pi_")) return { payment_intent: id };
  if (id.startsWith("ch_")) return { charge: id };
  throw new Error("Stripe refund requires a payment intent or charge reference");
}
export function successfulRefundTotal(rows: { status: string; amount: number }[]) {
  return rows.filter(row => row.status === "succeeded").reduce((sum, row) => sum + row.amount, 0);
}

/** Equal tenders share one check; remainder cents are allocated deterministically. */
export function equalTenderAmounts(balance: number, guests: number): number[] {
  if (!Number.isSafeInteger(balance) || balance <= 0 || !Number.isSafeInteger(guests) || guests < 2 || guests > 50 || guests > balance) throw new Error("Choose 2–50 guests and a positive payable amount per guest");
  return Array.from({ length: guests }, (_, index) => Math.floor(balance / guests) + (index < balance % guests ? 1 : 0));
}

export function reservedTenderValue(payment: { amount?: unknown; refundedAmount?: unknown; status?: string }): number {
  const amount = Math.max(0, Math.round(Number(payment.amount || 0)));
  return ["succeeded", "partially_refunded", "refunded"].includes(payment.status || "") ? Math.max(0, amount - Math.max(0, Number(payment.refundedAmount || 0))) : amount;
}

export function firstSettlementTime(current: Date | null | undefined, effectiveStatus: string, now = new Date()): Date | undefined {
  return effectiveStatus === "succeeded" ? current || now : undefined;
}

export function refundedTipValue(payment: { amount?: unknown; refundedAmount?: unknown; tipAmount?: unknown }): number {
  const amount = Math.max(0, Number(payment.amount || 0));
  if (!amount) return 0;
  return Number(BigInt(Math.max(0, Number(payment.tipAmount || 0))) * BigInt(Math.min(amount, Math.max(0, Number(payment.refundedAmount || 0)))) / BigInt(amount));
}
export function allocateTenderTip(desiredTip: number, orderTotal: number, tenderAmount: number, remainingAfter: number, reserved: any[]): number {
  const assigned = reserved.reduce((sum, row) => sum + Math.max(0, Number(row.tipAmount || 0) - refundedTipValue(row)), 0);
  const unassigned = Math.max(0, desiredTip - assigned);
  return remainingAfter === 0 ? unassigned : Math.min(unassigned, orderTotal > 0 ? Number(BigInt(desiredTip) * BigInt(tenderAmount) / BigInt(orderTotal)) : 0);
}
