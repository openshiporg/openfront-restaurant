import { graphql, list } from "@keystone-6/core";
import {
  text,
  relationship,
  multiselect,
  integer,
  select,
  checkbox,
  virtual
} from "@keystone-6/core/fields";
import { document } from "@keystone-6/fields-document";

import { permissions } from "../access";
import { trackingFields } from "./trackingFields";

export const MenuItem = list({
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
      initialColumns: ["name", "price", "category", "available", "kitchenStation"],
    },
  },
  fields: {
    name: text({
      validation: { isRequired: true },
    }),

    thumbnail: virtual({
      field: graphql.field({
        type: graphql.String,
        resolve: async (item, args, context) => {
          const menuItem = await context.query.MenuItem.findOne({
            where: { id: String(item.id) },
            query: "menuItemImages(take: 1) { image { url } imagePath }",
          });

          const imageUrl = menuItem?.menuItemImages?.[0]?.image?.url;
          if (imageUrl) {
            return imageUrl;
          }

          const imagePath = menuItem?.menuItemImages?.[0]?.imagePath;
          if (!imagePath) {
            return null;
          }

          if (
            imagePath.startsWith("http://") ||
            imagePath.startsWith("https://") ||
            imagePath.startsWith("data:") ||
            imagePath.startsWith("blob:") ||
            imagePath.startsWith("/images/")
          ) {
            return imagePath;
          }

          return imagePath.startsWith("/") ? `/images${imagePath}` : `/images/${imagePath}`;
        },
      }),
    }),

    menuItemImages: relationship({
      ref: "MenuItemImage.menuItems",
      many: true,
      ui: {
        displayMode: "cards",
        cardFields: ["image", "altText", "imagePath"],
        inlineCreate: { fields: ["image", "altText", "imagePath"] },
        inlineEdit: { fields: ["image", "altText", "imagePath"] },
        inlineConnect: true,
        removeMode: "disconnect",
        linkToItem: false,
      },
    }),

    description: document({
      formatting: true,
      links: true,
    }),

    price: integer({
      validation: { isRequired: true, min: 0 },
      ui: {
        description: "Price in cents",
      },
    }),

    available: checkbox({
      defaultValue: true,
    }),

    featured: checkbox({
      defaultValue: false,
      ui: {
        description: "Highlight this item on the storefront",
      },
    }),

    popular: checkbox({
      defaultValue: false,
      ui: {
        description: "Mark as popular item (shows 'Popular' badge)",
      },
    }),

    prepTime: integer({
      defaultValue: 15,
      ui: {
        description: "Preparation time in minutes",
      },
    }),

    calories: integer({
      ui: {
        description: "Calorie count for this menu item",
      },
    }),

    kitchenStation: select({
      type: "string",
      options: [
        { label: "Grill", value: "grill" },
        { label: "Fryer", value: "fryer" },
        { label: "Salad", value: "salad" },
        { label: "Dessert", value: "dessert" },
        { label: "Bar", value: "bar" },
        { label: "Expo", value: "expo" },
      ],
      defaultValue: "grill",
    }),

    allergens: multiselect({
      type: "string",
      options: [
        { label: "Gluten", value: "gluten" },
        { label: "Dairy", value: "dairy" },
        { label: "Eggs", value: "eggs" },
        { label: "Nuts", value: "nuts" },
        { label: "Shellfish", value: "shellfish" },
        { label: "Soy", value: "soy" },
        { label: "Fish", value: "fish" },
      ],
      defaultValue: [],
    }),

    dietaryFlags: multiselect({
      type: "string",
      options: [
        { label: "Vegan", value: "vegan" },
        { label: "Vegetarian", value: "vegetarian" },
        { label: "Gluten-Free", value: "gluten_free" },
        { label: "Dairy-Free", value: "dairy_free" },
        { label: "Keto", value: "keto" },
      ],
      defaultValue: [],
    }),

    mealPeriods: multiselect({
      type: "string",
      options: [
        { label: "Breakfast", value: "breakfast" },
        { label: "Lunch", value: "lunch" },
        { label: "Dinner", value: "dinner" },
        { label: "All Day", value: "all_day" },
      ],
      defaultValue: ["all_day"],
    }),

    // Relationships
    category: relationship({
      ref: "MenuCategory.menuItems",
      ui: {
        displayMode: "select",
      },
    }),

    modifiers: relationship({
      ref: "MenuItemModifier.menuItem",
      many: true,
      ui: {
        displayMode: "cards",
        cardFields: ["name", "priceAdjustment", "modifierGroup"],
        inlineCreate: { fields: ["name", "priceAdjustment", "modifierGroup"] },
        inlineEdit: { fields: ["name", "priceAdjustment", "modifierGroup"] },
      },
    }),
    ...trackingFields,
  },
});
