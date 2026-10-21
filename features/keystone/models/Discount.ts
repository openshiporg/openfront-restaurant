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
