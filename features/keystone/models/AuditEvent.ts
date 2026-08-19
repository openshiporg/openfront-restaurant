import { list } from "@keystone-6/core";
import { json, relationship, text, timestamp } from "@keystone-6/core/fields";
import { permissions } from "../access";
import { trackingFields } from "./trackingFields";

export const AuditEvent = list({
  access: {
    operation: {
      query: ({ session }) =>
        permissions.canManageOrders({ session }) ||
        permissions.canManagePayments({ session }) ||
        permissions.canManageInventory({ session }) ||
        permissions.canManageStaff({ session }),
      create: () => false,
      update: () => false,
      delete: () => false,
    },
  },
  fields: {
    eventKey: text({ validation: { isRequired: true }, isIndexed: "unique" }),
    eventType: text({ validation: { isRequired: true }, isIndexed: true }),
    entityType: text({ validation: { isRequired: true }, isIndexed: true }),
    entityId: text({ validation: { isRequired: true }, isIndexed: true }),
    reason: text({ ui: { displayMode: "textarea" } }),
    before: json(),
    after: json(),
    metadata: json(),
    occurredAt: timestamp({ defaultValue: { kind: "now" }, isIndexed: true }),
    actor: relationship({ ref: "User" }),
    approver: relationship({ ref: "User" }),
    ...trackingFields,
  },
});
