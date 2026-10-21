import { cartMutationTransaction, touchMutableCart } from "../utils/cartMutationTransaction";
import type { Context } from ".keystone/types";
import { assertCanAccessCart } from "../utils/cartAccess";
import { validateCartItemInput } from "../utils/cartItemValidation";

async function addActiveCartItem(
  _root: unknown,
  {
    cartId,
    input,
  }: {
    cartId: string;
    input: {
      menuItemId: string;
      quantity: number;
      modifierIds?: string[] | null;
      specialInstructions?: string | null;
    };
  },
  context: Context
) {
  await assertCanAccessCart(context, cartId, "write");
  const sudo = context.sudo();
  const cart = await sudo.query.Cart.findOne({
    where: { id: cartId },
    query: "id order { id }",
  });
  if (cart?.order?.id) throw new Error("Completed carts cannot be changed");
  await touchMutableCart(context, cartId);
  const validated = await validateCartItemInput(context, input);

  await sudo.query.CartItem.createOne({
    data: {
      cart: { connect: { id: cartId } },
      menuItem: { connect: { id: validated.menuItem.id } },
      quantity: validated.quantity,
      modifiers: validated.modifiers.length
        ? { connect: validated.modifiers.map((modifier) => ({ id: modifier.id })) }
        : undefined,
      specialInstructions: validated.specialInstructions,
    },
    query: "id",
  });

  return sudo.db.Cart.findOne({ where: { id: cartId } });
}

export default function addActiveCartItemTransactional(...args: Parameters<typeof addActiveCartItem>) {
  return cartMutationTransaction(args[2], (tx) => addActiveCartItem(args[0], args[1], tx));
}
