import { freezeOrderPricingPolicy } from "../utils/orderPricingPolicy";
import crypto from "node:crypto";
import { appendAuditEventWithClient } from "../utils/audit";
import { assertTablesAvailable, serviceTransaction } from "../utils/serviceOrderState";
import { syncKitchenTicketsForOrder } from "../utils/kitchenTicketSync";
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
  idempotencyKey: string;
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

  if (!args.idempotencyKey || args.idempotencyKey.length > 200) throw new Error("A stable request key is required");
  const requestKey = `pos:${context.session?.itemId}:${args.idempotencyKey}`;
  const fingerprint = crypto.createHash("sha256").update(JSON.stringify(args)).digest("hex");
  const existingAttempt = await (context.prisma as any).auditEvent.findUnique({ where: { eventKey: requestKey } });
  if (existingAttempt) {
    if (existingAttempt.metadata?.fingerprint !== fingerprint) throw new Error("Request key was already used for different order contents");
    await syncKitchenTicketsForOrder(existingAttempt.entityId, context);
    return (context.prisma as any).restaurantOrder.findUnique({ where: { id: existingAttempt.entityId } });
  }
  if (!["dine_in", "takeout"].includes(args.orderType)) throw new Error("Invalid POS service type");
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

  // Prisma is intentional: order, immutable lines, courses and table allocation commit together.
  const order = await serviceTransaction(context.prisma, async tx => {
    const prior = await tx.auditEvent.findUnique({ where: { eventKey: requestKey } });
    if (prior) {
      if (prior.metadata?.fingerprint !== fingerprint) throw new Error("Request key was already used for different order contents");
      return tx.restaurantOrder.findUnique({ where: { id: prior.entityId } });
    }
    await assertTablesAvailable(tx, tableIds, Math.max(1, args.guestCount || 1), undefined, true);
    const order = await tx.restaurantOrder.create({ data: {
      orderNumber: `POS-${crypto.createHash("sha256").update(requestKey).digest("hex").slice(0, 24)}`,
      orderType, orderSource: "pos", status: "sent_to_kitchen", guestCount: Math.max(1, args.guestCount || 1),
      subtotal, tax, total, isUrgent: Boolean(args.isUrgent), specialInstructions: args.specialInstructions || "", currencyCode,
      tables: { connect: tableIds.map(id => ({ id })) }, serverId: context.session?.itemId, createdById: context.session?.itemId,
    } });
    await freezeOrderPricingPolicy(tx, order.id, storeSettings, context.session?.itemId);
    const courseMap = new Map<number, string>();
    const now = new Date();
    for (const item of validatedItems) {
      if (!courseMap.has(item.courseNumber)) {
        const course = await tx.orderCourse.create({ data: {
          orderId: order.id, courseNumber: item.courseNumber, courseType: getCourseType(item.courseNumber), status: "fired", fireTime: now,
        } });
        courseMap.set(item.courseNumber, course.id);
      }
      await tx.orderItem.create({ data: {
        orderId: order.id, originalOrderIdSnapshot: order.id, courseId: courseMap.get(item.courseNumber), menuItemId: item.menuItem.id,
        appliedModifiers: { connect: item.modifiers.map(modifier => ({ id: modifier.id })) },
        quantity: item.quantity, price: item.unitPrice, itemNameSnapshot: item.menuItem.name,
        itemThumbnailSnapshot: item.menuItem.thumbnail || "", kitchenStationSnapshot: item.menuItem.kitchenStation || "expo",
        menuItemIdSnapshot: item.menuItem.id, modifiersSnapshot: item.modifiers,
        specialInstructions: item.specialInstructions, courseNumber: item.courseNumber, sentToKitchen: now, firedAt: now,
      } });
    }
    await tx.table.updateMany({ where: { id: { in: tableIds } }, data: { status: "occupied" } });
    await appendAuditEventWithClient(tx, context.session?.itemId, {
      eventKey: requestKey, eventType: "pos.order_created", entityType: "RestaurantOrder", entityId: order.id, metadata: { fingerprint },
    });
    return order;
  });
  // Also on replay: a dispatch failure after commit must be recoverable without another sale.
  await syncKitchenTicketsForOrder(order.id, context);
  return order;
}
