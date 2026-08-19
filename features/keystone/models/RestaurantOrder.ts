import { list, graphql } from "@keystone-6/core";
import { allOperations } from "@keystone-6/core/access";
import {
  text,
  relationship,
  select,
  integer,
  decimal,
  timestamp,
  virtual,
  checkbox
} from "@keystone-6/core/fields";
import crypto from "crypto";

import { isSignedIn, permissions } from "../access";
import { trackingFields } from "./trackingFields";
import { isKitchenActiveOrderStatus, syncKitchenTicketsForOrder } from "../utils/kitchenTicketSync";
import { depleteInventoryForCompletedOrder } from "../utils/inventoryLedger";

export const RestaurantOrder = list({
  access: {
    operation: {
      query: ({ session }) =>
        permissions.canReadOrders({ session }) ||
        permissions.canManageOrders({ session }),
      create: () => false,
      update: () => false,
      delete: () => false,
    },
  },
  ui: {
    listView: {
      initialColumns: ["orderNumber", "orderType", "status", "tables", "server", "total"],
    },
  },
  hooks: {
    afterOperation: async ({ operation, item, originalItem, context }) => {
      const sudo = context.sudo();
      
      // Table management: mark tables as occupied on dine-in order creation
      if (operation === 'create' && item && (item as any).orderType === 'dine_in') {
        const orderWithTables = await sudo.query.RestaurantOrder.findOne({
          where: { id: (item as any).id },
          query: 'tables { id }'
        });
        if (orderWithTables?.tables?.length) {
          await Promise.all(orderWithTables.tables.map((table: any) =>
            sudo.db.Table.updateOne({ where: { id: table.id }, data: { status: 'occupied' } })
          ));
        }
      }
      
      // Table management: mark tables as cleaning on order complete/cancel
      if (operation === 'update' && item && (item as any).orderType === 'dine_in') {
        if ((item as any).status === 'completed' || (item as any).status === 'cancelled') {
          const orderWithTables = await sudo.query.RestaurantOrder.findOne({
            where: { id: (item as any).id },
            query: 'tables { id }'
          });
          if (orderWithTables?.tables?.length) {
            await Promise.all(orderWithTables.tables.map((table: any) =>
              sudo.db.Table.updateOne({ where: { id: table.id }, data: { status: 'cleaning' } })
            ));
          }
        }
      }

      const previousStatus = (originalItem as any)?.status;
      const currentStatus = (item as any)?.status;
      const orderId = String((item as any)?.id || '');
      const enteredKitchenFlow =
        operation === 'create'
          ? isKitchenActiveOrderStatus((item as any)?.status)
          : isKitchenActiveOrderStatus(currentStatus) && !isKitchenActiveOrderStatus(previousStatus);
      const leftKitchenFlow =
        operation === 'update' &&
        isKitchenActiveOrderStatus(previousStatus) &&
        ['completed', 'cancelled'].includes(currentStatus || '');

      if (orderId && (enteredKitchenFlow || leftKitchenFlow)) {
        try {
          await syncKitchenTicketsForOrder(orderId, context as any);
        } catch (err) {
          console.error('Kitchen ticket sync error:', err);
        }
      }
      
      if (operation === 'update' && (item as any)?.status === 'completed' && (originalItem as any)?.status !== 'completed') {
        try {
          await depleteInventoryForCompletedOrder(String((item as any).id), context as any);
        } catch (err) {
          console.error('Transactional inventory depletion failed; reconciliation is required:', err);
        }
      }
    }
  },
  fields: {
    orderNumber: text({ validation: { isRequired: true }, isIndexed: 'unique' }),
    orderType: select({
      type: "string",
      options: [
        { label: "Dine-in", value: "dine_in" },
        { label: "Takeout", value: "takeout" },
        { label: "Delivery", value: "delivery" },
      ],
      defaultValue: "dine_in",
    }),
    orderSource: select({
      type: "string",
      options: [
        { label: "POS", value: "pos" },
        { label: "Online", value: "online" },
        { label: "Kiosk", value: "kiosk" },
        { label: "Phone", value: "phone" },
      ],
      defaultValue: "pos",
    }),
    status: select({
      type: "string",
      options: [
        { label: "Open", value: "open" },
        { label: "Sent to Kitchen", value: "sent_to_kitchen" },
        { label: "In Progress", value: "in_progress" },
        { label: "Ready", value: "ready" },
        { label: "Served", value: "served" },
        { label: "Completed", value: "completed" },
        { label: "Cancelled", value: "cancelled" },
      ],
      defaultValue: "open",
    }),
    guestCount: integer({ defaultValue: 1, validation: { min: 1 } }),
    specialInstructions: text({ ui: { displayMode: "textarea" } }),
    onHold: checkbox({ defaultValue: false }),
    holdReason: text(),
    isUrgent: checkbox({ defaultValue: false }),
    subtotal: integer({ defaultValue: 0 }),
    tax: integer({ defaultValue: 0 }),
    tip: integer({ defaultValue: 0 }),
    discount: integer({ defaultValue: 0 }),
    total: integer({ defaultValue: 0 }),
    
    currencyCode: text({
      defaultValue: "USD",
      ui: { description: "ISO 4217 currency code at time of order" },
      hooks: {
        resolveInput: async ({ operation, inputData, context }) => {
          if (operation === "create" && !inputData.currencyCode) {
            const settings = await context.sudo().query.StoreSettings.findOne({
              where: { id: '1' },
              query: 'currencyCode'
            });
            return settings?.currencyCode || "USD";
          }
          return inputData.currencyCode;
        }
      }
    }),

    // Customer Info
    customerName: text(),
    customerEmail: text(),
    customerPhone: text(),
    
    // Delivery Info
    deliveryAddress: text({ ui: { displayMode: "textarea" } }),
    deliveryAddress2: text(),
    deliveryCity: text(),
    deliveryState: text(),
    deliveryZip: text(),
    deliveryCountryCode: text(),

    secretKey: text({
      hooks: {
        resolveInput: ({ operation }) => {
          if (operation === "create") {
            return crypto.randomBytes(32).toString("hex");
          }
          return undefined;
        },
      },
    }),
    
    tableSeatedAt: timestamp({ defaultValue: { kind: "now" } }),
    tableFreedAt: timestamp(),
    tableDurationMinutes: virtual({
      field: graphql.field({
        type: graphql.Int,
        resolve(item: any) {
          if (!item.tableSeatedAt) return null;
          const end = item.tableFreedAt ? new Date(item.tableFreedAt as string) : new Date();
          const start = new Date(item.tableSeatedAt as string);
          return Math.floor((end.getTime() - start.getTime()) / 60000);
        },
      })
    }),
    courseCompletionPercentage: virtual({
      field: graphql.field({
        type: graphql.Int,
        async resolve(item: any, args, context) {
          const courses = await context.sudo().query.OrderCourse.findMany({
            where: { order: { id: { equals: item.id as string } } },
            query: 'status'
          });
          if (courses.length === 0) return 0;
          return Math.round((courses.filter((c: any) => c.status === 'served').length / courses.length) * 100);
        }
      })
    }),
    tables: relationship({ ref: "Table.orders", many: true }),
    customer: relationship({ ref: "User.restaurantOrders" }),
    server: relationship({ ref: "User", ui: { labelField: "name" } }),
    createdBy: relationship({ ref: "User", ui: { labelField: "name" } }),
    courses: relationship({ ref: "OrderCourse.order", many: true }),
    orderItems: relationship({ ref: "OrderItem.order", many: true }),
    payments: relationship({ ref: "Payment.order", many: true }),
    discounts: relationship({ ref: "Discount.orders", many: true }),
    giftCards: relationship({ ref: "GiftCard.order", many: true }),
    ...trackingFields,
  },
});
