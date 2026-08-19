import type { Context } from ".keystone/types";
import { calculateRestaurantTotals } from "../../lib/restaurant-order-pricing";
import { permissions } from "../access";
import { getStoreDeliverySettings } from "../utils/deliveryValidation";
import { voidOrderItem } from "./voidComp";
import { getOrderItemsSubtotal } from "../utils/orderItemFinancials";


interface UpdateServiceFloorItemArgs {
  orderItemId: string;
  quantity?: number | null;
  courseNumber?: number | null;
  seatNumber?: number | null;
  specialInstructions?: string | null;
  voidReason?: string | null;
  managerApprovalId?: string | null;
}

function getCourseType(courseNumber: number) {
  if (courseNumber === 1) return "appetizers";
  if (courseNumber === 2) return "mains";
  if (courseNumber === 3) return "desserts";
  return "mains";
}

async function recalculateOrderTotals(orderId: string, context: Context, voidReason?: string | null) {
  const sudo = context.sudo();
  const [settings, order] = await Promise.all([
    getStoreDeliverySettings(context),
    sudo.query.RestaurantOrder.findOne({
      where: { id: orderId },
      query: `
        id
        orderType
        currencyCode
        tip
        discount
        specialInstructions
        orderItems { id quantity price adjustmentTotal isVoided }
      `,
    }),
  ]);

  if (!order) throw new Error("Order not found while recalculating totals");

  const subtotal = getOrderItemsSubtotal(order.orderItems || []);

  const { tax } = calculateRestaurantTotals({
    subtotal,
    orderType: order.orderType || "dine_in",
    taxRate: settings?.taxRate,
    currencyCode: settings?.currencyCode || order.currencyCode || "USD",
  });

  const tip = Math.max(0, Number(order.tip || 0));
  const discount = Math.max(0, Number(order.discount || 0));
  const total = Math.max(0, subtotal + tax + tip - discount);

  const notePatch = voidReason
    ? order.specialInstructions
      ? `${order.specialInstructions} | VOID ITEM: ${voidReason}`
      : `VOID ITEM: ${voidReason}`
    : order.specialInstructions;

  await sudo.db.RestaurantOrder.updateOne({
    where: { id: orderId },
    data: {
      subtotal,
      tax,
      total,
      currencyCode: settings?.currencyCode || order.currencyCode || "USD",
      specialInstructions: notePatch || "",
    },
  });

  return { subtotal, tax, total };
}

async function getOrCreateCourse(orderId: string, courseNumber: number, context: Context) {
  const sudo = context.sudo();
  const courses = await sudo.query.OrderCourse.findMany({
    where: {
      order: { id: { equals: orderId } },
      courseNumber: { equals: courseNumber },
    },
    query: "id courseNumber",
    take: 1,
  });

  if (courses[0]) return courses[0];

  return sudo.db.OrderCourse.createOne({
    data: {
      order: { connect: { id: orderId } },
      courseNumber,
      courseType: getCourseType(courseNumber),
      status: "pending",
    },
  });
}

export default async function updateServiceFloorItem(
  root: any,
  args: UpdateServiceFloorItemArgs,
  context: Context
) {
  if (!permissions.canManageOrders({ session: context.session })) {
    throw new Error("Not authorized to manage service-floor checks");
  }

  if (!args.orderItemId) throw new Error("Order item is required");

  const sudo = context.sudo();
  const item = await sudo.query.OrderItem.findOne({
    where: { id: args.orderItemId },
    query: "id quantity courseNumber order { id status }",
  });

  if (!item?.order?.id) throw new Error("Order item not found");

  const orderId = item.order.id;
  const voidReason = args.voidReason?.trim() || null;

  if (voidReason) {
    const result = await voidOrderItem(null, {
      orderItemId: args.orderItemId,
      reason: voidReason,
      managerApprovalId: args.managerApprovalId,
      idempotencyKey: `service-floor-void:${args.orderItemId}:${voidReason}:${args.managerApprovalId || "missing-approval"}`,
    }, context);
    if (!result.success) throw new Error(result.error || "Unable to void item");
  } else {
    const quantity = Math.max(1, Math.floor(Number(args.quantity ?? item.quantity ?? 1)));
    const courseNumber = Math.max(1, Math.floor(Number(args.courseNumber ?? item.courseNumber ?? 1)));
    const course = await getOrCreateCourse(orderId, courseNumber, context);

    await sudo.db.OrderItem.updateOne({
      where: { id: args.orderItemId },
      data: {
        quantity,
        courseNumber,
        course: { connect: { id: course.id } },
        seatNumber: args.seatNumber ?? undefined,
        specialInstructions: args.specialInstructions ?? undefined,
      },
    });
  }

  if (!voidReason) await recalculateOrderTotals(orderId, context);

  const refreshed = await sudo.query.RestaurantOrder.findOne({
    where: { id: orderId },
    query: "id orderNumber status subtotal tax total",
  });

  return refreshed;
}
