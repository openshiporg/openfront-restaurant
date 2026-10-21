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

export const TimeEntry = list({
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
      initialColumns: ["staff", "clockIn", "clockOut", "role", "hoursWorked"],
    },
  },
  fields: {
    clockIn: timestamp({
      validation: { isRequired: true },
    }),

    clockOut: timestamp(),

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
    }),

    hourlyRate: decimal({
      precision: 10,
      scale: 2,
      ui: { description: "Hourly rate at time of clock in" },
    }),

    tips: decimal({
      precision: 10,
      scale: 2,
      defaultValue: "0.00",
      ui: { description: "Tips earned during this shift" },
    }),

    breakMinutes: decimal({
      precision: 5,
      scale: 0,
      defaultValue: "0",
      ui: { description: "Break time in minutes" },
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
          const breakMins = parseFloat(item.breakMinutes || '0');
          const totalMins = (end.getTime() - start.getTime()) / 60000 - breakMins;
          return Math.round(totalMins / 60 * 100) / 100;
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
          const breakMins = parseFloat(item.breakMinutes || '0');
          const hours = ((end.getTime() - start.getTime()) / 60000 - breakMins) / 60;
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
