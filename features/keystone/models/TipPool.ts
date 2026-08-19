import { list, graphql } from "@keystone-6/core";
import {
  text,
  relationship,
  select,
  timestamp,
  integer,
  json,
  virtual
} from "@keystone-6/core/fields";

import { isSignedIn, permissions } from "../access";
import { trackingFields } from "./trackingFields";

export const TipPool = list({
  access: {
    operation: {
      query: permissions.canReadStaff,
      create: () => false,
      update: () => false,
      delete: () => false,
    },
  },
  ui: {
    listView: {
      initialColumns: ["date", "tipPoolType", "totalTips", "status"],
    },
  },
  fields: {
    date: timestamp({
      validation: { isRequired: true },
      ui: { description: "Date this tip pool is for" },
    }),

    tipPoolType: select({
      type: "string",
      options: [
        { label: "Individual", value: "individual" },
        { label: "Pool by Role", value: "pool_by_role" },
        { label: "House Pool", value: "house_pool" },
      ],
      defaultValue: "individual",
    }),

    totalTips: integer({
      defaultValue: 0,
      validation: { isRequired: true },
      ui: { description: "Total tips in cents" },
    }),

    cashTips: integer({
      defaultValue: 0,
      ui: { description: "Cash tips in cents" },
    }),

    creditTips: integer({
      defaultValue: 0,
      ui: { description: "Credit tips in cents" },
    }),

    distributions: json({
      ui: {
        description: "Array of { staffId, staffName, role, hoursWorked, amount }",
      },
    }),

    status: select({
      type: "string",
      options: [
        { label: "Open", value: "open" },
        { label: "Calculated", value: "calculated" },
        { label: "Distributed", value: "distributed" },
      ],
      defaultValue: "open",
    }),

    notes: text({
      ui: { displayMode: "textarea" },
    }),

    // Relationships
    createdBy: relationship({
      ref: "User",
      ui: {
        displayMode: "select",
        labelField: "name",
      },
    }),

    ...trackingFields,
  },
});
