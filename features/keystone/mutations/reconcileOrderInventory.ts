import type { Context } from ".keystone/types";
import { permissions } from "../access";
import { depleteInventoryForCompletedOrder } from "../utils/inventoryLedger";
import { appendAuditEvent } from "../utils/audit";

export default async function reconcileOrderInventory(
  _root: unknown,
  { orderId }: { orderId: string },
  context: Context
) {
  if (!permissions.canManageInventory({ session: context.session })) {
    return { success: false, created: 0, error: "Not authorized to reconcile inventory" };
  }
  try {
    const result = await depleteInventoryForCompletedOrder(orderId, context);
    await appendAuditEvent(context, {
      eventType: "inventory.order_reconciled",
      entityType: "RestaurantOrder",
      entityId: orderId,
      after: result,
    }).catch((error) => console.error("Inventory reconciliation audit event failed:", error));
    return { success: true, created: result.created, error: null };
  } catch (error) {
    return { success: false, created: 0, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
