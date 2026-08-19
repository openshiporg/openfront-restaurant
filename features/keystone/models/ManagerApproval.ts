import { list } from "@keystone-6/core";
import { integer, json, relationship, select, text, timestamp } from "@keystone-6/core/fields";
import { permissions } from "../access";
import { trackingFields } from "./trackingFields";

export const ManagerApproval = list({
  access: {
    operation: {
      query: ({ session }) =>
        permissions.canManageOrders({ session }) || permissions.canManagePayments({ session }),
      create: () => false,
      update: () => false,
      delete: () => false,
    },
  },
  fields: {
    actionType: select({
      type: "string",
      options: [
        { label: "Void order item", value: "void_item" },
        { label: "Comp order item", value: "comp_item" },
        { label: "Void order", value: "void_order" },
        { label: "Refund payment", value: "refund_payment" },
      ],
      validation: { isRequired: true },
      isIndexed: true,
    }),
    targetId: text({ validation: { isRequired: true }, isIndexed: true }),
    reason: text({ validation: { isRequired: true }, ui: { displayMode: "textarea" } }),
    amount: integer(),
    requestFingerprint: text({ validation: { isRequired: true } }),
    requestPayload: json(),
    status: select({
      type: "string",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Approved", value: "approved" },
        { label: "Rejected", value: "rejected" },
        { label: "Consumed", value: "consumed" },
        { label: "Expired", value: "expired" },
      ],
      defaultValue: "pending",
      validation: { isRequired: true },
      isIndexed: true,
    }),
    requestedAt: timestamp({ defaultValue: { kind: "now" }, isIndexed: true }),
    approvedAt: timestamp(),
    consumedAt: timestamp(),
    expiresAt: timestamp({ validation: { isRequired: true }, isIndexed: true }),
    consumedEntityType: text(),
    consumedEntityId: text(),
    requestedBy: relationship({ ref: "User" }),
    approvedBy: relationship({ ref: "User" }),
    ...trackingFields,
  },
  ui: { isHidden: true },
});
