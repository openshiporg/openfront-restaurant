import { cartMutationTransaction, touchMutableCart } from "../utils/cartMutationTransaction";
import { Context } from ".keystone/types";
import { assertCanAccessCartItem } from "../utils/cartAccess";

async function removeCartItem(
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
  await touchMutableCart(context, cartId);

  await sudoContext.db.CartItem.deleteOne({
    where: { id: cartItemId }
  });

  // Return the updated cart
  return await sudoContext.db.Cart.findOne({
    where: { id: cartId }
  });
}

export default function removeCartItemTransactional(...args: Parameters<typeof removeCartItem>) {
  return cartMutationTransaction(args[2], (tx) => removeCartItem(args[0], args[1], tx));
}
