import { list } from "@keystone-6/core";
import { allOperations } from "@keystone-6/core/access";
import {
  text,
  relationship,
  select,
  integer,
  timestamp
} from "@keystone-6/core/fields";

import { isSignedIn, permissions } from "../access";
import { trackingFields } from "./trackingFields";

export const Reservation = list({
  access: {
    operation: {
      query: permissions.canReadTables,
      create: () => false,
      update: () => false,
      delete: () => false,
    },
  },
  ui: {
    listView: {
      initialColumns: ["customerName", "reservationDate", "partySize", "status", "assignedTable"],
    },
  },
  fields: {
    customerName: text({
      validation: { isRequired: true },
    }),

    customerPhone: text({
      validation: { isRequired: true },
    }),

    customerEmail: text(),

    reservationDate: timestamp({
      validation: { isRequired: true },
    }),

    partySize: integer({
      validation: { isRequired: true, min: 1 },
      defaultValue: 2,
    }),

    duration: integer({
      defaultValue: 90,
      ui: {
        description: "Expected duration in minutes",
      },
    }),

    status: select({
      type: "string",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Confirmed", value: "confirmed" },
        { label: "Seated", value: "seated" },
        { label: "Completed", value: "completed" },
        { label: "Cancelled", value: "cancelled" },
        { label: "No-show", value: "no_show" },
      ],
      defaultValue: "pending",
    }),

    specialRequests: text({
      ui: {
        displayMode: "textarea",
      },
    }),

    // Relationships
    assignedTable: relationship({
      ref: "Table",
      ui: {
        displayMode: "select",
      },
    }),
    ...trackingFields,
  },
});
