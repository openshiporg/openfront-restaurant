import { list, graphql } from "@keystone-6/core";
import {
  text,
  relationship,
  select,
  timestamp,
  decimal,
  json,
  virtual
} from "@keystone-6/core/fields";

import { isSignedIn, permissions } from "../access";
import { trackingFields } from "./trackingFields";

export const PurchaseOrder = list({
  access: {
    filter: { update: () => ({ status: { equals: "draft" } }), delete: () => ({ status: { equals: "draft" } }) },
    operation: {
      query: permissions.canReadInventory,
      create: permissions.canManageInventory,
      update: permissions.canManageInventory,
      delete: permissions.canManageInventory,
    },
  },
  ui: {
    listView: {
      initialColumns: ["poNumber", "vendor", "orderDate", "status", "totalCost"],
    },
    labelField: "poNumber",
  },
  fields: {
    poNumber: text({
      validation: { isRequired: true },
      isIndexed: 'unique',
    }),

    orderDate: timestamp({
      validation: { isRequired: true },
      defaultValue: { kind: "now" },
    }),

    expectedDelivery: timestamp({
      ui: { description: "Expected delivery date" },
    }),

    receivedDate: timestamp({
      access: { create: () => false, update: () => false },
      ui: { description: "Actual received date" },
    }),

    status: select({
      access: { create: () => false, update: () => false },
      type: "string",
      options: [
        { label: "Draft", value: "draft" },
        { label: "Sent", value: "sent" },
        { label: "Confirmed", value: "confirmed" },
        { label: "Shipped", value: "shipped" },
        { label: "Partially received", value: "partially_received" },
        { label: "Received", value: "received" },
        { label: "Cancelled", value: "cancelled" },
      ],
      defaultValue: "draft",
    }),

    lineItems: json({
      ui: {
        description: "Array of { ingredientId, ingredientName, quantity, unit, unitCost, totalCost }",
      },
    }),

    totalCost: virtual({
      field: graphql.field({
        type: graphql.Float,
        resolve(item) {
          if (!item.lineItems) return 0;
          const items = item.lineItems as any[];
          return items.reduce((sum, li) => sum + (li.totalCost || 0), 0);
        }
      })
    }),

    notes: text({
      ui: { displayMode: "textarea" },
    }),

    // Relationships
    vendor: relationship({
      ref: "Vendor",
      ui: {
        displayMode: "select",
      },
    }),

    createdBy: relationship({
      ref: "User",
      ui: {
        displayMode: "select",
        labelField: "name",
      },
    }),

    ...trackingFields,
  },
});
