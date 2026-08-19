import { list, graphql } from "@keystone-6/core";
import { relationship, select, text, virtual } from "@keystone-6/core/fields";
import { permissions } from "../access";
import { trackingFields } from "./trackingFields";

export const Cart = list({
  access: {
    operation: {
      query: ({ session }) =>
        permissions.canManageOrders({ session }) ||
        permissions.canReadOrders({ session }),
      create: () => false,
      update: () => false,
      delete: () => false,
    },
    filter: {
      query: ({ session }) => {
        if (!session) return false;
        if (permissions.canManageOrders({ session })) return true;
        return { user: { id: { equals: session.itemId } } };
      },
      update: ({ session }) => {
        if (!session) return false;
        if (permissions.canManageOrders({ session })) return true;
        return { user: { id: { equals: session.itemId } } };
      },
    },
  },
  fields: {
    user: relationship({ ref: "User.carts" }),
    items: relationship({ ref: "CartItem.cart", many: true }),
    orderType: select({
      options: [
        { label: "Pickup", value: "pickup" },
        { label: "Delivery", value: "delivery" },
      ],
      defaultValue: "pickup",
    }),
    email: text(),
    customerName: text(),
    customerPhone: text(),
    deliveryAddress: text(),
    deliveryAddress2: text(),
    deliveryCity: text(),
    deliveryState: text(),
    deliveryZip: text(),
    deliveryCountryCode: text(),
    paymentCollection: relationship({
      ref: "PaymentCollection.cart",
    }),
    tipPercent: select({
      options: [
        { label: "0%", value: "0" },
        { label: "15%", value: "15" },
        { label: "18%", value: "18" },
        { label: "20%", value: "20" },
        { label: "25%", value: "25" },
      ],
      defaultValue: "0",
    }),
    order: relationship({ ref: "RestaurantOrder" }),
    subtotal: virtual({
      field: graphql.field({
        type: graphql.Int,
        async resolve(item: any, args, context) {
          const cart = await context.sudo().query.Cart.findOne({
            where: { id: item.id as string },
            query: 'items { quantity menuItem { price } modifiers { priceAdjustment } }'
          });
          if (!cart?.items) return 0;
          return cart.items.reduce((total: number, cartItem: any) => {
            const modifiersTotal = cartItem.modifiers?.reduce((sum: number, mod: any) => sum + (mod.priceAdjustment || 0), 0) || 0;
            return total + ((cartItem.menuItem?.price || 0) + modifiersTotal) * cartItem.quantity;
          }, 0);
        }
      })
    }),
    ...trackingFields,
  }
});
