import { list } from "@keystone-6/core";
import { integer, json, relationship, select, text } from "@keystone-6/core/fields";
import { permissions } from "../access";
import { trackingFields } from "./trackingFields";

export const OrderAdjustment = list({
  access: {
    operation: {
      query: ({ session }) => permissions.canReadOrders({ session }) || permissions.canManageOrders({ session }),
      create: () => false,
      update: () => false,
      delete: () => false,
    },
  },
  fields: {
    idempotencyKey: text({ validation: { isRequired: true }, isIndexed: "unique" }),
    type: select({
      type: "string",
      options: [
        { label: "Void", value: "void" },
        { label: "Comp", value: "comp" },
        { label: "Split", value: "split" },
        { label: "Correction", value: "correction" },
      ],
      validation: { isRequired: true },
    }),
    amount: integer({ validation: { isRequired: true, min: 0 } }),
    reason: text({ validation: { isRequired: true }, ui: { displayMode: "textarea" } }),
    metadata: json(),
    order: relationship({ ref: "RestaurantOrder" }),
    orderItem: relationship({ ref: "OrderItem" }),
    actor: relationship({ ref: "User" }),
    approvedBy: relationship({ ref: "User" }),
    ...trackingFields,
  },
});
