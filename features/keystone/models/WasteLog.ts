import { list, graphql } from "@keystone-6/core";
import {
  text,
  relationship,
  select,
  decimal,
  virtual,
  timestamp
} from "@keystone-6/core/fields";

import { isSignedIn, permissions } from "../access";
import { trackingFields } from "./trackingFields";

export const WasteLog = list({
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
      initialColumns: ["ingredient", "quantity", "reason", "cost", "createdAt"],
    },
  },
  fields: {
    eventKey: text({ validation: { isRequired: true }, isIndexed: "unique" }),
    reversedAt: timestamp(),
    reversedBy: relationship({ ref: "User" }),
    reversalReason: text({ ui: { displayMode: "textarea" } }),

    quantity: decimal({
      precision: 10,
      scale: 2,
      validation: { isRequired: true },
      ui: { description: "Amount wasted" },
    }),

    reason: select({
      type: "string",
      options: [
        { label: "Spoilage", value: "spoilage" },
        { label: "Preparation Error", value: "preparation_error" },
        { label: "Overproduction", value: "overproduction" },
        { label: "Plate Waste", value: "plate_waste" },
        { label: "Expired", value: "expired" },
        { label: "Damaged", value: "damaged" },
        { label: "Other", value: "other" },
      ],
      defaultValue: "spoilage",
      validation: { isRequired: true },
    }),

    cost: virtual({
      field: graphql.field({
        type: graphql.Float,
        async resolve(item: any, args, context) {
          if (!item.ingredientId || !item.quantity) return 0;
          const ingredient = await context.sudo().query.Ingredient.findOne({
            where: { id: item.ingredientId as string },
            query: 'costPerUnit'
          });
          if (!ingredient?.costPerUnit) return 0;
          return parseFloat(ingredient.costPerUnit) * parseFloat(item.quantity as string);
        }
      })
    }),

    notes: text({
      ui: { displayMode: "textarea" },
    }),

    // Relationships
    ingredient: relationship({
      ref: "Ingredient",
      ui: {
        displayMode: "select",
      },
    }),

    loggedBy: relationship({
      ref: "User",
      ui: {
        displayMode: "select",
        labelField: "name",
      },
    }),

    ...trackingFields,
  },
});
