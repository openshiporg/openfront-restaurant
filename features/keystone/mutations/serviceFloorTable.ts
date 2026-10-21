import type { Context } from ".keystone/types";
import { permissions } from "../access";
import transitionRestaurantOrder from "./transitionRestaurantOrder";
import { serviceTransaction } from "../utils/serviceOrderState";
import { syncKitchenTicketsForOrder } from "../utils/kitchenTicketSync";


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
    await serviceTransaction(context.prisma, async tx => {
      const table = await tx.table.findUnique({ where: { id: args.tableId } });
      if (!table) throw new Error("Table not found");
      const [checks, reservations, waitlist] = await Promise.all([
        tx.restaurantOrder.count({ where: { tables: { some: { id: args.tableId } }, status: { in: ACTIVE_ORDER_STATUSES } } }),
        tx.reservation.count({ where: { assignedTableId: args.tableId, status: "seated" } }),
        tx.waitlistEntry.count({ where: { tableId: args.tableId, status: "seated" } }),
      ]);
      if ((checks || reservations || waitlist) && args.status !== "occupied") throw new Error("Finish active checks and seated parties before releasing this table");
      await tx.table.update({ where: { id: args.tableId }, data: { status: args.status } });
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

    if (args.action === "cancel_check") throw new Error("Use the approved order void workflow with a reason");
    if (args.action === "send_to_kitchen") {
      await serviceTransaction(context.prisma, async tx => {
        const current = await tx.restaurantOrder.findUnique({ where: { id: args.orderId }, include: { orderItems: true } });
        if (!current || !["open", "sent_to_kitchen", "in_progress", "ready"].includes(current.status)) throw new Error("This check can no longer send work");
        if (!current.orderItems.some((item: any) => !item.isVoided)) throw new Error("Add an active item before sending to kitchen");
        const now = new Date();
        const courses = await tx.orderCourse.findMany({ where: { orderId: current.id, status: "pending", onHold: false } });
        await tx.orderCourse.updateMany({ where: { id: { in: courses.map((course: any) => course.id) } }, data: { status: "fired", fireTime: now } });
        await tx.orderItem.updateMany({ where: { orderId: current.id, courseId: { in: courses.map((course: any) => course.id) }, isVoided: false }, data: { sentToKitchen: now, firedAt: now, kitchenStatus: "new" } });
        await tx.restaurantOrder.update({ where: { id: current.id }, data: { status: "sent_to_kitchen" } });
      });
      await syncKitchenTicketsForOrder(args.orderId, context);
    } else if (args.action === "mark_served" || args.action === "close_check") {
      await transitionRestaurantOrder(null, { orderId: args.orderId, status: args.action === "mark_served" ? "served" : "completed" }, context);
    } else throw new Error("Invalid check action");

    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
