import type { Context } from ".keystone/types";
import { permissions } from "../access";
import { appendKitchenTicketEventWithClient } from "../utils/kitchenTicketEvents";
import { syncKitchenTicketsForOrder } from "../utils/kitchenTicketSync";
import { serviceTransaction } from "../utils/serviceOrderState";
async function changeCourse(courseId: string, fire: boolean, context: Context) {
  if (!permissions.canManageKitchen({ session: context.session }) && !permissions.canManageOrders({ session: context.session })) return { success: false, error: "Not authorized" };
  try {
    const orderId = await serviceTransaction(context.prisma, async tx => {
      const course = await tx.orderCourse.findUnique({ where: { id: courseId }, include: { order: true, orderItems: true } });
      if (!course?.order || ["completed", "cancelled", "dispatched", "served"].includes(course.order.status)) throw new Error("Course is not on an active check");
      if (fire && course.status === "fired" && !course.onHold) return course.orderId;
      if (!fire && course.status === "pending") return course.orderId;
      if (!fire && course.orderItems.some((item: any) => item.fulfilledAt || ["fulfilled", "ready"].includes(item.kitchenStatus))) throw new Error("Prepared work cannot be recalled as unprepared; use an approved correction");
      const now = new Date();
      await tx.orderCourse.update({ where: { id: courseId }, data: { status: fire ? "fired" : "pending", onHold: false, fireTime: fire ? now : null } });
      await tx.orderItem.updateMany({ where: { courseId, isVoided: false }, data: {
        sentToKitchen: fire ? now : null, firedAt: fire ? now : null, kitchenStatus: fire ? "new" : "recalled", recalledAt: fire ? undefined : now,
      } });
      if (fire) await tx.restaurantOrder.update({ where: { id: course.orderId }, data: { status: "sent_to_kitchen", onHold: false } });
      await appendKitchenTicketEventWithClient(tx, context.session?.itemId, { eventType: fire ? "dispatch" : "recall", orderId: course.orderId, payload: { courseId, action: fire ? "fire" : "recall" } });
      return course.orderId;
    });
    await syncKitchenTicketsForOrder(orderId, context);
    return { success: true, error: null };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Unknown error" }; }
}
export async function fireCourse(_root: unknown, args: { courseId: string }, context: Context) { return changeCourse(args.courseId, true, context); }
export async function recallCourse(_root: unknown, args: { courseId: string }, context: Context) { return changeCourse(args.courseId, false, context); }
