import { appendAuditEventWithClient } from "./audit";
import { issueReceiptWithClient } from "./receipt";
import { successfulRefundTotal, refundedTipValue } from "./paymentState";
import { getActiveCheckAllocation } from "./checkAllocations";
const cents = (value: unknown) => Math.max(0, Math.round(Number(value || 0)));
export async function finalizeRefundWithClient(tx: any, input: { refundId: string; payment: any; providerResult: any; finalStatus: string; providerRefundId?: string | null; actorId?: string | null; managerApprovalId?: string | null }) {
  const { payment, providerResult, finalStatus, providerRefundId, actorId } = input;
  const reservation = { refund: await tx.refund.findUnique({ where: { id: input.refundId } }) };
  if (!reservation.refund) throw new Error("Refund reservation not found");
  const args = { reason: reservation.refund.reason, idempotencyKey: reservation.refund.idempotencyKey, managerApprovalId: input.managerApprovalId };
  const succeeded = finalStatus === "succeeded";
  if (providerRefundId) {
    const matches = await tx.refund.findMany({ where: { paymentId: payment.id, providerRefundId, status: "succeeded" } });
    const recorded = matches.find((row: any) => row.id !== input.refundId);
    if (recorded) {
      if (recorded.amount !== reservation.refund.amount) throw new Error("Provider refund identity has a conflicting amount");
      const reserve = reservation.refund.providerData?.giftValueReservation;
      if (reserve && !reservation.refund.providerData?.giftValueReleased) {
        // A provider event missing request metadata may have created a canonical
        // external row while the local request already held gift value. Undo only
        // the duplicate burn, and transfer the original reserve to that row.
        const canonicalBurn = await tx.giftCardTransaction.findUnique({ where: { idempotencyKey: `issuance-refund:${recorded.idempotencyKey}` } });
        const restore = recorded.providerData?.giftValueReservation ? reserve.amount : Math.max(0, -Number(canonicalBurn?.amount || 0));
        const gift = await tx.giftCard.findUnique({ where: { id: reserve.giftCardId } });
        const balanceAfter = gift.balance + restore;
        const priorDisables: string[] = gift.metadata?.liabilityRefundDisables || [];
        const remainingDisables = priorDisables.filter(id => id !== recorded.id);
        await tx.giftCard.update({ where: { id: gift.id }, data: { balance: balanceAfter, ...(priorDisables.includes(recorded.id) ? { isDisabled: remainingDisables.length > 0 || gift.metadata?.disabledBeforeLiability === true, metadata: { ...gift.metadata, liabilityRefundDisables: remainingDisables } } : {}) } });
        await tx.giftCardTransaction.create({ data: { idempotencyKey: `gift-refund-dedup:${input.refundId}`, type: "adjustment", amount: restore, balanceAfter, giftCardId: gift.id, orderId: payment.order.id } });
        await appendAuditEventWithClient(tx, actorId, { eventKey: `gift-shortfall-resolved:${recorded.id}`, eventType: "gift.refund_reservation_reconciled", entityType: "GiftCard", entityId: gift.id, after: { restoredDuplicateBurn: restore }, metadata: { canonicalRefundId: recorded.id, duplicateRefundId: input.refundId, note: "Original value reservation transferred; any duplicate-burn shortfall is resolved. Disabled cards still require operator review." } });
      }
      await tx.refund.update({ where: { id: input.refundId }, data: { status: "failed", providerData: { ...(reservation.refund.providerData || {}), giftValueReleased: !!reserve, reconciledToRefundId: recorded.id, reason: "Provider refund already recorded" } } });
      return recorded;
    }
  }

      const currentRefund = await tx.refund.findUnique({ where: { id: reservation.refund.id } });
      if (currentRefund?.status === "succeeded") return currentRefund;
      const currentPayment = await tx.payment.findUnique({ where: { id: payment.id } });
      if (!currentPayment) throw new Error("Payment no longer exists");
      const refund = await tx.refund.update({
        where: { id: reservation.refund.id },
        data: {
          status: finalStatus,
          providerRefundId: providerRefundId || "",
          providerData: { ...(currentRefund.providerData || {}), ...(providerResult.data || providerResult), restaurantOrigin: providerResult.origin || "restaurant" },
          processedAt: succeeded ? new Date() : null,
        },
      });
      const valueReserve = currentRefund.providerData?.giftValueReservation;
      if (finalStatus === "failed" && valueReserve && !currentRefund.providerData?.giftValueReleased) {
        const gift = await tx.giftCard.findUnique({ where: { id: valueReserve.giftCardId } });
        const balanceAfter = gift.balance + valueReserve.amount;
        await tx.giftCard.update({ where: { id: gift.id }, data: { balance: balanceAfter } });
        await tx.giftCardTransaction.create({ data: { idempotencyKey: `gift-refund-release:${refund.id}`, type: "adjustment", amount: valueReserve.amount, balanceAfter, giftCardId: gift.id, orderId: currentPayment.orderId } });
        await tx.refund.update({ where: { id: refund.id }, data: { providerData: { ...refund.providerData, giftValueReleased: true } } });
      }
      if (succeeded) {
        if ((payment.data as any)?.purpose === "stored_value_issuance" && (!valueReserve || currentRefund.providerData?.giftValueReleased)) {
          const giftCard = await tx.giftCard.findUnique({ where: { id: (payment.data as any).giftCardId } });
          if (!giftCard) throw new Error("Issued gift-card record is missing");
          const shortfall = Math.max(0, cents(refund.amount) - cents(giftCard.balance));
          // A verified success may arrive after an earlier failure released the
          // reservation. Record actual returned money and any liability loss.
          const balanceAfter = Math.max(0, cents(giftCard.balance) - cents(refund.amount));
          await tx.giftCard.update({ where: { id: giftCard.id }, data: { balance: balanceAfter, ...(shortfall ? { isDisabled: true, metadata: { ...giftCard.metadata, disabledBeforeLiability: giftCard.metadata?.disabledBeforeLiability ?? giftCard.isDisabled, liabilityRefundDisables: [...(giftCard.metadata?.liabilityRefundDisables || []), refund.id] } } : {}) } });
          await tx.giftCardTransaction.create({ data: { idempotencyKey: `issuance-refund:${args.idempotencyKey}`, type: "adjustment", amount: -Math.min(cents(refund.amount), cents(giftCard.balance)), balanceAfter, giftCardId: giftCard.id, orderId: payment.order.id } });
          if (shortfall) await appendAuditEventWithClient(tx, actorId, { eventKey: `gift-refund-shortfall:${refund.id}`, eventType: "gift.liability_shortfall", entityType: "GiftCard", entityId: giftCard.id, after: { amount: shortfall, currencyCode: payment.currencyCode }, metadata: { refundId: refund.id, paymentId: payment.id, reason: "Provider returned money after issued value was spent; operator review required" } });
        }
        if (payment.paymentMethod === "gift_card") {
          const giftCardId = (payment.data as any)?.giftCardId;
          if (!giftCardId) throw new Error("Gift card reference is missing from the original tender");
          const giftCard = await tx.giftCard.findUnique({ where: { id: giftCardId } });
          if (!giftCard) throw new Error("Gift card not found");
          const balanceAfter = cents(giftCard.balance) + cents(refund.amount);
          await tx.giftCard.update({ where: { id: giftCard.id }, data: { balance: balanceAfter } });
          await tx.giftCardTransaction.create({
            data: {
              idempotencyKey: `refund:${args.idempotencyKey}`,
              type: "refund",
              amount: cents(refund.amount),
              balanceAfter,
              giftCardId: giftCard.id,
              orderId: payment.order.id,
            },
          });
        }
        const refundRows = await tx.refund.findMany({ where: { paymentId: payment.id } });
        const nextRefunded = successfulRefundTotal(refundRows);
        if (nextRefunded > cents(currentPayment.amount)) throw new Error("Refund ledger exceeds the original tender");
        const refundedTipAmount = refundedTipValue({ ...currentPayment, refundedAmount: nextRefunded }) - refundedTipValue(currentPayment);
        await tx.refund.update({ where: { id: refund.id }, data: { providerData: { ...(currentRefund.providerData || {}), ...(providerResult.data || providerResult), restaurantOrigin: providerResult.origin || "restaurant", refundedTipAmount } } });
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            refundedAmount: nextRefunded,
            status: nextRefunded >= cents(payment.amount) ? "refunded" : "partially_refunded",
          },
        });
        await appendAuditEventWithClient(tx, actorId, {
          eventKey: `payment-refunded:${refund.id}`,
          eventType: "payment.refunded",
          entityType: "Refund",
          entityId: refund.id,
          reason: args.reason,
          after: { amount: refund.amount, paymentId: payment.id },
          approverId: reservation.refund.approvedById,
          metadata: { idempotencyKey: args.idempotencyKey, managerApprovalId: args.managerApprovalId },
        });
        await issueReceiptWithClient(tx, actorId, {
          kind: "refund",
          entityId: refund.id,
          orderId: payment.order.id,
          paymentId: payment.id,
          refundId: refund.id,
          amount: -cents(refund.amount),
          currencyCode: payment.currencyCode || "USD",
          snapshot: {
            orderNumber: payment.order.orderNumber,
            checkAllocation: await getActiveCheckAllocation(tx, payment.order.id),
            originalPaymentId: payment.id,
            refundAmount: cents(refund.amount),
            refundedTipAmount,
            reason: args.reason,
            providerRefundId: refund.providerRefundId,
            managerApprovalId: args.managerApprovalId,
          },
        });
      }
      return refund;

}
