import { list } from "@keystone-6/core";
import {
  text,
  integer,
  select,
  timestamp,
  relationship,
} from "@keystone-6/core/fields";

import { isSignedIn, permissions } from "../access";
import { trackingFields } from "./trackingFields";

export const WaitlistEntry = list({
  access: {
    operation: {
      query: permissions.canReadKitchen,
      create: () => false,
      update: () => false,
      delete: () => false,
    },
  },
  ui: {
    listView: {
      initialColumns: ["customerName", "partySize", "quotedWaitTime", "status", "addedAt"],
    },
    labelField: "customerName",
  },
  fields: {
    customerName: text({
      validation: { isRequired: true },
    }),

    phoneNumber: text({
      validation: { isRequired: true },
      ui: {
        description: "Phone number for SMS notifications",
      },
    }),

    partySize: integer({
      validation: { isRequired: true, min: 1 },
      defaultValue: 2,
    }),

    quotedWaitTime: integer({
      validation: { min: 0 },
      defaultValue: 15,
      ui: {
        description: "Quoted wait time in minutes",
      },
    }),

    status: select({
      type: "string",
      options: [
        { label: "Completed", value: "completed" },
        { label: "Waiting", value: "waiting" },
        { label: "Notified", value: "notified" },
        { label: "Seated", value: "seated" },
        { label: "Cancelled", value: "cancelled" },
        { label: "No Show", value: "no_show" },
      ],
      defaultValue: "waiting",
      ui: {
        displayMode: "segmented-control",
      },
    }),

    addedAt: timestamp({
      defaultValue: { kind: "now" },
      validation: { isRequired: true },
    }),

    notifiedAt: timestamp({
      ui: {
        description: "When the customer was notified their table is ready",
      },
    }),

    seatedAt: timestamp({
      ui: {
        description: "When the customer was actually seated",
      },
    }),

    notes: text({
      ui: {
        displayMode: "textarea",
        description: "Special requests, high chair needed, etc.",
      },
    }),

    // Relationships
    table: relationship({
      ref: "Table",
      ui: {
        displayMode: "select",
        description: "Table assigned when seated",
      },
    }),

    addedBy: relationship({
      ref: "User",
      ui: {
        displayMode: "select",
        labelField: "name",
        description: "Staff member who added this entry",
      },
    }),

    ...trackingFields,
  },
});
