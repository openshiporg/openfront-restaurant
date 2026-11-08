import { list } from "@keystone-6/core";
import { checkbox, integer, json, text, timestamp, relationship } from "@keystone-6/core/fields";

import { isSignedIn, permissions } from "../access";
import { trackingFields } from "./trackingFields";

export const Discount = list({
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
      initialColumns: ["code", "isDisabled", "usageCount", "startsAt"],
    },
  },
  hooks: {
    validateInput: ({ resolvedData, item, addValidationError }: any) => {
      const pick = (key: string) => (resolvedData[key] !== undefined ? resolvedData[key] : item?.[key]);
      const startsAt = pick("startsAt"), endsAt = pick("endsAt");
      if (startsAt && endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
        addValidationError("A discount has to end after it starts.");
      }
      const usageLimit = pick("usageLimit"), usageCount = pick("usageCount") ?? 0;
      if (usageLimit !== null && usageLimit !== undefined && usageLimit < 1) addValidationError("A usage limit has to be at least 1. Leave it empty for no limit.");
      if (usageCount < 0) addValidationError("Times used can't be negative.");
      if (usageLimit !== null && usageLimit !== undefined && usageLimit >= 1 && usageCount > usageLimit) {
        addValidationError(`This code has already been used ${usageCount} times, so its limit can't be lower than that.`);
      }
    },
  },
  fields: {
    code: text({
      validation: { isRequired: true },
      isIndexed: "unique",
    }),
    isDynamic: checkbox(),
    isDisabled: checkbox(),
    stackable: checkbox({
      defaultValue: false,
    }),
    startsAt: timestamp({
      defaultValue: { kind: "now" },
      validation: { isRequired: true },
    }),
    endsAt: timestamp(),
    metadata: json(),
    usageLimit: integer(),
    usageCount: integer({
      defaultValue: 0,
      validation: { isRequired: true },
    }),
    validDuration: text(),
    ...trackingFields,
    discountRule: relationship({
      ref: "DiscountRule.discounts",
    }),
    orders: relationship({
      ref: "RestaurantOrder.discounts",
      many: true,
    }),
  },
});
