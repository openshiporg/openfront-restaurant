/** Remove spendable liability before asking an external provider to refund it. */
export async function reserveGiftRefundValue(tx: any, payment: any, refund: any) {
  if (payment.data?.purpose !== "stored_value_issuance") return;
  const gift = await tx.giftCard.findUnique({ where: { id: payment.data.giftCardId } });
  if (!gift || gift.balance < refund.amount) throw new Error("Gift value has been spent or reserved; refund only the remaining balance");
  const balanceAfter = gift.balance - refund.amount;
  await tx.giftCard.update({ where: { id: gift.id }, data: { balance: balanceAfter } });
  await tx.giftCardTransaction.create({ data: { idempotencyKey: `gift-refund-reserve:${refund.id}`, type: "adjustment", amount: -refund.amount, balanceAfter, giftCardId: gift.id, orderId: payment.orderId } });
  await tx.refund.update({ where: { id: refund.id }, data: { providerData: { giftValueReservation: { giftCardId: gift.id, amount: refund.amount } } } });
}
