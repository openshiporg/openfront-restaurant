import { stockQuantity } from "../../lib/stock-units";
import { list, graphql } from "@keystone-6/core";
import {
  text,
  relationship,
  integer,
  decimal,
  json,
  virtual
} from "@keystone-6/core/fields";

import { isSignedIn, permissions } from "../access";
import { trackingFields } from "./trackingFields";

export const Recipe = list({
  access: {
    operation: {
      query: (args) => permissions.canReadProducts(args) || permissions.canManageProducts(args) || permissions.canReadInventory(args) || permissions.canManageInventory(args),
      create: (args) => permissions.canManageProducts(args) || permissions.canManageInventory(args),
      update: (args) => permissions.canManageProducts(args) || permissions.canManageInventory(args),
      delete: (args) => permissions.canManageProducts(args) || permissions.canManageInventory(args),
    },
  },
  ui: {
    listView: {
      initialColumns: ["name", "menuItem", "yield", "totalCost"],
    },
    labelField: "name",
  },
  fields: {
    name: text({ validation: { isRequired: true } }),
    
    menuItem: relationship({
      ref: 'MenuItem',
      many: false,
    }),

    recipeIngredients: json({
      ui: {
        description: 'Array of { ingredientId: string, quantity: number, unit: string }',
      },
    }),

    yield: integer({
      defaultValue: 1,
      ui: { description: 'Number of servings this recipe produces' },
    }),

    prepTime: integer({
      ui: { description: 'Preparation time in minutes' },
    }),

    instructions: text({
      ui: { displayMode: 'textarea' },
    }),

    totalCost: virtual({
      field: graphql.field({
        type: graphql.Float,
        async resolve(item, args, context) {
          if (!item.recipeIngredients) return 0;
          const ingredients = item.recipeIngredients as any[];
          let total = 0;
          for (const ri of ingredients) {
            if (!ri.ingredientId) continue;
            const ingredient = await context.sudo().query.Ingredient.findOne({
              where: { id: ri.ingredientId },
              query: 'costPerUnit unit'
            });
            if (ingredient?.costPerUnit) {
              total += parseFloat(ingredient.costPerUnit) * stockQuantity(ri.quantity, ri.unit, ingredient.unit || ri.unit || "each");
            }
          }
          return total;
        }
      })
    }),

    costPerServing: virtual({
      field: graphql.field({
        type: graphql.Float,
        async resolve(item, args, context) {
          if (!item.recipeIngredients) return 0;
          const ingredients = item.recipeIngredients as any[];
          let total = 0;
          for (const ri of ingredients) {
            if (!ri.ingredientId) continue;
            const ingredient = await context.sudo().query.Ingredient.findOne({
              where: { id: ri.ingredientId },
              query: 'costPerUnit unit'
            });
            if (ingredient?.costPerUnit) {
              total += parseFloat(ingredient.costPerUnit) * stockQuantity(ri.quantity, ri.unit, ingredient.unit || ri.unit || "each");
            }
          }
          return total / ((item as any).yield || 1);
        }
      })
    }),

    foodCostPercentage: virtual({
      field: graphql.field({
        type: graphql.Float,
        async resolve(item: any, args, context) {
          if (!item.menuItemId) return 0;
          const menuItem = await context.sudo().query.MenuItem.findOne({
            where: { id: item.menuItemId as string },
            query: 'price'
          });
          if (!menuItem?.price || parseFloat(menuItem.price) === 0) return 0;
          
          if (!item.recipeIngredients) return 0;
          const ingredients = item.recipeIngredients as any[];
          let total = 0;
          for (const ri of ingredients) {
            if (!ri.ingredientId) continue;
            const ingredient = await context.sudo().query.Ingredient.findOne({
              where: { id: ri.ingredientId },
              query: 'costPerUnit unit'
            });
            if (ingredient?.costPerUnit) {
              total += parseFloat(ingredient.costPerUnit) * stockQuantity(ri.quantity, ri.unit, ingredient.unit || ri.unit || "each");
            }
          }
          const costPerServing = total / (item.yield || 1);
          const settings = await context.sudo().query.StoreSettings.findOne({ where: { id: "1" }, query: "currencyCode" });
          const digits = new Intl.NumberFormat("en", { style: "currency", currency: settings?.currencyCode || "USD" }).resolvedOptions().maximumFractionDigits;
          const menuPriceMajor = Number(menuItem.price) / 10 ** (digits ?? 2);
          return (costPerServing / menuPriceMajor) * 100;
        }
      })
    }),

    ...trackingFields,
  },
});
