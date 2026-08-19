import { Context } from ".keystone/types";
import { assertCanAccessCartItem } from "../utils/cartAccess";

export default async function removeCartItem(
  root: any, 
  { cartItemId }: { cartItemId: string }, 
  context: Context
) {
  const sudoContext = context.sudo();

  const cartItem = await assertCanAccessCartItem(context, cartItemId, "write");
  const cartId = cartItem.cart.id;
  const cart = await sudoContext.query.Cart.findOne({
    where: { id: cartId },
    query: "id order { id }",
  });
  if (cart?.order?.id) throw new Error("Completed carts cannot be changed");

  await sudoContext.db.CartItem.deleteOne({
    where: { id: cartItemId }
  });

  // Return the updated cart
  return await sudoContext.db.Cart.findOne({
    where: { id: cartId }
  });
}
