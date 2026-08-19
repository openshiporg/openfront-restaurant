import { list } from "@keystone-6/core";
import { integer, json, relationship, select, text, timestamp } from "@keystone-6/core/fields";
import { permissions } from "../access";
import { trackingFields } from "./trackingFields";

export const Refund = list({
  access: {
    operation: {
      query: ({ session }) => permissions.canReadPayments({ session }) || permissions.canManagePayments({ session }),
      create: () => false,
      update: () => false,
      delete: () => false,
    },
  },
  fields: {
    idempotencyKey: text({ validation: { isRequired: true }, isIndexed: "unique" }),
    amount: integer({ validation: { isRequired: true, min: 1 } }),
    currencyCode: text({ validation: { isRequired: true } }),
    status: select({
      type: "string",
      options: [
        { label: "Processing", value: "processing" },
        { label: "Succeeded", value: "succeeded" },
        { label: "Failed", value: "failed" },
        { label: "Unknown", value: "unknown" },
      ],
      defaultValue: "processing",
      validation: { isRequired: true },
    }),
    reason: text({ validation: { isRequired: true }, ui: { displayMode: "textarea" } }),
    providerRefundId: text(),
    providerData: json(),
    processedAt: timestamp(),
    payment: relationship({ ref: "Payment" }),
    order: relationship({ ref: "RestaurantOrder" }),
    requestedBy: relationship({ ref: "User" }),
    approvedBy: relationship({ ref: "User" }),
    ...trackingFields,
  },
});
