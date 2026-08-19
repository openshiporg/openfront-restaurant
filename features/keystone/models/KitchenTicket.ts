import { list } from "@keystone-6/core";
import {
  relationship,
  select,
  integer,
  json,
  timestamp,
} from "@keystone-6/core/fields";

import { permissions } from "../access";
import { trackingFields } from "./trackingFields";

export const KitchenTicket = list({
  access: {
    operation: {
      query: permissions.canReadKitchen,
      create: () => false,
      update: () => false,
      delete: () => false,
    },
  },
  ui: {
    listView: {
      initialColumns: ["order", "station", "status", "priority", "firedAt"],
    },
  },
  fields: {
    status: select({
      type: "string",
      options: [
        { label: "New", value: "new" },
        { label: "In Progress", value: "in_progress" },
        { label: "Ready", value: "ready" },
        { label: "Served", value: "served" },
        { label: "Cancelled", value: "cancelled" },
      ],
      defaultValue: "new",
      validation: { isRequired: true },
    }),

    priority: integer({
      defaultValue: 0,
      ui: {
        description: "Priority level (higher numbers = higher priority)",
      },
    }),

    ticketType: select({
      type: "string",
      options: [
        { label: "Prep", value: "prep" },
        { label: "Expediter", value: "expediter" },
      ],
      defaultValue: "prep",
      ui: {
        description: "Whether this ticket is shown in prep or expediter context",
      },
    }),

    items: json({
      ui: {
        description: "Order items for this ticket (JSON array)",
      },
    }),

    firedAt: timestamp({
      defaultValue: { kind: "now" },
      ui: {
        description: "When the ticket was sent to the kitchen",
      },
    }),

    startedAt: timestamp({
      ui: {
        description: "When kitchen staff started working on this ticket",
      },
    }),

    completedAt: timestamp({
      ui: {
        description: "When all items were completed",
      },
    }),

    servedAt: timestamp({
      ui: {
        description: "When the items were served to the customer",
      },
    }),

    recalledAt: timestamp({
      ui: {
        description: "When the ticket was recalled back into preparation",
      },
    }),

    // Relationships
    order: relationship({
      ref: "RestaurantOrder",
      ui: {
        displayMode: "select",
        description: "Restaurant order this ticket belongs to",
      },
    }),

    station: relationship({
      ref: "KitchenStation.tickets",
      ui: {
        displayMode: "select",
        description: "Kitchen station assigned to this ticket",
      },
    }),

    orderItems: relationship({
      ref: "OrderItem.kitchenTickets",
      many: true,
      ui: {
        displayMode: "select",
        description: "Normalized order items included in this ticket",
      },
    }),

    preparedBy: relationship({
      ref: "User",
      ui: {
        displayMode: "select",
        description: "Staff member who prepared this ticket",
      },
    }),
    ...trackingFields,
  },
});
