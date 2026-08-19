import type { Context } from ".keystone/types";
import { calculateRestaurantTotals } from "../../lib/restaurant-order-pricing";
import { permissions } from "../access";
import { getStoreDeliverySettings } from "../utils/deliveryValidation";
import { validateCartItemInput } from "../utils/cartItemValidation";


interface AddServiceFloorItemArgs {
  orderId?: string | null;
  tableId: string;
  menuItemId: string;
  quantity: number;
  courseNumber?: number | null;
  seatNumber?: number | null;
  specialInstructions?: string | null;
  modifierIds?: string[] | null;
}

function generateDineInOrderNumber() {
  return `DIN-${Date.now().toString(36).toUpperCase()}`;
}

function getCourseType(courseNumber: number) {
  if (courseNumber === 1) return "appetizers";
  if (courseNumber === 2) return "mains";
  if (courseNumber === 3) return "desserts";
  return "mains";
}

async function recalculateOrderTotals(orderId: string, context: Context) {
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
        orderItems { id quantity price }
      `,
    }),
  ]);

  if (!order) throw new Error("Order not found while recalculating totals");

  const subtotal = (order.orderItems || []).reduce(
    (sum: number, item: any) => sum + Number(item.price || 0) * Number(item.quantity || 0),
    0
  );

  const { tax } = calculateRestaurantTotals({
    subtotal,
    orderType: order.orderType || "dine_in",
    taxRate: settings?.taxRate,
    currencyCode: settings?.currencyCode || order.currencyCode || "USD",
  });

  const tip = Math.max(0, Number(order.tip || 0));
  const discount = Math.max(0, Number(order.discount || 0));
  const total = Math.max(0, subtotal + tax + tip - discount);

  await sudo.db.RestaurantOrder.updateOne({
    where: { id: orderId },
    data: {
      subtotal,
      tax,
      total,
      currencyCode: settings?.currencyCode || order.currencyCode || "USD",
    },
  });

  return { subtotal, tax, total };
}

export default async function addServiceFloorItem(
  root: any,
  args: AddServiceFloorItemArgs,
  context: Context
) {
  if (!permissions.canManageOrders({ session: context.session })) {
    throw new Error("Not authorized to manage service-floor checks");
  }

  const quantity = Math.max(1, Math.floor(Number(args.quantity || 1)));
  const courseNumber = Math.max(1, Math.floor(Number(args.courseNumber || 1)));
  const sudo = context.sudo();

  if (!args.tableId) throw new Error("Table is required");
  if (!args.menuItemId) throw new Error("Menu item is required");

  const [settings, table, validatedItem] = await Promise.all([
    getStoreDeliverySettings(context),
    sudo.query.Table.findOne({
      where: { id: args.tableId },
      query: "id tableNumber status",
    }),
    validateCartItemInput(context, {
      menuItemId: args.menuItemId,
      quantity,
      modifierIds: args.modifierIds || [],
      specialInstructions: args.specialInstructions,
    }),
  ]);

  if (!table) throw new Error("Table not found");

  let orderId = args.orderId || null;
  let order: any = null;

  if (orderId) {
    order = await sudo.query.RestaurantOrder.findOne({
      where: { id: orderId },
      query: "id status orderType tables { id } courses { id courseNumber }",
    });
    if (!order) throw new Error("Active check not found");
  } else {
    const currencyCode = settings?.currencyCode || "USD";
    order = await sudo.db.RestaurantOrder.createOne({
      data: {
        orderNumber: generateDineInOrderNumber(),
        orderType: "dine_in",
        orderSource: "pos",
        status: "open",
        guestCount: 1,
        subtotal: 0,
        tax: 0,
        total: 0,
        currencyCode,
        tables: { connect: [{ id: args.tableId }] },
        server: context.session?.itemId ? { connect: { id: context.session.itemId } } : undefined,
        createdBy: context.session?.itemId ? { connect: { id: context.session.itemId } } : undefined,
      },
    });
    orderId = order.id;

    await sudo.db.Table.updateOne({
      where: { id: args.tableId },
      data: { status: "occupied" },
    });
  }

  const existingCourse = (order.courses || []).find((course: any) => Number(course.courseNumber) === courseNumber);
  const course = existingCourse || await sudo.db.OrderCourse.createOne({
    data: {
      order: { connect: { id: orderId } },
      courseNumber,
      courseType: getCourseType(courseNumber),
      status: "pending",
    },
  });

  if (!orderId) throw new Error("Unable to create or find active order for this table");

  await sudo.db.OrderItem.createOne({
    data: {
      order: { connect: { id: orderId } },
      course: { connect: { id: course.id } },
      menuItem: { connect: { id: validatedItem.menuItem.id } },
      appliedModifiers: validatedItem.modifiers.length
        ? { connect: validatedItem.modifiers.map((modifier) => ({ id: modifier.id })) }
        : undefined,
      quantity: validatedItem.quantity,
      price: validatedItem.unitPrice,
      itemNameSnapshot: validatedItem.menuItem.name,
      itemThumbnailSnapshot: validatedItem.menuItem.thumbnail || "",
      kitchenStationSnapshot: validatedItem.menuItem.kitchenStation || "expo",
      menuItemIdSnapshot: validatedItem.menuItem.id,
      modifiersSnapshot: validatedItem.modifiers,
      courseNumber,
      seatNumber: args.seatNumber ?? undefined,
      specialInstructions: validatedItem.specialInstructions,
    },
  });

  await recalculateOrderTotals(orderId, context);

  const refreshed = await sudo.query.RestaurantOrder.findOne({
    where: { id: orderId },
    query: "id orderNumber status subtotal tax total",
  });

  return refreshed;
}
