/** Pure promo-code pricing. Amounts are minor units; the rule's percentage is a whole percent. */
export type PromoRule = { type: string; value: number; allocation?: string | null };
export type PromoDiscount = {
  code: string; isDisabled: boolean; stackable: boolean; startsAt: Date | string; endsAt?: Date | string | null;
  usageLimit?: number | null; usageCount: number; discountRule?: PromoRule | null;
};

export type PromoResult = { ok: true; amount: number } | { ok: false; message: string };

export function normalizePromoCode(code: unknown) {
  return String(code ?? "").trim().toUpperCase();
}

export function priceWithPromo(discount: PromoDiscount | null | undefined, input: { subtotal: number; pickupDiscount: number; now?: Date }): PromoResult {
  const now = input.now ?? new Date();
  const invalid = { ok: false as const, message: "That code isn't valid." };
  if (!discount || discount.isDisabled) return invalid;
  if (new Date(discount.startsAt) > now) return invalid;
  if (discount.endsAt && new Date(discount.endsAt) <= now) return { ok: false, message: "That code has expired." };
  if (discount.usageLimit != null && discount.usageCount >= discount.usageLimit) return { ok: false, message: "That code has been fully used." };
  const rule = discount.discountRule;
  if (!rule || !["percentage", "fixed"].includes(rule.type) || (rule.allocation && rule.allocation !== "total")) return invalid;
  if (input.pickupDiscount > 0 && !discount.stackable) return { ok: false, message: "That code can't be combined with the pickup discount." };
  const raw = rule.type === "percentage" ? Math.round(input.subtotal * (Math.min(100, Math.max(0, rule.value)) / 100)) : Math.max(0, rule.value);
  const amount = Math.max(0, Math.min(raw, input.subtotal - input.pickupDiscount));
  if (amount <= 0) return { ok: false, message: "That code doesn't apply to this order." };
  return { ok: true, amount };
}
