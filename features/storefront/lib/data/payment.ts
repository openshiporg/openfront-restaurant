"use server";
import { gql } from "graphql-request";
import { openfrontClient } from "../config";
import { cache } from "react";
import { revalidateTag } from "next/cache";

export const listCartPaymentMethods = cache(async function () {
  const LIST_PAYMENT_PROVIDERS = gql`
    query ListPaymentProviders {
      activeCartPaymentProviders {
        id
        name
        code
        isInstalled
      }
    }
  `;

  const { activeCartPaymentProviders } = await openfrontClient.request(
    LIST_PAYMENT_PROVIDERS
  );
  return activeCartPaymentProviders;
});

export const initiatePaymentSession = async (cartId: string, paymentProviderId: string) => {
  if (!cartId) throw new Error("Cart ID is required");
  const INITIATE_PAYMENT_SESSION = gql`
    mutation InitiatePaymentSession($cartId: ID!, $paymentProviderId: String!) {
      initiatePaymentSession(
        cartId: $cartId
        paymentProviderId: $paymentProviderId
      ) {
        id
        data
        amount
      }
    }
  `;

  const { initiatePaymentSession: session } = await openfrontClient.request(
    INITIATE_PAYMENT_SESSION,
    {
      cartId,
      paymentProviderId,
    }
  );

  (revalidateTag as any)("cart");
  return session;
};
