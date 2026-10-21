import { appendAuditEventWithClient } from "./audit";
import { issueReceiptWithClient } from "./receipt";
import { getActiveCheckAllocation } from "./checkAllocations";
const cents = (value: unknown) => Math.max(0, Math.round(Number(value || 0)));

export async function writeSaleEvidence(
  prisma: any,
  actorId: string | null | undefined,
  input: { payment: any; order: any; remainingBalance: number }
) {
  const checkAllocation = await getActiveCheckAllocation(prisma, input.order.id);
  await appendAuditEventWithClient(prisma, actorId, {
    eventKey: `payment-succeeded:${input.payment.id}`,
    eventType: "payment.succeeded",
    entityType: "Payment",
    entityId: input.payment.id,
    after: {
      amount: input.payment.amount,
      method: input.payment.paymentMethod,
      remainingBalance: input.remainingBalance,
    },
    metadata: { idempotencyKey: input.payment.idempotencyKey },
  });
  await issueReceiptWithClient(prisma, actorId, {
    kind: "sale",
    entityId: input.payment.id,
    orderId: input.order.id,
    paymentId: input.payment.id,
    amount: cents(input.payment.amount),
    currencyCode: input.order.currencyCode || "USD",
    snapshot: {
      orderId: input.order.id,
      orderNumber: input.order.orderNumber,
      checkAllocation,
      tender: input.payment.paymentMethod,
      amount: cents(input.payment.amount),
      remainingBalance: input.remainingBalance,
    },
  });
}
