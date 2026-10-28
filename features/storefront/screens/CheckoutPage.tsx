import Wrapper from "@/features/storefront/modules/checkout/components/payment-wrapper";
import CheckoutForm from "@/features/storefront/modules/checkout/components/checkout-form";
import CheckoutSummary from "@/features/storefront/modules/checkout/components/checkout-summary";
import { retrieveCart } from "@/features/storefront/lib/data/cart";
import { getUser } from "@/features/storefront/lib/data/user";
import { getStoreSettings } from "@/features/storefront/lib/data/menu";
import { CheckoutPaymentStateProvider } from "@/features/storefront/modules/checkout/components/checkout-state";
import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Checkout",
};

function EmptyCheckout() {
  return (
    <div className="storefront-shell flex min-h-[60dvh] flex-col items-start justify-center py-16">
      <h1 className="storefront-heading">Nothing on the ticket yet</h1>
      <p className="storefront-copy mt-4 max-w-[46ch]">
        Add a dish from the menu, then come back here to choose pickup or delivery and pay.
      </p>
      <Link href="/#menu" className="pass-action mt-8">
        Browse the menu
      </Link>
    </div>
  );
}

export async function CheckoutPage() {
  const cart = await retrieveCart();
  // With no ticket open (or an emptied one) there is nothing to pay for: say so instead of a bare 404.
  if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
    return <EmptyCheckout />;
  }
  const [customer, storeSettings] = await Promise.all([getUser(), getStoreSettings()]);

  return (
    <Wrapper cart={cart}>
      <CheckoutPaymentStateProvider>
        <div className="storefront-shell py-8 sm:py-10 lg:py-14">
          <div className="mb-8 max-w-2xl space-y-3">
            <h1 className="storefront-heading">Finish your order</h1>
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-12">
            <CheckoutForm cart={cart} customer={customer} storeSettings={storeSettings} />
            <CheckoutSummary cart={cart} customer={customer} storeSettings={storeSettings} />
          </div>
        </div>
      </CheckoutPaymentStateProvider>
    </Wrapper>
  );
}

export function CheckoutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="storefront-ui min-h-dvh w-full bg-steel text-ink">
      <div className="sticky top-0 z-40 bg-steel text-ink">
        <nav className="storefront-shell flex h-16 items-center justify-between gap-4">
          <Link
            href="/"
            className="-ml-2 inline-flex items-center gap-2 px-2 py-2 text-base font-medium text-ink transition-colors hover:bg-steel-shade"
            data-testid="back-to-menu-link"
          >
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Back to menu</span>
          </Link>

          <div className="text-center">
            <div className="font-serif text-2xl font-extrabold text-ink">Checkout</div>
          </div>

          <div className="h-10 min-w-[112px]" />
        </nav>
      </div>

      <div data-testid="checkout-container">{children}</div>
    </div>
  );
}
