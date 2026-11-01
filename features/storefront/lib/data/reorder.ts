"use server";

import { retrieveOrder } from "./orders";
import { addToCart } from "./cart";

export type ReorderResult =
  | { success: true; added: number; skipped: number }
  | { success: false; message: string };

/** Put a past order's items back in the cart, one line at a time, through the normal add-to-cart path. */
export async function reorderPastOrder(orderId: string): Promise<ReorderResult> {
  const order = await retrieveOrder(orderId, null);
  if (!order) return { success: false, message: "We couldn't find that order." };

  const orderType = order.orderType === "delivery" ? "delivery" : "pickup";
  let added = 0;
  let skipped = 0;
  for (const item of order.orderItems || []) {
    const menuItemId = item.menuItem?.id || item.menuItemIdSnapshot;
    if (!menuItemId) { skipped += 1; continue; }
    const result = await addToCart({
      menuItemId,
      quantity: Math.max(1, Number(item.quantity) || 1),
      modifierIds: ((item.modifiers?.length ? item.modifiers : item.modifiersSnapshot) || []).map((m: { id: string }) => m.id),
      specialInstructions: item.specialInstructions || undefined,
      orderType,
    });
    if (result.success) added += 1;
    else if (added === 0 && skipped === 0 && /not taking orders/.test(result.message)) return { success: false, message: result.message };
    else skipped += 1;
  }
  if (added === 0) return { success: false, message: "None of those items are available right now." };
  return { success: true, added, skipped };
}
