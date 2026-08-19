import type { Context } from ".keystone/types";
import { permissions } from "../access";
import { appendAuditEvent } from "../utils/audit";


type TableStatus = "available" | "occupied" | "reserved" | "cleaning";
type CheckAction = "send_to_kitchen" | "mark_served" | "close_check" | "cancel_check";

interface UpdateServiceFloorTableStatusArgs {
  tableId: string;
  status: TableStatus;
}

interface UpdateServiceFloorCheckStatusArgs {
  orderId: string;
  action: CheckAction;
}

interface ServiceFloorMutationResult {
  success: boolean;
  error: string | null;
}

const ACTIVE_ORDER_STATUSES = ["open", "sent_to_kitchen", "in_progress", "ready", "served"];

async function getActiveOrdersForTable(tableId: string, context: Context) {
  return context.sudo().query.RestaurantOrder.findMany({
    where: {
      tables: { some: { id: { equals: tableId } } },
      status: { in: ACTIVE_ORDER_STATUSES },
    },
    query: "id status orderNumber",
    take: 5,
  });
}

export async function updateServiceFloorTableStatus(
  root: any,
  args: UpdateServiceFloorTableStatusArgs,
  context: Context
): Promise<ServiceFloorMutationResult> {
  if (!permissions.canManageTables({ session: context.session })) {
    return { success: false, error: "Not authorized to manage tables" };
  }

  if (!args.tableId) return { success: false, error: "Table is required" };
  if (!["available", "occupied", "reserved", "cleaning"].includes(args.status)) {
    return { success: false, error: "Invalid table status" };
  }

  try {
    const sudo = context.sudo();
    const table = await sudo.query.Table.findOne({
      where: { id: args.tableId },
      query: "id tableNumber status",
    });

    if (!table) return { success: false, error: "Table not found" };

    const activeOrders = await getActiveOrdersForTable(args.tableId, context);
    if (activeOrders.length > 0 && ["available", "cleaning"].includes(args.status)) {
      return {
        success: false,
        error: `Table ${table.tableNumber || ""} has an active check. Close or move the check before marking it ${args.status}.`,
      };
    }

    await sudo.db.Table.updateOne({
      where: { id: args.tableId },
      data: { status: args.status },
    });

    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function updateServiceFloorCheckStatus(
  root: any,
  args: UpdateServiceFloorCheckStatusArgs,
  context: Context
): Promise<ServiceFloorMutationResult> {
  if (!permissions.canManageOrders({ session: context.session })) {
    return { success: false, error: "Not authorized to manage checks" };
  }

  if (!args.orderId) return { success: false, error: "Order is required" };

  try {
    const sudo = context.sudo();
    const order = await sudo.query.RestaurantOrder.findOne({
      where: { id: args.orderId },
      query: "id status total payments { id amount status } tables { id } orderItems { id }",
    });

    if (!order) return { success: false, error: "Check not found" };

    let nextStatus: string | null = null;
    if (args.action === "send_to_kitchen") {
      if (!order.orderItems?.length) return { success: false, error: "Add at least one item before sending to kitchen" };
      nextStatus = "sent_to_kitchen";
    } else if (args.action === "mark_served") {
      nextStatus = "served";
    } else if (args.action === "close_check") {
      const paid = (order.payments || [])
        .filter((payment: any) => payment.status === "succeeded")
        .reduce((sum: number, payment: any) => sum + Number(payment.amount || 0), 0);
      if (paid < Number(order.total || 0)) {
        return { success: false, error: "Check cannot be closed until payment is complete" };
      }
      nextStatus = "completed";
    } else if (args.action === "cancel_check") {
      return { success: false, error: "Use the approved order void workflow with a reason to cancel this check" };
    } else {
      return { success: false, error: "Invalid check action" };
    }

    await sudo.db.RestaurantOrder.updateOne({
      where: { id: args.orderId },
      data: { status: nextStatus },
    });
    await appendAuditEvent(context, {
      eventType: "service_floor.check_status_changed",
      entityType: "RestaurantOrder",
      entityId: args.orderId,
      before: { status: order.status },
      after: { status: nextStatus },
      metadata: { action: args.action },
    }).catch((error) => console.error("Check status audit event failed:", error));

    if (["completed", "cancelled"].includes(nextStatus)) {
      for (const table of order.tables || []) {
        const activeOrders = await getActiveOrdersForTable(table.id, context);
        const otherActiveOrders = activeOrders.filter((activeOrder: any) => activeOrder.id !== order.id);
        if (otherActiveOrders.length === 0) {
          await sudo.db.Table.updateOne({
            where: { id: table.id },
            data: { status: nextStatus === "completed" ? "cleaning" : "available" },
          });
        }
      }
    }

    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
