"use server";

import { cookies } from "next/headers"
import { verifyCartProof } from "@/features/keystone/utils/cartProof"

export const getAuthHeaders = async (): Promise<Record<string, string>> => {
  const cookieStore = await cookies()
  const token = cookieStore.get("keystonejs-session")?.value
  const cartId = cookieStore.get("_restaurant_cart_id")?.value
  const proof = cookieStore.get("_restaurant_cart_proof")?.value
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
  return (await cookies()).get("_restaurant_cart_id")?.value
}

export const setCartId = async (cartId: string, proof: string) => {
  if (!verifyCartProof(proof, cartId)) throw new Error("Invalid cart proof");
  const options = { maxAge: 60 * 60 * 24 * 7, httpOnly: true, sameSite: "strict" as const, secure: process.env.NODE_ENV === "production", path: "/" };
  const store = await cookies();
  store.set("_restaurant_cart_proof", proof, options);
  store.set("_restaurant_cart_id", cartId, options);
}

export const removeCartId = async () => {
  const store = await cookies();
  store.set("_restaurant_cart_proof", "", { maxAge: -1, path: "/" });
  store.set("_restaurant_cart_id", "", { maxAge: -1, path: "/" });
}
