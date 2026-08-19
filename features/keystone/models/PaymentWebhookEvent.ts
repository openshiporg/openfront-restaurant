import { list } from "@keystone-6/core";
import { integer, json, relationship, select, text, timestamp } from "@keystone-6/core/fields";
import { permissions } from "../access";
import { trackingFields } from "./trackingFields";

export const PaymentWebhookEvent = list({
  access: {
    operation: {
      query: permissions.canManagePayments,
      create: () => false,
      update: () => false,
      delete: () => false,
    },
  },
  fields: {
    eventKey: text({ validation: { isRequired: true }, isIndexed: "unique" }),
    providerCode: text({ validation: { isRequired: true }, isIndexed: true }),
    providerEventId: text({ isIndexed: true }),
    eventType: text({ isIndexed: true }),
    status: select({
      type: "string",
      options: [
        { label: "Received", value: "received" },
        { label: "Processed", value: "processed" },
        { label: "Ignored", value: "ignored" },
        { label: "Failed", value: "failed" },
      ],
      defaultValue: "received",
    }),
    payload: json(),
    rawBody: text({ ui: { displayMode: "textarea" } }),
    error: text({ ui: { displayMode: "textarea" } }),
    attempts: integer({ defaultValue: 0 }),
    receivedAt: timestamp({ defaultValue: { kind: "now" }, isIndexed: true }),
    processedAt: timestamp(),
    payment: relationship({ ref: "Payment" }),
    ...trackingFields,
  },
});
