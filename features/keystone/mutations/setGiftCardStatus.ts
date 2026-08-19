import type { Context } from ".keystone/types";
import { permissions } from "../access";
import { appendAuditEvent } from "../utils/audit";

export default async function setGiftCardStatus(
  _root: unknown,
  { giftCardId, isDisabled, reason }: { giftCardId: string; isDisabled: boolean; reason?: string | null },
  context: Context
) {
  if (!permissions.canManageGiftCards({ session: context.session })) throw new Error("Not authorized to manage gift cards");
  const card = await context.sudo().query.GiftCard.findOne({ where: { id: giftCardId }, query: "id isDisabled" });
  if (!card) throw new Error("Gift card not found");
  const updated = await context.sudo().query.GiftCard.updateOne({
    where: { id: giftCardId },
    data: { isDisabled },
    query: "id isDisabled",
  });
  await appendAuditEvent(context, {
    eventType: "gift_card.status_changed",
    entityType: "GiftCard",
    entityId: giftCardId,
    reason: reason || "",
    before: { isDisabled: card.isDisabled },
    after: { isDisabled },
  }).catch((error) => console.error("Gift card status audit event failed:", error));
  return updated;
}
