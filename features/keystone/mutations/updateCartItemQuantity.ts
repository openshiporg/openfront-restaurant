import { Context } from ".keystone/types";
import { assertCanAccessCartItem } from "../utils/cartAccess";
import { normalizeCartQuantity } from "../utils/cartItemValidation";

export default async function updateCartItemQuantity(
  root: any, 
  { cartItemId, quantity }: { cartItemId: string, quantity: number }, 
  context: Context
) {
  const sudoContext = context.sudo();
  const cartItem = await assertCanAccessCartItem(context, cartItemId, "write");
  const cart = await sudoContext.query.Cart.findOne({
    where: { id: cartItem.cart.id },
    query: "id order { id }",
  });
  if (cart?.order?.id) throw new Error("Completed carts cannot be changed");

  await sudoContext.db.CartItem.updateOne({
    where: { id: cartItemId },
    data: { quantity: normalizeCartQuantity(quantity) }
  });

  // Return the updated cart
  return await sudoContext.db.Cart.findOne({
    where: { id: cartItem.cart.id }
  });
}
