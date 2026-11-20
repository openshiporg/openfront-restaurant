import { list } from "@keystone-6/core";
import { text, relationship, select, checkbox, integer } from "@keystone-6/core/fields";

import { permissions } from "../access";
import { trackingFields } from "./trackingFields";

export const MenuItemModifier = list({
  access: {
    operation: {
      query: () => true, // Public read for storefront
      create: permissions.canManageProducts,
      update: permissions.canManageProducts,
      delete: permissions.canManageProducts,
    },
  },
  ui: {
    listView: {
      initialColumns: ["name", "modifierGroup", "priceAdjustment", "defaultSelected"],
    },
  },
  fields: {
    name: text({
      validation: { isRequired: true },
    }),

    modifierGroup: select({
      type: "string",
      options: [
        { label: "Size", value: "size" },
        { label: "Temperature", value: "temperature" },
        { label: "Add-ons", value: "addons" },
        { label: "Removals", value: "removals" },
        { label: "Sides", value: "sides" },
        { label: "Dressings", value: "dressings" },
        { label: "Cheese", value: "cheese" },
        { label: "Toppings", value: "toppings" },
        { label: "Sauces", value: "sauces" },
        { label: "Patty", value: "patty" },
        { label: "Ice", value: "ice" },
        { label: "Dipping", value: "dipping" },
      ],
      defaultValue: "addons",
    }),

    modifierGroupLabel: text({
      ui: {
        description: "Display name for this modifier group (e.g. 'Choose Your Patty')",
      },
    }),

    required: checkbox({
      defaultValue: false,
      ui: {
        description: "Whether a selection from this group is required",
      },
    }),

    minSelections: integer({
      defaultValue: 0,
      ui: {
        description: "Minimum number of selections required",
      },
    }),

    maxSelections: integer({
      defaultValue: 1,
      ui: {
        description: "Maximum number of selections allowed",
      },
    }),

    priceAdjustment: integer({
      label: "Price adjustment (cents)",
      defaultValue: 0,
      ui: {
        description: "Price adjustment in cents (can be negative for removals like no-cheese)",
      },
    }),

    calories: integer({
      ui: {
        description: "Calorie count for this modifier",
      },
    }),

    defaultSelected: checkbox({
      defaultValue: false,
      ui: {
        description: "Whether this modifier is selected by default",
      },
    }),

    // Relationships
    menuItem: relationship({
      ref: "MenuItem.modifiers",
      ui: {
        displayMode: "select",
      },
    }),
    ...trackingFields,
  },
});
