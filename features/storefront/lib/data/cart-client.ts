"use client";

import { gql } from "graphql-request";
import { openfrontClient } from "../config";

const CART_QUERY = gql`
  query GetCart($cartId: ID!) {
    activeCart(cartId: $cartId)
  }
`;

const getCartId = () => {
  if (typeof window === "undefined") return null;
  const rows = document.cookie.split("; ");
  const read = (name: string) => rows.find((row) => row.startsWith(`${name}=`))?.split("=")[1];
  return read("_restaurant_cart") || read("_restaurant_cart_id");
};

export async function fetchCart(cartId?: string) {
  try {
    const resolvedCartId = cartId || getCartId();
    if (!resolvedCartId) return null;

    const { activeCart } = await openfrontClient.request<{ activeCart: any }>(
      CART_QUERY,
      { cartId: resolvedCartId }
    );

    if (!activeCart) {
      if (typeof window !== "undefined") {
        document.cookie = "_restaurant_cart_id=; path=/; max-age=-1";
      document.cookie = `_restaurant_cart=; path=/; max-age=-1${window.location.protocol === "https:" ? "; samesite=none; secure; partitioned" : ""}`;
        document.cookie = `_restaurant_cart=; path=/; max-age=-1${window.location.protocol === "https:" ? "; samesite=none; secure; partitioned" : ""}`;
      }
      return null;
    }

    return activeCart;
  } catch (error) {
    console.error('Error fetching cart:', error);
    if (typeof window !== "undefined") {
      document.cookie = "_restaurant_cart_id=; path=/; max-age=-1";
      document.cookie = `_restaurant_cart=; path=/; max-age=-1${window.location.protocol === "https:" ? "; samesite=none; secure; partitioned" : ""}`;
    }
    return null;
  }
}

export async function createCart(orderType: string = "pickup") {
  const CREATE_CART_MUTATION = gql`
    mutation CreateActiveCart($orderType: String) {
      createActiveCart(orderType: $orderType) {
        id
      }
    }
  `;

  try {
    const { createActiveCart } = await openfrontClient.request<{ createActiveCart: any }>(
      CREATE_CART_MUTATION,
      { orderType }
    );
    return createActiveCart;
  } catch (error) {
    console.error('Error creating cart:', error);
    throw error;
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
    mutation AddActiveCartItem($cartId: ID!, $input: ActiveCartItemInput!) {
      addActiveCartItem(cartId: $cartId, input: $input) {
        id
      }
    }
  `;

  try {
    const { addActiveCartItem } = await openfrontClient.request<{ addActiveCartItem: any }>(
      ADD_TO_CART_MUTATION,
      {
        cartId: params.cartId,
        input: {
          menuItemId: params.menuItemId,
          quantity: params.quantity,
          modifierIds: params.modifierIds || [],
          specialInstructions: params.specialInstructions,
        },
      }
    );
    return addActiveCartItem;
  } catch (error) {
    console.error('Error adding to cart:', error);
    throw error;
  }
}

export async function updateCartItemQuantity(params: {
  cartItemId: string;
  quantity: number;
}) {
  const UPDATE_CART_ITEM_MUTATION = gql`
    mutation UpdateCartItemQuantity($cartItemId: ID!, $quantity: Int!) {
      updateCartItemQuantity(cartItemId: $cartItemId, quantity: $quantity) {
        id
      }
    }
  `;

  try {
    const { updateCartItemQuantity } = await openfrontClient.request<{ updateCartItemQuantity: any }>(
      UPDATE_CART_ITEM_MUTATION,
      {
        cartItemId: params.cartItemId,
        quantity: params.quantity,
      }
    );
    return updateCartItemQuantity;
  } catch (error) {
    console.error('Error updating cart item quantity:', error);
    throw error;
  }
}

export async function removeCartItem(cartItemId: string) {
  const REMOVE_CART_ITEM_MUTATION = gql`
    mutation RemoveCartItem($cartItemId: ID!) {
      removeCartItem(cartItemId: $cartItemId) {
        id
      }
    }
  `;

  try {
    const { removeCartItem } = await openfrontClient.request<{ removeCartItem: any }>(
      REMOVE_CART_ITEM_MUTATION,
      { cartItemId }
    );
    return removeCartItem;
  } catch (error) {
    console.error('Error removing cart item:', error);
    throw error;
  }
}
