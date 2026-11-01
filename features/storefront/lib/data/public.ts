"use server";

import { gql } from "graphql-request";
import { updateTag } from "next/cache";
import { openfrontClient } from "../config";
import { getAuthHeaders, getCartId } from "./cookies";

function message(error: unknown, fallback: string) {
  const text = (error as any)?.response?.errors?.[0]?.message || (error instanceof Error ? error.message : "");
  return text && !/^GraphQL Error|^Access denied|^Unexpected/.test(text) ? text : fallback;
}

export async function getReservationSlots(date: string, partySize: number) {
  try {
    const { reservationAvailability } = await openfrontClient.request<any>(
      gql`query($date: String!, $partySize: Int!) { reservationAvailability(date: $date, partySize: $partySize) }`,
      { date, partySize },
    );
    if (reservationAvailability?.success === false) return { ok: false as const, message: reservationAvailability.message as string };
    return { ok: true as const, ...reservationAvailability };
  } catch (error) {
    return { ok: false as const, message: message(error, "We couldn't load times. Please try again.") };
  }
}

export async function bookReservation(input: { date: string; startsAt: string; partySize: number; name: string; email: string; phone: string; notes?: string }) {
  try {
    const { createGuestReservation } = await openfrontClient.request<any>(
      gql`mutation($date: String!, $startsAt: String!, $partySize: Int!, $name: String!, $email: String!, $phone: String!, $notes: String) {
        createGuestReservation(date: $date, startsAt: $startsAt, partySize: $partySize, name: $name, email: $email, phone: $phone, notes: $notes)
      }`,
      input,
    );
    if (createGuestReservation?.success === false) return { ok: false as const, message: createGuestReservation.message as string };
    return { ok: true as const, ...createGuestReservation };
  } catch (error) {
    return { ok: false as const, message: message(error, "We couldn't book that table. Please try again.") };
  }
}

export async function checkGiftCardBalance(code: string) {
  try {
    const { lookupGiftCardBalance } = await openfrontClient.request<any>(
      gql`query($code: String!) { lookupGiftCardBalance(code: $code) }`,
      { code },
    );
    return lookupGiftCardBalance ? { ok: true as const, ...lookupGiftCardBalance } : { ok: false as const, message: "We couldn't find a gift card with that code." };
  } catch (error) {
    return { ok: false as const, message: message(error, "We couldn't check that card. Please try again.") };
  }
}

export async function startGiftCard(input: { amount: number; purchaserEmail: string; recipientName?: string; recipientEmail?: string; message?: string }) {
  try {
    const { startGiftCardPurchase } = await openfrontClient.request<any>(
      gql`mutation($amount: Int!, $purchaserEmail: String!, $recipientName: String, $recipientEmail: String, $message: String) {
        startGiftCardPurchase(amount: $amount, purchaserEmail: $purchaserEmail, recipientName: $recipientName, recipientEmail: $recipientEmail, message: $message)
      }`,
      input,
    );
    if (startGiftCardPurchase?.success === false) return { ok: false as const, message: startGiftCardPurchase.message as string };
    return { ok: true as const, ...startGiftCardPurchase };
  } catch (error) {
    return { ok: false as const, message: message(error, "We couldn't start your purchase. Please try again.") };
  }
}

export async function finishGiftCard(paymentIntentId: string) {
  try {
    const { completeGiftCardPurchase } = await openfrontClient.request<any>(
      gql`mutation($paymentIntentId: String!) { completeGiftCardPurchase(paymentIntentId: $paymentIntentId) }`,
      { paymentIntentId },
    );
    if (completeGiftCardPurchase?.success === false) return { ok: false as const, message: completeGiftCardPurchase.message as string };
    return { ok: true as const, ...completeGiftCardPurchase };
  } catch (error) {
    return { ok: false as const, message: message(error, "Your payment went through but we couldn't show the card yet. Please refresh in a moment.") };
  }
}

export async function findOrder(orderNumber: string, email: string) {
  try {
    const { lookupGuestOrder } = await openfrontClient.request<any>(
      gql`query($orderNumber: String!, $email: String!) { lookupGuestOrder(orderNumber: $orderNumber, email: $email) }`,
      { orderNumber, email },
    );
    if (!lookupGuestOrder) return { ok: false as const, message: "We couldn't find an order matching that number and email." };
    return { ok: true as const, href: `/order/confirmed/${lookupGuestOrder.id}?secretKey=${lookupGuestOrder.secretKey}` };
  } catch (error) {
    return { ok: false as const, message: message(error, "We couldn't look that up. Please try again.") };
  }
}

export async function getCartPromo() {
  const cartId = await getCartId();
  if (!cartId) return null;
  try {
    const { cartPromo } = await openfrontClient.request<any>(gql`query($cartId: ID!) { cartPromo(cartId: $cartId) }`, { cartId }, await getAuthHeaders());
    return cartPromo as { code: string; amount: number } | null;
  } catch {
    return null;
  }
}

export async function applyPromo(code: string) {
  const cartId = await getCartId();
  if (!cartId) return { success: false, message: "Your cart is empty." };
  try {
    const { applyPromoCode } = await openfrontClient.request<any>(gql`mutation($cartId: ID!, $code: String!) { applyPromoCode(cartId: $cartId, code: $code) }`, { cartId, code }, await getAuthHeaders());
    updateTag("cart");
    return applyPromoCode as { success: boolean; message: string | null; code: string | null; amount: number };
  } catch (error) {
    return { success: false, message: message(error, "We couldn't apply that code.") };
  }
}

export async function removePromo() {
  const cartId = await getCartId();
  if (!cartId) return { success: true, message: null };
  try {
    const { removePromoCode } = await openfrontClient.request<any>(gql`mutation($cartId: ID!) { removePromoCode(cartId: $cartId) }`, { cartId }, await getAuthHeaders());
    updateTag("cart");
    return removePromoCode as { success: boolean; message: string | null };
  } catch (error) {
    return { success: false, message: message(error, "We couldn't remove that code.") };
  }
}
