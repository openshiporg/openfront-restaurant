import { list } from "@keystone-6/core";
import { integer, json, select, text, relationship } from "@keystone-6/core/fields";

import { isSignedIn, permissions } from "../access";
import { trackingFields } from "./trackingFields";

export const DiscountRule = list({
  access: {
    operation: {
      query: permissions.canReadDiscounts,
      create: permissions.canManageDiscounts,
      update: permissions.canManageDiscounts,
      delete: permissions.canManageDiscounts,
    },
  },
  ui: {
    listView: {
      initialColumns: ["description", "type", "value"],
    },
  },
  hooks: {
    validateInput: ({ resolvedData, item, addValidationError }: any) => {
      const type = resolvedData.type !== undefined ? resolvedData.type : item?.type;
      const value = resolvedData.value !== undefined ? resolvedData.value : item?.value;
      if (typeof value === "number" && value < 0) addValidationError("A discount can't take off a negative amount.");
      if (type === "percentage" && typeof value === "number" && value > 100) addValidationError("A percentage discount can be at most 100%.");
    },
  },
  fields: {
    description: text(),
    type: select({
      type: "enum",
      options: [
        { label: "Fixed", value: "fixed" },
        { label: "Percentage", value: "percentage" },
        { label: "Free Item", value: "free_item" },
      ],
      validation: { isRequired: true },
    }),
    value: integer({
      validation: { isRequired: true },
    }),
    allocation: select({
      type: "enum",
      options: [
        { label: "Total", value: "total" },
        { label: "Item", value: "item" },
      ],
    }),
    metadata: json(),
    discounts: relationship({
      ref: "Discount.discountRule",
      many: true,
    }),
    ...trackingFields,
  },
});
