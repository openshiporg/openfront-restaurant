import { list } from "@keystone-6/core";
import { allOperations } from "@keystone-6/core/access";
import {
  text,
  select,
  decimal,
  relationship,
  json,
} from "@keystone-6/core/fields";

import { isSignedIn, permissions } from "../access";
import { trackingFields } from "./trackingFields";

export const StockMovement = list({
  access: {
    operation: {
      query: permissions.canReadInventory,
      create: () => false,
      update: () => false,
      delete: () => false,
    },
  },
  ui: {
    listView: {
      initialColumns: ["ingredient", "type", "quantity", "createdAt", "createdBy"],
    },
  },
  fields: {
    eventKey: text({ validation: { isRequired: true }, isIndexed: "unique" }),
    referenceType: text(),
    referenceId: text({ isIndexed: true }),
    metadata: json(),
    type: select({
      type: "string",
      options: [
        { label: "Sale", value: "sale" },
        { label: "Waste", value: "waste" },
        { label: "Spoilage", value: "spoilage" },
        { label: "Theft", value: "theft" },
        { label: "Adjustment", value: "adjustment" },
        { label: "Delivery", value: "delivery" },
        { label: "Return", value: "return" },
      ],
      validation: { isRequired: true },
      ui: {
        description: "Type of stock movement",
      },
    }),

    quantity: decimal({
      precision: 10,
      scale: 2,
      validation: { isRequired: true },
      ui: {
        description: "Quantity moved (positive for additions, negative for reductions)",
      },
    }),

    reason: text({
      ui: {
        displayMode: "textarea",
        description: "Reason for the stock movement",
      },
    }),

    // Relationships
    ingredient: relationship({
      ref: "Ingredient.stockMovements",
      ui: {
        displayMode: "select",
        description: "Ingredient this movement affects",
      },
    }),

    createdBy: relationship({
      ref: "User",
      ui: {
        displayMode: "select",
        description: "Staff member who recorded this movement",
      },
    }),

    order: relationship({
      ref: "RestaurantOrder",
      ui: {
        displayMode: "select",
        description: "Related order (for sale movements)",
      },
    }),
    ...trackingFields,
  },
});
