import { list, graphql } from "@keystone-6/core";
import { text, integer, select, relationship, float, json, virtual } from "@keystone-6/core/fields";

import { permissions } from "../access";
import { trackingFields } from "./trackingFields";

export const Table = list({
  access: {
    operation: {
      query: permissions.canReadTables,
      create: permissions.canManageTables,
      update: permissions.canManageTables,
      delete: () => false,
    },
  },
  ui: {
    listView: {
      initialColumns: ["tableNumber", "capacity", "section", "status"],
    },
  },
  fields: {
    tableNumber: text({
      validation: { isRequired: true },
      isIndexed: true,
    }),

    capacity: integer({
      access: { update: () => false },
      validation: { isRequired: true, min: 1 },
      defaultValue: 4,
    }),

    status: select({
      access: { create: () => false, update: () => false },
      type: "string",
      options: [
        { label: "Available", value: "available" },
        { label: "Occupied", value: "occupied" },
        { label: "Reserved", value: "reserved" },
        { label: "Cleaning", value: "cleaning" },
      ],
      defaultValue: "available",
      ui: {
        displayMode: "segmented-control",
      },
    }),

    shape: select({
      type: "string",
      options: [
        { label: "Round", value: "round" },
        { label: "Square", value: "square" },
        { label: "Rectangle", value: "rectangle" },
      ],
      defaultValue: "rectangle",
      ui: {
        description: "Table shape for floor plan rendering",
      },
    }),

    // Floor plan positioning
    positionX: float({
      defaultValue: 0,
      ui: {
        description: "X coordinate for floor plan rendering",
      },
    }),

    positionY: float({
      defaultValue: 0,
      ui: {
        description: "Y coordinate for floor plan rendering",
      },
    }),

    metadata: json({
      ui: {
        description: "Additional table metadata (dimensions, notes, etc.)",
      },
    }),

    // Relationships
    floor: relationship({
      ref: "Floor.tables",
      ui: {
        displayMode: "select",
        description: "Floor this table belongs to",
      },
    }),

    section: relationship({
      ref: "Section.tables",
      ui: {
        displayMode: "select",
      },
    }),

    orders: relationship({
      access: { create: () => false, update: () => false },
      ref: "RestaurantOrder.tables",
      many: true,
      ui: {
        createView: { fieldMode: 'hidden' },
        itemView: { fieldMode: 'read' },
      },
    }),

    turnoverRate: virtual({
      field: graphql.field({
        type: graphql.Float,
        async resolve(item: any, args, context) {
          const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
          const ordersCount = await context.sudo().query.RestaurantOrder.count({
            where: {
              tables: { some: { id: { equals: item.id as string } } },
              createdAt: { gte: dayAgo.toISOString() },
              status: { equals: 'completed' }
            }
          });
          return ordersCount;
        }
      }),
      ui: {
        description: "Number of completed orders in the last 24 hours",
      }
    }),
    ...trackingFields,
  },
});
