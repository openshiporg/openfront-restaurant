import { list } from "@keystone-6/core";
import { relationship, integer } from "@keystone-6/core/fields";

import { permissions } from "../access";
import { trackingFields } from "./trackingFields";

export const PrepStation = list({
  access: {
    operation: {
      query: permissions.canReadKitchen,
      create: permissions.canManageKitchen,
      update: permissions.canManageKitchen,
      delete: permissions.canManageKitchen,
    },
  },
  ui: {
    listView: {
      initialColumns: ["menuItem", "station", "preparationTime"],
    },
    labelField: "id",
  },
  fields: {
    menuItem: relationship({
      ref: "MenuItem",
      ui: {
        displayMode: "select",
        description: "Menu item to be prepared at this station",
      },
    }),

    station: relationship({
      ref: "KitchenStation.prepStations",
      ui: {
        displayMode: "select",
        description: "Kitchen station for preparation",
      },
    }),

    preparationTime: integer({
      defaultValue: 15,
      ui: {
        description: "Expected preparation time in minutes",
      },
    }),
    ...trackingFields,
  },
});
