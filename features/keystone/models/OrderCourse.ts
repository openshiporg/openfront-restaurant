import { list } from "@keystone-6/core";
import { allOperations } from "@keystone-6/core/access";
import {
  text,
  relationship,
  select,
  integer,
  timestamp,
  checkbox
} from "@keystone-6/core/fields";

import { isSignedIn, permissions } from "../access";
import { trackingFields } from "./trackingFields";

export const OrderCourse = list({
  access: {
    operation: {
      query: ({ session }) => permissions.canReadKitchen({ session }) || permissions.canReadOrders({ session }),
      create: () => false,
      update: () => false,
      delete: () => false,
    },
  },
  ui: {
    listView: {
      initialColumns: ["order", "courseType", "status", "fireTime"],
    },
  },
  fields: {
    courseType: select({
      type: "string",
      options: [
        { label: "Appetizers", value: "appetizers" },
        { label: "Mains", value: "mains" },
        { label: "Desserts", value: "desserts" },
        { label: "Drinks", value: "drinks" },
      ],
      defaultValue: "mains",
      validation: { isRequired: true },
    }),

    status: select({
      type: "string",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Fired", value: "fired" },
        { label: "Ready", value: "ready" },
        { label: "Served", value: "served" },
      ],
      defaultValue: "pending",
    }),

    fireTime: timestamp({
      ui: {
        description: "When this course was sent to the kitchen",
      },
    }),

    autoFireAt: timestamp({
      ui: {
        description: "Scheduled time to auto-fire this course",
      },
    }),

    onHold: checkbox({ defaultValue: false }),

    allItemsReady: checkbox({
      defaultValue: false,
    }),

    courseNumber: integer({
      defaultValue: 1,
    }),

    // Relationships
    order: relationship({
      ref: "RestaurantOrder.courses",
      ui: {
        displayMode: "select",
      },
    }),

    orderItems: relationship({
      ref: "OrderItem.course",
      many: true,
    }),

    ...trackingFields,
  },
});
