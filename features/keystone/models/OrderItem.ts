import { list, graphql } from "@keystone-6/core";
import {
  text,
  relationship,
  integer,
  timestamp,
  virtual,
  select,
  checkbox,
  json
} from "@keystone-6/core/fields";

import { permissions } from "../access";
import { isKitchenActiveOrderStatus, syncKitchenTicketsForOrder } from "../utils/kitchenTicketSync";
import { trackingFields } from "./trackingFields";

export const OrderItem = list({
  hooks: {
    afterOperation: async ({ operation, item, originalItem, context }) => {
      const orderId = String(
        (item as any)?.orderId ||
          (item as any)?.order?.id ||
          (originalItem as any)?.orderId ||
          (originalItem as any)?.order?.id ||
          ""
      );

      if (!orderId) return;

      const order = await context.sudo().query.RestaurantOrder.findOne({
        where: { id: orderId },
        query: "id status",
      });

      if (!order || !isKitchenActiveOrderStatus(order.status)) return;

      try {
        await syncKitchenTicketsForOrder(order.id, context as any);
      } catch (err) {
        console.error(`Kitchen ticket sync error after order item ${operation}:`, err);
      }
    },
  },
  access: {
    operation: {
      query: permissions.canReadOrders,
      create: () => false,
      update: () => false,
      delete: () => false,
    },
  },
  ui: {
    listView: {
      initialColumns: ["menuItem", "quantity", "price", "order"],
    },
  },
  fields: {
    quantity: integer({
      defaultValue: 1,
      validation: { min: 1, isRequired: true },
    }),

    price: integer({
      validation: { isRequired: true },
      ui: {
        description: "Price at time of order in cents (snapshot)",
      },
    }),

    unitPrice: virtual({
      field: graphql.field({
        type: graphql.Int,
        resolve(item: any) {
          return item.price || 0;
        },
      }),
    }),

    totalPrice: virtual({
      field: graphql.field({
        type: graphql.Int,
        resolve(item: any) {
          return (item.price || 0) * (item.quantity || 1);
        },
      }),
    }),

    itemNameSnapshot: text({
      validation: { isRequired: true },
      ui: { description: "Immutable menu item name captured when ordered" },
    }),

    itemThumbnailSnapshot: text({
      ui: { description: "Immutable menu image URL captured when ordered" },
    }),

    kitchenStationSnapshot: text({
      ui: { description: "Kitchen routing station captured when ordered" },
    }),

    menuItemIdSnapshot: text({
      ui: { description: "Historical menu item identifier; not an authority for display" },
    }),

    originalOrderIdSnapshot: text({
      ui: { description: "Original check identifier retained when an item is split" },
    }),

    modifiersSnapshot: json({
      ui: { description: "Immutable modifier names, groups, and prices captured when ordered" },
    }),

    thumbnail: virtual({
      field: graphql.field({
        type: graphql.String,
        async resolve(item: any, args, context) {
          if (item.itemThumbnailSnapshot) return item.itemThumbnailSnapshot;
          const orderItem = await context.sudo().query.OrderItem.findOne({
            where: { id: String(item.id) },
            query: "itemThumbnailSnapshot menuItem { thumbnail }",
          });
          return orderItem?.itemThumbnailSnapshot || orderItem?.menuItem?.thumbnail || null;
        },
      }),
    }),

    adjustmentTotal: integer({
      defaultValue: 0,
      validation: { min: 0 },
      ui: { description: "Append-derived comp/correction amount; original price remains unchanged" },
    }),

    isVoided: checkbox({ defaultValue: false }),
    voidedAt: timestamp(),
    voidReason: text({ ui: { displayMode: "textarea" } }),
    voidedBy: relationship({ ref: "User" }),
    approvedBy: relationship({ ref: "User" }),

    specialInstructions: text({
      ui: {
        displayMode: "textarea",
      },
    }),

    courseNumber: integer({
      defaultValue: 1,
      ui: {
        description: "For fine dining: 1=appetizer, 2=main, 3=dessert",
      },
    }),

    seatNumber: integer({
      ui: {
        description: "Seat number for split check support",
      },
    }),

    sentToKitchen: timestamp({
      ui: {
        description: "When this item was sent to kitchen",
      },
    }),

    kitchenStatus: select({
      type: "string",
      options: [
        { label: "New", value: "new" },
        { label: "In Progress", value: "in_progress" },
        { label: "Ready", value: "ready" },
        { label: "Fulfilled", value: "fulfilled" },
        { label: "Recalled", value: "recalled" },
        { label: "Voided", value: "voided" },
      ],
      defaultValue: "new",
      ui: {
        description: "Kitchen lifecycle state for this item",
      },
    }),

    firedAt: timestamp({
      ui: {
        description: "When this item was fired to prep station",
      },
    }),

    kitchenStartedAt: timestamp({
      ui: {
        description: "When prep started",
      },
    }),

    kitchenReadyAt: timestamp({
      ui: {
        description: "When item was marked ready",
      },
    }),

    fulfilledAt: timestamp({
      ui: {
        description: "When item was fulfilled/served",
      },
    }),

    recalledAt: timestamp({
      ui: {
        description: "When item was recalled from ready state",
      },
    }),

    // Relationships
    order: relationship({
      ref: "RestaurantOrder.orderItems",
      ui: {
        displayMode: "select",
      },
    }),

    course: relationship({
      ref: "OrderCourse.orderItems",
      ui: {
        displayMode: "select",
      },
    }),

    menuItem: relationship({
      ref: "MenuItem",
      ui: {
        displayMode: "select",
      },
    }),

    // Applied modifiers for this order item
    appliedModifiers: relationship({
      ref: "MenuItemModifier",
      many: true,
      ui: {
        displayMode: "select",
      },
    }),

    kitchenTickets: relationship({
      ref: "KitchenTicket.orderItems",
      many: true,
      ui: {
        displayMode: "select",
        description: "Kitchen tickets this item has appeared on",
      },
    }),
    ...trackingFields,
  },
});
