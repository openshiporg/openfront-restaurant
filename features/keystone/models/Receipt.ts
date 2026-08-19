import { list } from "@keystone-6/core";
import { integer, json, relationship, select, text, timestamp } from "@keystone-6/core/fields";
import { permissions } from "../access";
import { trackingFields } from "./trackingFields";

export const Receipt = list({
  access: {
    operation: {
      query: ({ session }) => permissions.canReadPayments({ session }) || permissions.canManagePayments({ session }),
      create: () => false,
      update: () => false,
      delete: () => false,
    },
  },
  fields: {
    receiptNumber: text({ validation: { isRequired: true }, isIndexed: "unique" }),
    kind: select({
      type: "string",
      options: [
        { label: "Sale", value: "sale" },
        { label: "Refund", value: "refund" },
        { label: "Correction", value: "correction" },
      ],
      defaultValue: "sale",
      validation: { isRequired: true },
    }),
    amount: integer({ validation: { isRequired: true } }),
    currencyCode: text({ validation: { isRequired: true } }),
    snapshot: json(),
    issuedAt: timestamp({ defaultValue: { kind: "now" }, isIndexed: true }),
    order: relationship({ ref: "RestaurantOrder" }),
    payment: relationship({ ref: "Payment" }),
    refund: relationship({ ref: "Refund" }),
    correctsReceipt: relationship({ ref: "Receipt" }),
    issuedBy: relationship({ ref: "User" }),
    ...trackingFields,
  },
});
