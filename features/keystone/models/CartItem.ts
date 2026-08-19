import { graphql, list } from "@keystone-6/core";
import { relationship, integer, text, virtual } from "@keystone-6/core/fields";
import { permissions } from "../access";
import { trackingFields } from "./trackingFields";

export const CartItem = list({
  access: {
    operation: {
      query: ({ session }) =>
        permissions.canManageCart({ session }) || permissions.canReadCart({ session }),
      create: () => false,
      update: () => false,
      delete: () => false,
    },
  },
  fields: {
    cart: relationship({ ref: "Cart.items" }),
    menuItem: relationship({ ref: "MenuItem" }),
    quantity: integer({ defaultValue: 1, validation: { min: 1 } }),
    modifiers: relationship({ ref: "MenuItemModifier", many: true }),
    specialInstructions: text(),
    thumbnail: virtual({
      field: graphql.field({
        type: graphql.String,
        async resolve(item, args, context) {
          const sudoContext = context.sudo();
          const cartItem = await sudoContext.query.CartItem.findOne({
            where: { id: String(item.id) },
            query: `
              menuItem {
                thumbnail
              }
            `,
          });

          return cartItem?.menuItem?.thumbnail || null;
        },
      }),
    }),
    ...trackingFields,
  }
});
