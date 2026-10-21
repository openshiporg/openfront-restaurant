import { list, graphql } from "@keystone-6/core";
import {
  text,
  relationship,
  select,
  timestamp,
  decimal,
  virtual
} from "@keystone-6/core/fields";

import { isSignedIn, permissions } from "../access";
import { trackingFields } from "./trackingFields";

export const Shift = list({
  access: {
    operation: {
      query: isSignedIn,
      create: () => false,
      update: () => false,
      delete: () => false,
    },
    filter: { query: (args) => permissions.canReadStaff(args) || permissions.canManageStaff(args) ? true : { staff: { id: { equals: args.session?.itemId } } } },
  },
  ui: {
    listView: {
      initialColumns: ["staff", "startTime", "endTime", "role", "status"],
    },
  },
  fields: {
    startTime: timestamp({
      validation: { isRequired: true },
    }),

    endTime: timestamp({
      validation: { isRequired: true },
    }),

    role: select({
      type: "string",
      options: [
        { label: "Server", value: "server" },
        { label: "Bartender", value: "bartender" },
        { label: "Host", value: "host" },
        { label: "Busser", value: "busser" },
        { label: "Cook", value: "cook" },
        { label: "Dishwasher", value: "dishwasher" },
        { label: "Manager", value: "manager" },
      ],
      defaultValue: "server",
      validation: { isRequired: true },
    }),

    status: select({
      type: "string",
      options: [
        { label: "Scheduled", value: "scheduled" },
        { label: "Started", value: "started" },
        { label: "Completed", value: "completed" },
        { label: "No Show", value: "no_show" },
        { label: "Called Out", value: "called_out" },
      ],
      defaultValue: "scheduled",
    }),

    hourlyRate: decimal({
      precision: 10,
      scale: 2,
      ui: { description: "Hourly rate for this shift" },
    }),

    clockIn: timestamp({
      ui: { description: "Actual clock in time" },
    }),

    clockOut: timestamp({
      ui: { description: "Actual clock out time" },
    }),

    notes: text({
      ui: { displayMode: "textarea" },
    }),

    hoursWorked: virtual({
      field: graphql.field({
        type: graphql.Float,
        resolve(item: any) {
          if (!item.clockIn || !item.clockOut) return null;
          const start = new Date(item.clockIn as string);
          const end = new Date(item.clockOut as string);
          return Math.round((end.getTime() - start.getTime()) / 3600000 * 100) / 100;
        }
      })
    }),

    laborCost: virtual({
      field: graphql.field({
        type: graphql.Float,
        resolve(item: any) {
          if (!item.clockIn || !item.clockOut || !item.hourlyRate) return null;
          const start = new Date(item.clockIn as string);
          const end = new Date(item.clockOut as string);
          const hours = (end.getTime() - start.getTime()) / 3600000;
          return Math.round(hours * parseFloat(item.hourlyRate as string) * 100) / 100;
        }
      })
    }),

    // Relationships
    staff: relationship({
      ref: "User",
      ui: {
        displayMode: "select",
        labelField: "name",
      },
    }),

    ...trackingFields,
  },
});
