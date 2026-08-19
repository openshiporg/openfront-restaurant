"use server";

import { gql } from "graphql-request";
import { revalidatePath, updateTag } from "next/cache";
import { openfrontClient } from "../config";
import { getAuthHeaders, getCartId, removeCartId, setCartId } from "./cookies";
import { normalizeCountryCode, normalizePostalCode } from "@/features/lib/delivery-zones";
import { createGuestUser, getUser, setExclusiveAddressFlagsForUser } from "./user";

const DEFAULT_TIP_PERCENT = "0";
const ALLOWED_TIP_PERCENTS = new Set(["0", "15", "18", "20", "25"]);

const CART_QUERY = gql`
  query GetCart($cartId: ID!) {
    activeCart(cartId: $cartId)
  }
`;

const UPDATE_ACTIVE_CART_MUTATION = gql`
  mutation UpdateActiveCart($cartId: ID!, $data: ActiveCartUpdateInput!) {
    updateActiveCart(cartId: $cartId, data: $data) {
      id
    }
  }
`;

const CREATE_ADDRESS_MUTATION = gql`
  mutation CreateAddress($data: AddressCreateInput!) {
    createAddress(data: $data) {
      id
      name
      address1
      address2
      city
      state
      postalCode
      countryCode
      country
      phone
      isDefault
      isBilling
    }
  }
`;

type CheckoutAddressInput = {
  selectedAddressId?: string | null;
  hasModifiedFields?: boolean;
  address1: string;
  address2?: string;
  city: string;
  state?: string;
  postalCode: string;
  countryCode: string;
  phone?: string;
  setAsDefault?: boolean;
  setAsBilling?: boolean;
  nameFallback?: string;
};

const getAddressName = (
  input: Pick<CheckoutAddressInput, "address1" | "city" | "nameFallback">
) => {
  const derivedName = [input.address1, input.city].filter(Boolean).join(", ").slice(0, 80);
  return derivedName || input.nameFallback || "Saved Address";
};

async function resolveCheckoutAddress(params: {
  user: any;
  cart: any;
  headers: Record<string, string>;
  input: CheckoutAddressInput;
}) {
  const { user, cart, headers, input } = params;

  const selectedAddress =
    input.selectedAddressId && !input.hasModifiedFields
      ? user.addresses?.find((address: any) => address.id === input.selectedAddressId)
      : null;

  const shouldSetBilling = Boolean(input.setAsBilling);
  const shouldSetDefault = Boolean(
    input.setAsDefault && !user.addresses?.some((address: any) => address.isDefault)
  );

  if (selectedAddress) {
    if (
      (shouldSetBilling && !selectedAddress.isBilling) ||
      (shouldSetDefault && !selectedAddress.isDefault)
    ) {
      await setExclusiveAddressFlagsForUser({
        user,
        addressId: selectedAddress.id,
        isDefault: shouldSetDefault || undefined,
        isBilling: shouldSetBilling || undefined,
      });
    }

    return {
      ...selectedAddress,
      isDefault: shouldSetDefault ? true : selectedAddress.isDefault,
      isBilling: shouldSetBilling ? true : selectedAddress.isBilling,
    };
  }

  const { createAddress } = await openfrontClient.request(
    CREATE_ADDRESS_MUTATION,
    {
      data: {
        name: getAddressName(input),
        address1: input.address1,
        address2: input.address2 || "",
        city: input.city,
        state: input.state || "",
        postalCode: input.postalCode,
        countryCode: input.countryCode,
        country: input.countryCode,
        phone: input.phone || cart.customerPhone || user.phone || "",
        isDefault: shouldSetDefault,
        isBilling: shouldSetBilling,
        user: { connect: { id: user.id } },
      },
    },
    headers
  );

  if (createAddress?.id && (shouldSetDefault || shouldSetBilling)) {
    await setExclusiveAddressFlagsForUser({
      user,
      addressId: createAddress.id,
      isDefault: shouldSetDefault || undefined,
      isBilling: shouldSetBilling || undefined,
    });
  }

  return createAddress;
}

export async function retrieveCart() {
  const cartId = await getCartId();
  if (!cartId) return null;
  const headers = await getAuthHeaders();

  const { activeCart } = await openfrontClient.request(
    CART_QUERY,
    { cartId },
    headers
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

async function getOrSetCart(orderType: string = "pickup") {
  let cartId = await getCartId();
  let cart = null;
  const headers = await getAuthHeaders();

  if (cartId) {
    try {
      const { activeCart } = await openfrontClient.request(CART_QUERY, { cartId }, headers);
      cart = activeCart;

      if (!cart) {
        await removeCartId();
        cartId = undefined;
      }
    } catch (error) {
      console.error("Error retrieving cart:", error);
      await removeCartId();
      cartId = undefined;
    }
  }

  if (!cart) {
    const { createActiveCart: newCart } = await openfrontClient.request(
      gql`
        mutation CreateActiveCart($orderType: String) {
          createActiveCart(orderType: $orderType) {
            id
            orderType
          }
        }
      `,
      { orderType },
      headers
    );

    cart = newCart;
    await setCartId(cart.id);
    updateTag("cart");
  }

  return cart;
}

export async function createCart(orderType: string = "pickup") {
  const CREATE_CART_MUTATION = gql`
    mutation CreateActiveCart($orderType: String) {
      createActiveCart(orderType: $orderType) {
        id
      }
    }
  `;

  const headers = await getAuthHeaders();
  const { createActiveCart } = await openfrontClient.request(
    CREATE_CART_MUTATION,
    { orderType },
    headers
  );

  return createActiveCart;
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
      UPDATE_ACTIVE_CART_MUTATION,
      {
        cartId,
        data: {
          email: data.email,
          customerName: data.customerName,
          customerPhone: data.customerPhone,
          orderType: data.orderType,
          userId: data.userId || undefined,
        },
      },
      await getAuthHeaders()
    );

    updateTag("cart");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not update checkout contact";
    return { success: false, message };
  }
}

export async function submitCheckoutContact(data: {
  email: string;
  customerName: string;
  customerPhone: string;
  orderType: string;
}) {
  const cartId = await getCartId();
  if (!cartId) return { success: false, message: "No cartId cookie found" };

  try {
    let user = await getUser();

    if (!user) {
      const guestResult = await createGuestUser({
        email: data.email,
        name: data.customerName,
        phone: data.customerPhone,
      });

      if (!guestResult.success || !guestResult.userId) {
        return {
          success: false,
          message:
            guestResult.error ||
            "We couldn't create your customer account for checkout. Please try again.",
        };
      }

      user = {
        id: guestResult.userId,
      };
    }

    const authHeaders = await getAuthHeaders();

    await openfrontClient.request(
      UPDATE_ACTIVE_CART_MUTATION,
      {
        cartId,
        data: {
          email: data.email,
          customerName: data.customerName,
          customerPhone: data.customerPhone,
          orderType: data.orderType,
          userId: user?.id || undefined,
        },
      },
      authHeaders
    );

    updateTag("cart");
    updateTag("customer");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not update checkout contact";
    return { success: false, message };
  }
}

export async function setCheckoutDelivery(data: {
  selectedAddressId?: string | null;
  hasModifiedFields?: boolean;
  deliveryAddress?: string;
  deliveryAddress2?: string;
  deliveryCity?: string;
  deliveryState?: string;
  deliveryZip?: string;
  deliveryCountryCode?: string;
  billingSameAsDelivery?: boolean;
  selectedBillingAddressId?: string | null;
  hasModifiedBillingFields?: boolean;
  billingAddress?: string;
  billingAddress2?: string;
  billingCity?: string;
  billingState?: string;
  billingZip?: string;
  billingCountryCode?: string;
}) {
  const cartId = await getCartId();
  if (!cartId) return { success: false, message: "No cartId cookie found" };

  const cart = await fetchCart(cartId);
  if (!cart) {
    return { success: false, message: "Cart not found" };
  }

  if ((cart.orderType || "pickup") !== "delivery") {
    updateTag("cart");
    return { success: true };
  }

  const deliveryAddress = data.deliveryAddress?.trim()
  const deliveryAddress2 = data.deliveryAddress2?.trim() || ""
  const deliveryCity = data.deliveryCity?.trim()
  const deliveryState = data.deliveryState?.trim() || ""
  const deliveryZip = normalizePostalCode(data.deliveryZip)
  const deliveryCountryCode = normalizeCountryCode(data.deliveryCountryCode)
  const billingSameAsDelivery = data.billingSameAsDelivery !== false
  const billingAddress = data.billingAddress?.trim()
  const billingAddress2 = data.billingAddress2?.trim() || ""
  const billingCity = data.billingCity?.trim()
  const billingState = data.billingState?.trim() || ""
  const billingZip = normalizePostalCode(data.billingZip)
  const billingCountryCode = normalizeCountryCode(data.billingCountryCode)

  if (!deliveryAddress || !deliveryCity || !deliveryZip || !deliveryCountryCode) {
    return {
      success: false,
      message: "Delivery address is incomplete. Add street address, city, postal code, and country code.",
    };
  }

  if (
    !billingSameAsDelivery &&
    (!billingAddress || !billingCity || !billingZip || !billingCountryCode)
  ) {
    return {
      success: false,
      message: "Billing address is incomplete. Add street address, city, postal code, and country code.",
    };
  }

  try {
    let user = await getUser()
    const headers = await getAuthHeaders()

    if (!user) {
      const guestResult = await createGuestUser({
        email: cart.email || "",
        name: cart.customerName || "Guest Customer",
        phone: cart.customerPhone || undefined,
      })

      if (!guestResult.success || !guestResult.userId) {
        return {
          success: false,
          message:
            guestResult.error ||
            "We couldn't create your customer account for checkout. Please return to the contact step and try again.",
        }
      }

      user = {
        id: guestResult.userId,
        email: cart.email,
        phone: cart.customerPhone,
        addresses: [],
        billingAddress: null,
      }
    }

    const addressForCart = await resolveCheckoutAddress({
      user,
      cart,
      headers,
      input: {
        selectedAddressId: data.selectedAddressId,
        hasModifiedFields: data.hasModifiedFields,
        address1: deliveryAddress,
        address2: deliveryAddress2,
        city: deliveryCity,
        state: deliveryState,
        postalCode: deliveryZip,
        countryCode: deliveryCountryCode,
        setAsDefault: true,
        setAsBilling: billingSameAsDelivery,
        nameFallback: "Delivery Address",
      },
    })

    if (!billingSameAsDelivery) {
      await resolveCheckoutAddress({
        user,
        cart,
        headers,
        input: {
          selectedAddressId: data.selectedBillingAddressId,
          hasModifiedFields: data.hasModifiedBillingFields,
          address1: billingAddress!,
          address2: billingAddress2,
          city: billingCity!,
          state: billingState,
          postalCode: billingZip!,
          countryCode: billingCountryCode!,
          setAsBilling: true,
          nameFallback: "Billing Address",
        },
      })
    }

    await openfrontClient.request(
      UPDATE_ACTIVE_CART_MUTATION,
      {
        cartId,
        data: {
          userId: user?.id || undefined,
          deliveryAddress: addressForCart?.address1 || deliveryAddress,
          deliveryAddress2: addressForCart?.address2 || deliveryAddress2,
          deliveryCity: addressForCart?.city || deliveryCity,
          deliveryState: addressForCart?.state || deliveryState,
          deliveryZip: normalizePostalCode(addressForCart?.postalCode || deliveryZip),
          deliveryCountryCode: normalizeCountryCode(
            addressForCart?.countryCode || addressForCart?.country || deliveryCountryCode
          ),
        },
      },
      headers
    );

    updateTag("cart");
    updateTag("customer");
    revalidatePath("/account");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not update checkout delivery";
    return { success: false, message };
  }
}

export async function setCheckoutTip(tipPercent: string) {
  const cartId = await getCartId();
  if (!cartId) return { success: false, message: "No cartId cookie found" };

  const nextTipPercent = ALLOWED_TIP_PERCENTS.has(tipPercent)
    ? tipPercent
    : DEFAULT_TIP_PERCENT;

  try {
    await openfrontClient.request(
      UPDATE_ACTIVE_CART_MUTATION,
      {
        cartId,
        data: {
          tipPercent: nextTipPercent,
        },
      },
      await getAuthHeaders()
    );

    updateTag("cart");
    revalidatePath("/checkout");
    return { success: true, tipPercent: nextTipPercent };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not update checkout tip";
    return { success: false, message };
  }
}

export async function addToCart(params: {
  menuItemId: string;
  quantity: number;
  modifierIds?: string[];
  specialInstructions?: string;
  orderType?: string;
}) {
  const ADD_TO_CART_MUTATION = gql`
    mutation AddActiveCartItem($cartId: ID!, $input: ActiveCartItemInput!) {
      addActiveCartItem(cartId: $cartId, input: $input) {
        id
      }
    }
  `;

  const cart = await getOrSetCart(params.orderType || "pickup");
  if (!cart?.id) {
    throw new Error("Error retrieving or creating cart");
  }

  const headers = {
    ...(await getAuthHeaders()),
    cookie: `_restaurant_cart_id=${cart.id}`,
  };

  const { addActiveCartItem } = await openfrontClient.request(
    ADD_TO_CART_MUTATION,
    {
      cartId: cart.id,
      input: {
        menuItemId: params.menuItemId,
        quantity: params.quantity,
        modifierIds: params.modifierIds || [],
        specialInstructions: params.specialInstructions,
      },
    },
    headers
  );

  updateTag("cart");
  return addActiveCartItem;
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

  updateTag("cart");
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

  updateTag("cart");
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
    updateTag("cart");

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
