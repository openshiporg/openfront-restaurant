"use server";

import { revalidateTag, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { gql } from "graphql-request";
import { openfrontClient } from "@/features/storefront/lib/config";
import { getAuthHeaders, setAuthToken, removeAuthToken } from "./cookies";
import { normalizeCountryCode, normalizePostalCode } from "@/features/lib/delivery-zones";

export async function getUser() {
  try {
    const headers = await getAuthHeaders();
    const { authenticatedItem } = await openfrontClient.request(
      gql`
        query GetAuthenticatedItem {
          authenticatedItem {
            ... on User {
              id
              email
              name
              firstName
              lastName
              phone
              createdAt
              billingAddress {
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
              addresses {
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
          }
        }
      `,
      {},
      headers
    );

    return authenticatedItem;
  } catch (error) {
    console.error("Error fetching user:", error);
    return null;
  }
}

async function updateAddressFlags(
  addressId: string,
  data: { isDefault?: boolean; isBilling?: boolean },
  headers: Record<string, string>
) {
  return openfrontClient.request(
    gql`
      mutation UpdateAddressFlags($id: ID!, $data: AddressUpdateInput!) {
        updateAddress(where: { id: $id }, data: $data) {
          id
          isDefault
          isBilling
        }
      }
    `,
    {
      id: addressId,
      data,
    },
    headers
  )
}

export async function setExclusiveAddressFlagsForUser(params: {
  user: any
  addressId: string
  isDefault?: boolean
  isBilling?: boolean
}) {
  if (!params.user?.id || !params.addressId) {
    return
  }

  const headers = await getAuthHeaders()
  const pendingUpdates = params.user.addresses
    ?.map((address: any) => {
      const nextData: { isDefault?: boolean; isBilling?: boolean } = {}

      if (address.id === params.addressId) {
        if (typeof params.isDefault === "boolean" && address.isDefault !== params.isDefault) {
          nextData.isDefault = params.isDefault
        }

        if (typeof params.isBilling === "boolean" && address.isBilling !== params.isBilling) {
          nextData.isBilling = params.isBilling
        }
      } else {
        if (params.isDefault && address.isDefault) {
          nextData.isDefault = false
        }

        if (params.isBilling && address.isBilling) {
          nextData.isBilling = false
        }
      }

      if (!Object.keys(nextData).length) {
        return null
      }

      return updateAddressFlags(address.id, nextData, headers)
    })
    .filter(Boolean)

  if (pendingUpdates?.length) {
    await Promise.all(pendingUpdates)
  }

  revalidatePath("/account")
  ;(revalidateTag as any)("customer")
}

function getNormalizedAddressData(formData: FormData) {
  const countryCode = normalizeCountryCode(formData.get("countryCode") as string)
  const postalCode = normalizePostalCode(formData.get("postalCode") as string)

  return {
    name: formData.get("name") as string,
    address1: formData.get("address1") as string,
    address2: formData.get("address2") as string,
    city: formData.get("city") as string,
    state: formData.get("state") as string,
    postalCode,
    countryCode,
    country: countryCode,
    phone: formData.get("phone") as string,
    isDefault: formData.get("isDefault") === "on",
    isBilling: formData.get("isBilling") === "on",
  }
}

export async function login(_currentState: any, formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  try {
    const result = await openfrontClient.request(
      gql`
        mutation AuthenticateUser($email: String!, $password: String!) {
          authenticateUserWithPassword(email: $email, password: $password) {
            ... on UserAuthenticationWithPasswordSuccess {
              sessionToken
              item {
                id
                email
              }
            }
            ... on UserAuthenticationWithPasswordFailure {
              message
            }
          }
        }
      `,
      { email, password }
    );

    const auth = result.authenticateUserWithPassword;

    if (auth.message) {
      return auth.message;
    }

    if (auth.sessionToken) {
      await setAuthToken(auth.sessionToken);
      (revalidatePath as any)("/");
      (revalidateTag as any)("customer");
      return null; // Success
    }

    return "An unexpected error occurred";
  } catch (error) {
    console.error("Login error:", error);
    return error instanceof Error ? error.message : "An unexpected error occurred";
  }
}

export async function signUp(_currentState: any, formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const name = formData.get("name") as string;
  const phone = formData.get("phone") as string;

  try {
    // First create the user
    const { createUser } = await openfrontClient.request(
      gql`
        mutation CreateUser($data: UserCreateInput!) {
          createUser(data: $data) {
            id
            email
          }
        }
      `,
      {
        data: { email, password, name, phone, hasAccount: true }
      }
    );

    if (!createUser?.id) {
      return "Failed to create account";
    }

    // Then authenticate them
    const { authenticateUserWithPassword } = await openfrontClient.request(
      gql`
        mutation SignIn($email: String!, $password: String!) {
          authenticateUserWithPassword(email: $email, password: $password) {
            ... on UserAuthenticationWithPasswordSuccess {
              sessionToken
            }
            ... on UserAuthenticationWithPasswordFailure {
              message
            }
          }
        }
      `,
      { email, password }
    );

    if (authenticateUserWithPassword.sessionToken) {
      await setAuthToken(authenticateUserWithPassword.sessionToken);
      revalidatePath("/");
      return null; // Success
    }

    return "Account created but sign in failed. Please sign in manually.";
  } catch (error) {
    console.error("Sign up error:", error);
    return error instanceof Error ? error.message : "An unexpected error occurred";
  }
}

export async function signOut() {
  await removeAuthToken();
  revalidatePath("/");
  redirect("/");
}

export async function updateCustomerEmail(_prevState: any, formData: FormData) {
  try {
    const headers = await getAuthHeaders();
    await openfrontClient.request(
      gql`
        mutation UpdateUser($data: UserUpdateProfileInput!) {
          updateActiveUser(data: $data) {
            id
            email
          }
        }
      `,
      {
        data: {
          email: formData.get("email"),
        },
      },
      headers
    );
    (revalidateTag as any)("customer");
    return { success: true, error: null };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function updateCustomerName(_prevState: any, formData: FormData) {
  try {
    const headers = await getAuthHeaders();
    const firstName = String(formData.get("firstName") || "").trim();
    const lastName = String(formData.get("lastName") || "").trim();
    const fallbackName = String(formData.get("name") || "").trim();
    const name = [firstName, lastName].filter(Boolean).join(" ") || fallbackName;

    if (!name) {
      return { success: false, error: "Enter your first and last name." };
    }

    await openfrontClient.request(
      gql`
        mutation UpdateUser($data: UserUpdateProfileInput!) {
          updateActiveUser(data: $data) {
            id
            name
          }
        }
      `,
      {
        data: {
          name,
        },
      },
      headers
    );
    (revalidateTag as any)("customer");
    return { success: true, error: null };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function updateCustomerPassword(_prevState: any, formData: FormData) {
  try {
    const headers = await getAuthHeaders();
    await openfrontClient.request(
      gql`
        mutation UpdateUser($data: UserUpdateProfileInput!) {
          updateActiveUser(data: $data) {
            id
          }
        }
      `,
      {
        data: {
          password: formData.get("password"),
        },
      },
      headers
    );
    (revalidateTag as any)("customer");
    return { success: true, error: null };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function updateCustomerPhone(_prevState: any, formData: FormData) {
  try {
    const headers = await getAuthHeaders();
    await openfrontClient.request(
      gql`
        mutation UpdateUser($data: UserUpdateProfileInput!) {
          updateActiveUser(data: $data) {
            id
            phone
          }
        }
      `,
      {
        data: {
          phone: formData.get("phone"),
        },
      },
      headers
    );
    (revalidateTag as any)("customer");
    return { success: true, error: null };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getUserOrders() {
  try {
    const authHeaders = await getAuthHeaders();
    const { getCustomerOrders: orders } = await openfrontClient.request(
      gql`
        query GetCustomerOrders($limit: Int, $offset: Int) {
          getCustomerOrders(limit: $limit, offset: $offset)
        }
      `,
      { limit: 10, offset: 0 },
      authHeaders
    );

    return orders || [];
  } catch (error) {
    console.error("Error fetching user orders:", error);
    return [];
  }
}

export async function createAddress(_currentState: any, formData: FormData) {
  try {
    const headers = await getAuthHeaders();
    const addressData = getNormalizedAddressData(formData)

    const user = await getUser();
    if (!user) return { error: "Not authenticated" };

    const { createAddress: createdAddress } = await openfrontClient.request(
      gql`
        mutation CreateAddress($data: AddressCreateInput!) {
          createAddress(data: $data) {
            id
            isDefault
            isBilling
          }
        }
      `,
      {
        data: {
          ...addressData,
          user: { connect: { id: user.id } }
        }
      },
      headers
    );

    if (createdAddress?.id && (addressData.isDefault || addressData.isBilling)) {
      await setExclusiveAddressFlagsForUser({
        user,
        addressId: createdAddress.id,
        isDefault: addressData.isDefault || undefined,
        isBilling: addressData.isBilling || undefined,
      })
    }

    revalidatePath("/account");
    ;(revalidateTag as any)("customer")
    return { success: true };
  } catch (error) {
    console.error("Create address error:", error);
    return { error: "Failed to create address" };
  }
}

export async function updateAddress(_currentState: any, formData: FormData) {
  try {
    const headers = await getAuthHeaders();
    const id = formData.get("id") as string;
    const addressData = getNormalizedAddressData(formData)
    const user = await getUser()
    if (!user) return { error: "Not authenticated" }

    await openfrontClient.request(
      gql`
        mutation UpdateAddress($id: ID!, $data: AddressUpdateInput!) {
          updateAddress(where: { id: $id }, data: $data) {
            id
          }
        }
      `,
      {
        id,
        data: addressData
      },
      headers
    );

    if (addressData.isDefault || addressData.isBilling) {
      await setExclusiveAddressFlagsForUser({
        user,
        addressId: id,
        isDefault: addressData.isDefault || undefined,
        isBilling: addressData.isBilling || undefined,
      })
    }

    revalidatePath("/account");
    ;(revalidateTag as any)("customer")
    return { success: true };
  } catch (error) {
    console.error("Update address error:", error);
    return { error: "Failed to update address" };
  }
}

export async function upsertBillingAddress(_currentState: any, formData: FormData) {
  try {
    const headers = await getAuthHeaders()
    const user = await getUser()

    if (!user) {
      return { success: false, error: "Not authenticated" }
    }

    const countryCode = normalizeCountryCode(formData.get("countryCode") as string)
    const postalCode = normalizePostalCode(formData.get("postalCode") as string)
    const addressId = (formData.get("id") as string) || user.billingAddress?.id

    const data = {
      name: ((formData.get("name") as string) || "Billing Address").trim() || "Billing Address",
      address1: (formData.get("address1") as string)?.trim(),
      address2: ((formData.get("address2") as string) || "").trim(),
      city: (formData.get("city") as string)?.trim(),
      state: ((formData.get("state") as string) || "").trim(),
      postalCode,
      countryCode,
      country: countryCode,
      phone: ((formData.get("phone") as string) || "").trim(),
      isBilling: true,
    }

    if (!data.address1 || !data.city || !data.postalCode || !data.countryCode) {
      return {
        success: false,
        error: "Billing address is incomplete. Add street address, city, postal code, and country code.",
      }
    }

    let savedAddressId: string | null = null

    if (addressId) {
      const { updateAddress: updatedAddress } = await openfrontClient.request(
        gql`
          mutation UpdateBillingAddress($id: ID!, $data: AddressUpdateInput!) {
            updateAddress(where: { id: $id }, data: $data) {
              id
            }
          }
        `,
        {
          id: addressId,
          data,
        },
        headers
      )

      savedAddressId = updatedAddress?.id || null
    } else {
      const { createAddress: createdAddress } = await openfrontClient.request(
        gql`
          mutation CreateBillingAddress($data: AddressCreateInput!) {
            createAddress(data: $data) {
              id
            }
          }
        `,
        {
          data: {
            ...data,
            user: { connect: { id: user.id } },
          },
        },
        headers
      )

      savedAddressId = createdAddress?.id || null
    }

    if (savedAddressId) {
      await setExclusiveAddressFlagsForUser({
        user,
        addressId: savedAddressId,
        isBilling: true,
      })
    }

    revalidatePath("/account")
    revalidatePath("/account/profile")
    ;(revalidateTag as any)("customer")

    return { success: true, error: null }
  } catch (error) {
    console.error("Upsert billing address error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save billing address",
    }
  }
}

export async function deleteAddress(id: string) {
  try {
    const headers = await getAuthHeaders();
    await openfrontClient.request(
      gql`
        mutation DeleteAddress($id: ID!) {
          deleteAddress(where: { id: $id }) {
            id
          }
        }
      `,
      { id },
      headers
    );

    revalidatePath("/account");
    ;(revalidateTag as any)("customer")
    return { success: true };
  } catch (error) {
    console.error("Delete address error:", error);
    return { error: "Failed to delete address" };
  }
}

/**
 * Attempt to create a guest account and authenticate the user.
 * Mirrors OpenFront's checkout guest-auth flow:
 *   1. If user is already authenticated → no-op.
 *   2. Try createUser with a random password.
 *   3. If email already exists (unique constraint) → return a human-readable error.
 *   4. If created → immediately authenticateUserWithPassword → set session cookie.
 */
export async function createGuestUser(params: {
  email: string;
  name: string;
  phone?: string;
}): Promise<{ success: boolean; error?: string; userId?: string }> {
  try {
    // 1. Already authenticated?
    const existing = await getUser();
    if (existing) return { success: true, userId: existing.id };

    const { email, name, phone } = params;

    // 2. Random password the user never sees
    const randomPassword = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // 3. Create user
    const { createUser: guestUser } = await openfrontClient.request(
      gql`
        mutation CreateGuestUser($data: UserCreateInput!) {
          createUser(data: $data) {
            id
            email
          }
        }
      `,
      {
        data: {
          email,
          name,
          phone,
          password: randomPassword,
        },
      }
    );

    if (!guestUser?.id) {
      return { success: false, error: "Failed to create account." };
    }

    // 4. Authenticate immediately so the session cookie is set
    const { authenticateUserWithPassword } = await openfrontClient.request(
      gql`
        mutation AuthenticateGuestUser($email: String!, $password: String!) {
          authenticateUserWithPassword(email: $email, password: $password) {
            ... on UserAuthenticationWithPasswordSuccess {
              sessionToken
            }
            ... on UserAuthenticationWithPasswordFailure {
              message
              __typename
            }
          }
        }
      `,
      { email, password: randomPassword }
    );

    if (authenticateUserWithPassword.__typename === "UserAuthenticationWithPasswordFailure") {
      return { success: false, error: "Authentication failed. Please try again or contact support." };
    }

    if (authenticateUserWithPassword.sessionToken) {
      await setAuthToken(authenticateUserWithPassword.sessionToken);
      (revalidateTag as any)("customer");
      (revalidateTag as any)("auth");
    }

    const authenticatedUser = await getUser();
    return { success: true, userId: authenticatedUser?.id || guestUser.id };
  } catch (error: any) {
    // 5. Unique constraint → email already has an account
    const msg = error instanceof Error ? error.message : String(error);
    const lower = msg.toLowerCase();
    const errorStr = JSON.stringify(error).toLowerCase();

    if (
      lower.includes("unique constraint") ||
      lower.includes("already exists") ||
      lower.includes("duplicate") ||
      lower.includes("unique") ||
      errorStr.includes("unique constraint") ||
      errorStr.includes("duplicate") ||
      errorStr.includes("email_unique") ||
      error?.code === "P2002"
    ) {
      return {
        success: false,
        error:
          "This email address already has an account. Please sign in or use a different email to continue with your order.",
      };
    }

    return { success: false, error: msg };
  }
}
