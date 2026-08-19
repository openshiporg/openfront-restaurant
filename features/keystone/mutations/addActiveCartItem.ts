import type { Context } from ".keystone/types";
import { assertCanAccessCart } from "../utils/cartAccess";
import { validateCartItemInput } from "../utils/cartItemValidation";

export default async function addActiveCartItem(
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
