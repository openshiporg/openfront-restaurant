import type { Context } from ".keystone/types";
import { permissions } from "../access";
import { calculateRestaurantTotals } from "../../lib/restaurant-order-pricing";
import { validateCartItemInput } from "../utils/cartItemValidation";

interface POSOrderItemInput {
  menuItemId: string;
  quantity: number;
  courseNumber?: number;
  modifierIds?: string[] | null;
  specialInstructions?: string | null;
}

interface CreatePOSOrderArgs {
  orderType: "dine_in" | "takeout";
  guestCount?: number;
  tableIds?: string[];
  isUrgent?: boolean;
  specialInstructions?: string | null;
  items: POSOrderItemInput[];
}

function generateOrderNumber(): string {
  const now = new Date();
  return `${now.toISOString().slice(2, 10).replace(/-/g, "")}-${now.getTime().toString().slice(-4)}`;
}

function getCourseType(courseNumber: number) {
  if (courseNumber === 1) return "appetizers";
  if (courseNumber === 2) return "mains";
  if (courseNumber === 3) return "desserts";
  return "mains";
}

export default async function createPOSOrder(
  _root: unknown,
  args: CreatePOSOrderArgs,
  context: Context
) {
  if (!permissions.canManageOrders({ session: context.session })) {
    throw new Error("Not authorized to create POS orders");
  }

  const orderType = args.orderType || "dine_in";
  const items = (args.items || []).filter((item) => item?.menuItemId && Number(item.quantity) > 0);
  const tableIds = Array.from(new Set(args.tableIds || []));
  if (!items.length) throw new Error("Order must include at least one item");
  if (orderType === "dine_in" && !tableIds.length) {
    throw new Error("Dine-in orders require at least one table");
  }

  const sudo = context.sudo();
  const [storeSettings, validatedItems, tables] = await Promise.all([
    sudo.query.StoreSettings.findOne({ where: { id: "1" }, query: "currencyCode taxRate" }),
    Promise.all(
      items.map(async (item) => ({
        ...(await validateCartItemInput(context, {
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          modifierIds: item.modifierIds || [],
          specialInstructions: item.specialInstructions,
        })),
        courseNumber: Math.max(1, Math.floor(Number(item.courseNumber || 1))),
      }))
    ),
    tableIds.length
      ? sudo.query.Table.findMany({ where: { id: { in: tableIds } }, query: "id status" })
      : Promise.resolve([]),
  ]);

  if (tables.length !== tableIds.length) throw new Error("One or more tables were not found");
  const subtotal = validatedItems.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0
  );
  const currencyCode = storeSettings?.currencyCode || "USD";
  const { tax, total } = calculateRestaurantTotals({
    subtotal,
    orderType,
    taxRate: storeSettings?.taxRate,
    currencyCode,
  });

  const order = await sudo.db.RestaurantOrder.createOne({
    data: {
      orderNumber: generateOrderNumber(),
      orderType,
      orderSource: "pos",
      status: "sent_to_kitchen",
      guestCount: Math.max(1, args.guestCount || 1),
      subtotal,
      tax,
      total,
      isUrgent: Boolean(args.isUrgent),
      specialInstructions: args.specialInstructions || "",
      currencyCode,
      tables: tableIds.length ? { connect: tableIds.map((id) => ({ id })) } : undefined,
      server: context.session?.itemId ? { connect: { id: context.session.itemId } } : undefined,
      createdBy: context.session?.itemId ? { connect: { id: context.session.itemId } } : undefined,
    },
  });

  const courseMap = new Map<number, string>();
  for (const item of validatedItems) {
    if (!courseMap.has(item.courseNumber)) {
      const course = await sudo.db.OrderCourse.createOne({
        data: {
          order: { connect: { id: order.id } },
          courseNumber: item.courseNumber,
          courseType: getCourseType(item.courseNumber),
          status: "pending",
        },
      });
      courseMap.set(item.courseNumber, course.id);
    }

    await sudo.db.OrderItem.createOne({
      data: {
        order: { connect: { id: order.id } },
        course: { connect: { id: courseMap.get(item.courseNumber)! } },
        menuItem: { connect: { id: item.menuItem.id } },
        appliedModifiers: item.modifiers.length
          ? { connect: item.modifiers.map((modifier) => ({ id: modifier.id })) }
          : undefined,
        quantity: item.quantity,
        price: item.unitPrice,
        itemNameSnapshot: item.menuItem.name,
        itemThumbnailSnapshot: item.menuItem.thumbnail || "",
        kitchenStationSnapshot: item.menuItem.kitchenStation || "expo",
        menuItemIdSnapshot: item.menuItem.id,
        modifiersSnapshot: item.modifiers,
        specialInstructions: item.specialInstructions,
        courseNumber: item.courseNumber,
      },
    });
  }

  return sudo.query.RestaurantOrder.findOne({
    where: { id: order.id },
    query: "id orderNumber status subtotal tax total",
  });
}
