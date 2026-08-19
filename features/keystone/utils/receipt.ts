import type { Context } from ".keystone/types";

function receiptNumber(kind: "sale" | "refund" | "correction", entityId: string) {
  return `${kind === "sale" ? "R" : kind === "refund" ? "RF" : "RC"}-${entityId}`;
}

export type ReceiptInput = {
  kind: "sale" | "refund" | "correction";
  entityId: string;
  orderId: string;
  paymentId?: string | null;
  refundId?: string | null;
  amount: number;
  currencyCode: string;
  snapshot: unknown;
  correctsReceiptId?: string | null;
};

export async function issueReceiptWithClient(
  prisma: any,
  issuedById: string | null | undefined,
  input: ReceiptInput
) {
  const number = receiptNumber(input.kind, input.entityId);
  return prisma.receipt.upsert({
    where: { receiptNumber: number },
    update: {},
    create: {
      receiptNumber: number,
      kind: input.kind,
      amount: input.amount,
      currencyCode: input.currencyCode,
      snapshot: input.snapshot,
      orderId: input.orderId,
      paymentId: input.paymentId || null,
      refundId: input.refundId || null,
      correctsReceiptId: input.correctsReceiptId || null,
      issuedById: issuedById || null,
    },
  });
}

export async function issueReceipt(context: Context, input: ReceiptInput) {
  return issueReceiptWithClient(context.prisma as any, context.session?.itemId, input);
}
