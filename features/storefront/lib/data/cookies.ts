"use server";

import { cookies } from "next/headers"
import { verifyCartProof } from "@/features/keystone/utils/cartProof"

// Production is HTTPS: the cart cookies are SameSite=None; Secure; Partitioned
// (CHIPS) so a framed shop (the Oathkeeper Browser, an embed) keeps its order
// bag; Safari keeps a cookie in a cross-site frame only when it is partitioned.
// They use new names because a browser keeps a partitioned and an unpartitioned
// cookie of the same name side by side; the earlier Strict cookies are still
// read and are cleared whenever the cart is written or removed.
const CART_ID = "_restaurant_cart"
const CART_PROOF = "_restaurant_cart_p"
const LEGACY_CART_ID = "_restaurant_cart_id"
const LEGACY_CART_PROOF = "_restaurant_cart_proof"

function cartCookieScope() {
  return process.env.NODE_ENV === "production"
    ? ({ sameSite: "none", secure: true, partitioned: true } as const)
    : ({ sameSite: "lax", secure: false } as const)
}

type Jar = Awaited<ReturnType<typeof cookies>>

function readCart(jar: Jar) {
  const cartId = jar.get(CART_ID)?.value
  if (cartId) return { cartId, proof: jar.get(CART_PROOF)?.value }
  return { cartId: jar.get(LEGACY_CART_ID)?.value, proof: jar.get(LEGACY_CART_PROOF)?.value }
}

function clearLegacyCart(jar: Jar) {
  if (jar.get(LEGACY_CART_ID)) jar.set(LEGACY_CART_ID, "", { maxAge: -1, path: "/" })
  if (jar.get(LEGACY_CART_PROOF)) jar.set(LEGACY_CART_PROOF, "", { maxAge: -1, path: "/" })
}

export const getAuthHeaders = async (): Promise<Record<string, string>> => {
  const cookieStore = await cookies()
  const token = cookieStore.get("keystonejs-session")?.value
  const { cartId, proof } = readCart(cookieStore)
  const headers: Record<string, string> = {}

  if (token) {
    headers.authorization = `Bearer ${token}`
  }

  if (cartId && proof) {
    headers["x-restaurant-cart-proof"] = proof
  }

  return headers
}

type CookieOptions = { [key: string]: any; };

export const setAuthToken = async (token: string, options: CookieOptions = {}) => {
  (await cookies()).set("keystonejs-session", token, {
    maxAge: 60 * 60 * 24 * 30,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...options
  })
}

export const removeAuthToken = async () => {
  (await cookies()).set("keystonejs-session", "", {
    maxAge: -1,
  })
}

export const getCartId = async (): Promise<string | undefined> => {
  return readCart(await cookies()).cartId
}

export const setCartId = async (cartId: string, proof: string) => {
  if (!verifyCartProof(proof, cartId)) throw new Error("Invalid cart proof");
  const options = { maxAge: 60 * 60 * 24 * 7, httpOnly: true, path: "/", ...cartCookieScope() };
  const store = await cookies();
  store.set(CART_PROOF, proof, options);
  store.set(CART_ID, cartId, options);
  clearLegacyCart(store);
}

export const removeCartId = async () => {
  const store = await cookies();
  const options = { maxAge: -1, httpOnly: true, path: "/", ...cartCookieScope() };
  store.set(CART_PROOF, "", options);
  store.set(CART_ID, "", options);
  clearLegacyCart(store);
}
