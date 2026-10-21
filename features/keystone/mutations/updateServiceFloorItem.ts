import type { Context } from ".keystone/types";
import { permissions } from "../access";
import { getStoreDeliverySettings } from "../utils/deliveryValidation";
import { voidOrderItem } from "./voidComp";
import { assertMutableServiceOrder, serviceTransaction } from "../utils/serviceOrderState";
import { recalculateServiceOrder } from "../utils/serviceOrderTotals";
interface UpdateServiceFloorItemArgs {
  orderItemId: string;
  quantity?: number | null;
  courseNumber?: number | null;
  seatNumber?: number | null;
  specialInstructions?: string | null;
  voidReason?: string | null;
  managerApprovalId?: string | null;
}

export default async function updateServiceFloorItem(_root: unknown, args: UpdateServiceFloorItemArgs, context: Context) {
  if (!permissions.canManageOrders({ session: context.session })) throw new Error("Not authorized to manage service-floor checks");
  if (!args.orderItemId) throw new Error("Order item is required");
  if (args.voidReason?.trim()) {
    const result = await voidOrderItem(null, {
      orderItemId: args.orderItemId, reason: args.voidReason.trim(), managerApprovalId: args.managerApprovalId,
      idempotencyKey: `service-floor-void:${args.orderItemId}:${args.voidReason.trim()}:${args.managerApprovalId || "missing"}`,
    }, context);
    if (!result.success) throw new Error(result.error || "Unable to void item");
    const item = await context.sudo().query.OrderItem.findOne({ where: { id: args.orderItemId }, query: "order { id orderNumber status subtotal tax total }" });
    return item.order;
  }
  const settings = await getStoreDeliverySettings(context);
  return serviceTransaction(context.prisma, async tx => {
    const item = await tx.orderItem.findUnique({ where: { id: args.orderItemId }, include: { order: { include: { payments: true } }, course: true } });
    if (!item?.order) throw new Error("Order item not found");
    assertMutableServiceOrder(item.order);
    if (item.isVoided || Number(item.adjustmentTotal || 0) > 0) throw new Error("Corrected lines are immutable; add a new line or use an approved correction");
    if (item.sentToKitchen || (item.course && item.course.status !== "pending")) throw new Error("Recall the course before editing dispatched work");
    const quantity = Number(args.quantity ?? item.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error("Quantity must be a positive integer");
    const courseNumber = Math.max(1, Math.floor(Number(args.courseNumber ?? item.courseNumber ?? 1)));
    let course = await tx.orderCourse.findFirst({ where: { orderId: item.orderId, courseNumber } });
    if (course && course.status !== "pending") throw new Error("Target course has already been dispatched");
    if (!course) course = await tx.orderCourse.create({ data: { orderId: item.orderId, courseNumber, courseType: courseNumber === 1 ? "appetizers" : courseNumber === 3 ? "desserts" : "mains", status: "pending" } });
    await tx.orderItem.update({ where: { id: item.id }, data: { quantity, courseNumber, courseId: course.id,
      seatNumber: args.seatNumber ?? undefined, specialInstructions: args.specialInstructions ?? undefined,
    } });
    return recalculateServiceOrder(tx, item.orderId, settings);
  });
}
