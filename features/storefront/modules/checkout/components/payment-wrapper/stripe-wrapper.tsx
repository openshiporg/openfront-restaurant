"use client";
import { Stripe, StripeElementsOptions } from "@stripe/stripe-js"
import { Elements } from "@stripe/react-stripe-js"
import { createContext } from "react"

export const StripeContext = createContext(false)

interface StripeWrapperProps {
  paymentSession: {
    data?: {
      clientSecret?: string;
    };
  };
  stripeKey: string | null | undefined;
  stripePromise: any;
  children: React.ReactNode;
}

const StripeWrapper = ({
  paymentSession,
  stripeKey,
  stripePromise,
  children,
}: StripeWrapperProps) => {
  const options = {
    clientSecret: paymentSession?.data?.clientSecret,
    // Card fields render in Stripe's iframe; give it the storefront typeface.
    fonts: [{ cssSrc: "https://fonts.googleapis.com/css2?family=Archivo:wght@400;500&display=swap" }],
  }

  if (!stripeKey) {
    throw new Error(
      "Stripe key is missing. Set NEXT_PUBLIC_STRIPE_KEY environment variable."
    )
  }

  if (!stripePromise) {
    throw new Error(
      "Stripe promise is missing. Make sure you have provided a valid Stripe key."
    )
  }

  return (
    <StripeContext.Provider value={true}>
      <Elements options={options} stripe={stripePromise}>
        {children}
      </Elements>
    </StripeContext.Provider>
  )
}

export default StripeWrapper
