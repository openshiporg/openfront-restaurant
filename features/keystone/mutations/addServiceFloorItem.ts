import crypto from "node:crypto";
import type { Context } from ".keystone/types";
import { permissions } from "../access";
import { getStoreDeliverySettings } from "../utils/deliveryValidation";
import { validateCartItemInput } from "../utils/cartItemValidation";
import { assertMutableServiceOrder, assertTablesAvailable, serviceTransaction } from "../utils/serviceOrderState";
import { recalculateServiceOrder } from "../utils/serviceOrderTotals";
import { appendAuditEventWithClient } from "../utils/audit";
interface AddServiceFloorItemArgs {
  idempotencyKey: string;
  orderId?: string | null;
  tableId: string;
  menuItemId: string;
  quantity: number;
  courseNumber?: number | null;
  seatNumber?: number | null;
  specialInstructions?: string | null;
  modifierIds?: string[] | null;
}

export default async function addServiceFloorItem(_root: unknown, args: AddServiceFloorItemArgs, context: Context) {
  if (!permissions.canManageOrders({ session: context.session })) throw new Error("Not authorized to manage service-floor checks");
  if (!args.tableId || !args.menuItemId) throw new Error("Table and menu item are required");
  if (!args.idempotencyKey || args.idempotencyKey.length > 200) throw new Error("A stable request key is required");
  const key = `service-add:${context.session?.itemId}:${args.idempotencyKey}`;
  const fingerprint = crypto.createHash("sha256").update(JSON.stringify(args)).digest("hex");
  const existingAttempt = await (context.prisma as any).auditEvent.findUnique({ where: { eventKey: key } });
  if (existingAttempt) {
    if (existingAttempt.metadata?.fingerprint !== fingerprint) throw new Error("Request key was already used for different item contents");
    return (context.prisma as any).restaurantOrder.findUnique({ where: { id: existingAttempt.entityId } });
  }
  const settings = await getStoreDeliverySettings(context);
  const item = await validateCartItemInput(context, args);
  const courseNumber = Math.max(1, Math.floor(Number(args.courseNumber || 1)));
  return serviceTransaction(context.prisma, async tx => {
    const prior = await tx.auditEvent.findUnique({ where: { eventKey: key } });
    if (prior) {
      if (prior.metadata?.fingerprint !== fingerprint) throw new Error("Request key was already used for different item contents");
      return tx.restaurantOrder.findUnique({ where: { id: prior.entityId } });
    }
    let order = args.orderId ? await tx.restaurantOrder.findUnique({ where: { id: args.orderId }, include: { payments: true, tables: true } }) : null;
    if (args.orderId) {
      assertMutableServiceOrder(order);
      if (!order.tables.some((table: any) => table.id === args.tableId)) throw new Error("This check does not belong to the selected table");
    } else {
      await assertTablesAvailable(tx, [args.tableId], 1, undefined, true);
      order = await tx.restaurantOrder.create({ data: {
        orderNumber: `DIN-${crypto.createHash("sha256").update(key).digest("hex").slice(0, 24)}`,
        orderType: "dine_in", orderSource: "pos", status: "open", guestCount: 1, subtotal: 0, tax: 0, total: 0,
        currencyCode: settings?.currencyCode || "USD", tables: { connect: [{ id: args.tableId }] },
        serverId: context.session?.itemId, createdById: context.session?.itemId,
      } });
      await tx.table.update({ where: { id: args.tableId }, data: { status: "occupied" } });
    }
    let course = await tx.orderCourse.findFirst({ where: { orderId: order.id, courseNumber } });
    if (course && course.status !== "pending") throw new Error("Add new work to a pending course; dispatched courses cannot be silently changed");
    if (!course) course = await tx.orderCourse.create({ data: { orderId: order.id, courseNumber, courseType: courseNumber === 1 ? "appetizers" : courseNumber === 3 ? "desserts" : "mains", status: "pending" } });
    await tx.orderItem.create({ data: {
      orderId: order.id, originalOrderIdSnapshot: order.id, courseId: course.id, menuItemId: item.menuItem.id,
      appliedModifiers: { connect: item.modifiers.map(modifier => ({ id: modifier.id })) },
      quantity: item.quantity, price: item.unitPrice, itemNameSnapshot: item.menuItem.name,
      itemThumbnailSnapshot: item.menuItem.thumbnail || "", kitchenStationSnapshot: item.menuItem.kitchenStation || "expo",
      menuItemIdSnapshot: item.menuItem.id, modifiersSnapshot: item.modifiers, courseNumber,
      seatNumber: args.seatNumber ?? null, specialInstructions: item.specialInstructions,
    } });
    const updated = await recalculateServiceOrder(tx, order.id, settings);
    await appendAuditEventWithClient(tx, context.session?.itemId, { eventKey: key, eventType: "service.item_added", entityType: "RestaurantOrder", entityId: order.id, metadata: { fingerprint } });
    return updated;
  });
}
