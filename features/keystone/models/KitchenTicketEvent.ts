import { list } from "@keystone-6/core";
import { json, relationship, select, text, timestamp } from "@keystone-6/core/fields";
import { permissions } from "../access";
import { trackingFields } from "./trackingFields";

export const KitchenTicketEvent = list({
  access: {
    operation: {
      query: ({ session }) => permissions.canReadKitchen({ session }) || permissions.canManageKitchen({ session }),
      create: () => false,
      update: () => false,
      delete: () => false,
    },
  },
  fields: {
    eventType: select({
      type: "string",
      options: [
        { label: "Dispatch", value: "dispatch" },
        { label: "Delta", value: "delta" },
        { label: "Status", value: "status" },
        { label: "Item Status", value: "item_status" },
        { label: "Recall", value: "recall" },
        { label: "Cancel", value: "cancel" },
      ],
      validation: { isRequired: true },
    }),
    eventKey: text({ isIndexed: "unique", validation: { isRequired: true } }),
    payload: json(),
    occurredAt: timestamp({ defaultValue: { kind: "now" }, isIndexed: true }),
    ticket: relationship({ ref: "KitchenTicket" }),
    order: relationship({ ref: "RestaurantOrder" }),
    orderItem: relationship({ ref: "OrderItem" }),
    actor: relationship({ ref: "User" }),
    ...trackingFields,
  },
});
