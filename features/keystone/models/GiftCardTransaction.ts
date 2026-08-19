import { list } from "@keystone-6/core";
import { integer, relationship, select, text } from "@keystone-6/core/fields";

import { isSignedIn, permissions } from "../access";
import { trackingFields } from "./trackingFields";

export const GiftCardTransaction = list({
  access: {
    operation: {
      query: permissions.canReadGiftCards,
      create: () => false,
      update: () => false,
      delete: () => false,
    },
  },
  ui: {
    listView: {
      initialColumns: ["giftCard", "amount", "createdAt", "order"],
    },
  },
  fields: {
    idempotencyKey: text({ validation: { isRequired: true }, isIndexed: "unique" }),
    type: select({
      type: "string",
      options: [
        { label: "Issue", value: "issue" },
        { label: "Redeem", value: "redeem" },
        { label: "Refund", value: "refund" },
        { label: "Adjustment", value: "adjustment" },
      ],
      validation: { isRequired: true },
    }),
    balanceAfter: integer({ validation: { isRequired: true } }),
    amount: integer({
      validation: { isRequired: true },
    }),
    ...trackingFields,
    giftCard: relationship({
      ref: "GiftCard.giftCardTransactions",
    }),
    order: relationship({
      ref: "RestaurantOrder",
    }),
  },
});
