import { list } from "@keystone-6/core";
import {
  text,
  select,
  decimal,
  relationship,
  timestamp,
} from "@keystone-6/core/fields";

import { permissions } from "../access";
import { trackingFields } from "./trackingFields";

export const Ingredient = list({
  access: {
    operation: {
      query: permissions.canReadInventory,
      create: permissions.canManageInventory,
      update: permissions.canManageInventory,
      delete: permissions.canManageInventory,
    },
  },
  ui: {
    listView: {
      initialColumns: ["name", "category", "currentStock", "unit", "parLevel"],
    },
  },
  fields: {
    name: text({
      validation: { isRequired: true },
      ui: {
        description: "Ingredient name",
      },
    }),

    unit: select({
      type: "string",
      options: [
        { label: "Kilogram", value: "kg" },
        { label: "Pound", value: "lb" },
        { label: "Ounce", value: "oz" },
        { label: "Liter", value: "liter" },
        { label: "Gallon", value: "gallon" },
        { label: "Each", value: "each" },
        { label: "Case", value: "case" },
        { label: "Box", value: "box" },
      ],
      defaultValue: "lb",
      validation: { isRequired: true },
      ui: {
        description: "Unit of measurement",
      },
    }),

    category: select({
      type: "string",
      options: [
        { label: "Produce", value: "produce" },
        { label: "Meat", value: "meat" },
        { label: "Dairy", value: "dairy" },
        { label: "Dry Goods", value: "dry_goods" },
        { label: "Beverages", value: "beverages" },
        { label: "Spices", value: "spices" },
        { label: "Seafood", value: "seafood" },
        { label: "Other", value: "other" },
      ],
      ui: {
        description: "Ingredient category",
      },
    }),

    currentStock: decimal({
      access: { create: () => false, update: () => false },
      precision: 10,
      scale: 2,
      defaultValue: "0.00",
      validation: { isRequired: true },
      ui: {
        description: "Current stock quantity",
      },
    }),

    parLevel: decimal({
      precision: 10,
      scale: 2,
      ui: {
        description: "Ideal stock level to maintain",
      },
    }),

    reorderPoint: decimal({
      precision: 10,
      scale: 2,
      ui: {
        description: "Stock level at which to reorder",
      },
    }),

    reorderQuantity: decimal({
      precision: 10,
      scale: 2,
      ui: {
        description: "Quantity to order when restocking",
      },
    }),

    costPerUnit: decimal({
      precision: 10,
      scale: 2,
      ui: {
        description: "Cost per unit in dollars",
      },
    }),

    expirationDate: timestamp({
      ui: {
        description: "Expiration date for perishable items",
      },
    }),

    sku: text({
      ui: {
        description: "SKU or product code",
      },
    }),

    // Relationships
    vendor: relationship({
      ref: "Vendor.ingredients",
      ui: {
        displayMode: "select",
        description: "Primary vendor for this ingredient",
      },
    }),

    location: relationship({
      ref: "InventoryLocation.ingredients",
      ui: {
        displayMode: "select",
        description: "Storage location",
      },
    }),

    stockMovements: relationship({
      ref: "StockMovement.ingredient",
      many: true,
    }),
    ...trackingFields,
  },
});
