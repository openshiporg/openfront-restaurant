"use server";

import { gql } from "graphql-request";
import { revalidateTag } from "next/cache";
import { openfrontClient } from "../config";
import { getAuthHeaders, getCartId, removeCartId } from "./cookies";

const CART_QUERY = gql`
  query GetCart($cartId: ID!) {
    activeCart(cartId: $cartId)
  }
`;

export async function retrieveCart() {
  const cartId = await getCartId();
  if (!cartId) return null;

  const { activeCart } = await openfrontClient.request(
    CART_QUERY,
    { cartId },
    {}
  );

  if (!activeCart) return null;

  return activeCart;
}

export async function fetchCart(cartId?: string) {
  if (!cartId) return null;
  const headers = await getAuthHeaders();
  const { activeCart } = await openfrontClient.request(CART_QUERY, { cartId }, headers);
  return activeCart;
}

export async function createCart(orderType: string = "pickup") {
  const CREATE_CART_MUTATION = gql`
    mutation CreateCart($data: CartCreateInput!) {
      createCart(data: $data) {
        id
      }
    }
  `;

  const headers = await getAuthHeaders();
  const { createCart } = await openfrontClient.request(
    CREATE_CART_MUTATION,
    {
      data: { orderType }
    },
    headers
  );

  return createCart;
}

export async function setCheckoutContact(data: {
  email: string;
  customerName: string;
  customerPhone: string;
  orderType: string;
  userId?: string | null;
}) {
  const cartId = await getCartId();
  if (!cartId) return { success: false, message: "No cartId cookie found" };

  try {
    await openfrontClient.request(
      gql`
        mutation UpdateActiveCart($cartId: ID!, $data: CartUpdateInput!) {
          updateActiveCart(cartId: $cartId, data: $data) {
            id
          }
        }
      `,
      {
        cartId,
        data: {
          email: data.email,
          customerName: data.customerName,
          customerPhone: data.customerPhone,
          orderType: data.orderType,
          user: data.userId ? { connect: { id: data.userId } } : undefined,
        },
      },
      await getAuthHeaders()
    );

    (revalidateTag as any)("cart");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not update checkout contact";
    return { success: false, message };
  }
}

export async function setCheckoutDelivery(data: {
  deliveryAddress?: string;
  deliveryCity?: string;
  deliveryZip?: string;
}) {
  const cartId = await getCartId();
  if (!cartId) return { success: false, message: "No cartId cookie found" };

  try {
    await openfrontClient.request(
      gql`
        mutation UpdateActiveCart($cartId: ID!, $data: CartUpdateInput!) {
          updateActiveCart(cartId: $cartId, data: $data) {
            id
          }
        }
      `,
      {
        cartId,
        data: {
          deliveryAddress: data.deliveryAddress,
          deliveryCity: data.deliveryCity,
          deliveryZip: data.deliveryZip,
        },
      },
      await getAuthHeaders()
    );

    (revalidateTag as any)("cart");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not update checkout delivery";
    return { success: false, message };
  }
}

export async function addToCart(params: {
  cartId: string;
  menuItemId: string;
  quantity: number;
  modifierIds?: string[];
  specialInstructions?: string;
}) {
  const ADD_TO_CART_MUTATION = gql`
    mutation AddToCart($cartId: ID!, $data: CartUpdateInput!) {
      updateActiveCart(cartId: $cartId, data: $data) {
        id
      }
    }
  `;

  const headers = await getAuthHeaders();
  const { updateActiveCart } = await openfrontClient.request(
    ADD_TO_CART_MUTATION,
    {
      cartId: params.cartId,
      data: {
        items: {
          create: [
            {
              menuItem: { connect: { id: params.menuItemId } },
              quantity: params.quantity,
              modifiers: params.modifierIds ? { connect: params.modifierIds.map((id: string) => ({ id })) } : undefined,
              specialInstructions: params.specialInstructions,
            },
          ],
        },
      },
    },
    headers
  );
  return updateActiveCart;
}

export async function updateLineItem(params: {
  cartId: string;
  lineId: string;
  quantity: number;
}) {
  const UPDATE_LINE_ITEM_MUTATION = gql`
    mutation UpdateCartItemQuantity($cartItemId: ID!, $quantity: Int!) {
      updateCartItemQuantity(cartItemId: $cartItemId, quantity: $quantity) {
        id
      }
    }
  `;

  const headers = await getAuthHeaders();
  const { updateCartItemQuantity } = await openfrontClient.request(
    UPDATE_LINE_ITEM_MUTATION,
    {
      cartItemId: params.lineId,
      quantity: params.quantity,
    },
    headers
  );
  return updateCartItemQuantity;
}

export async function removeLineItem(params: {
  cartId: string;
  lineId: string;
}) {
  const REMOVE_LINE_ITEM_MUTATION = gql`
    mutation RemoveCartItem($cartItemId: ID!) {
      removeCartItem(cartItemId: $cartItemId) {
        id
      }
    }
  `;

  const headers = await getAuthHeaders();
  const { removeCartItem } = await openfrontClient.request(
    REMOVE_LINE_ITEM_MUTATION,
    {
      cartItemId: params.lineId,
    },
    headers
  );
  return removeCartItem;
}

export async function updateCartItemQuantity(params: { cartItemId: string; quantity: number }) {
  return updateLineItem({ cartId: "", lineId: params.cartItemId, quantity: params.quantity });
}

export async function removeCartItem(cartItemId: string) {
  return removeLineItem({ cartId: "", lineId: cartItemId });
}

export async function placeOrder(paymentSessionId?: string) {
  const cartId = await getCartId();
  if (!cartId) throw new Error("No cartId cookie found");

  const headers = await getAuthHeaders();
  const { completeActiveCart } = await openfrontClient.request(
    gql`
      mutation CompleteActiveCart($cartId: ID!, $paymentSessionId: ID) {
        completeActiveCart(cartId: $cartId, paymentSessionId: $paymentSessionId) {
          id
          orderNumber
          secretKey
          status
        }
      }
    `,
    {
      cartId,
      paymentSessionId,
    },
    headers
  );

  if (completeActiveCart?.id) {
    await removeCartId();
    (revalidateTag as any)("cart");

    const secretKeyParam = completeActiveCart.secretKey
      ? `?secretKey=${completeActiveCart.secretKey}`
      : "";

    return {
      success: true,
      redirectTo: `/order/confirmed/${completeActiveCart.id}${secretKeyParam}`,
    };
  }

  return completeActiveCart;
}
