"use server";
import { openfrontClient } from "../config";
import { getAuthHeaders } from "./cookies";
import { updateTag } from "next/cache";
export async function cancelCheckoutPayment(cartId: string, paymentSessionId: string) {
  const result = await openfrontClient.request(`mutation($cartId:ID!,$paymentSessionId:ID!){cancelCheckoutPaymentSession(cartId:$cartId,paymentSessionId:$paymentSessionId){success error}}`, { cartId, paymentSessionId }, await getAuthHeaders());
  updateTag("cart"); return result.cancelCheckoutPaymentSession;
}
