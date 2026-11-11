import Link from "next/link"
import Wrapper from "@/features/storefront/modules/checkout/components/payment-wrapper"
import CheckoutForm from "@/features/storefront/modules/checkout/components/checkout-form"
import CheckoutSummary from "@/features/storefront/modules/checkout/components/checkout-summary"
import { CheckoutPaymentStateProvider } from "@/features/storefront/modules/checkout/components/checkout-state"
import { retrieveCart } from "@/features/storefront/lib/data/cart"
import { getCartPromo } from "@/features/storefront/lib/data/public"
import { getUser } from "@/features/storefront/lib/data/user"
import { getStoreSettings } from "@/features/storefront/lib/data/menu"
import { storeOwnMark } from "@/features/storefront/lib/store-mark"
import { Arcs } from "./Arcs"
import { Brand } from "./chrome"
import { Unavailable } from "./Unavailable"
import "./orbit.css"

export const checkoutMetadata = { title: "Checkout" }

/** Checkout keeps the guest focused: the store mark, a way back, and nothing else up top. */
export async function OrbitCheckoutLayout({ children }: { children: React.ReactNode }) {
  const settings = await getStoreSettings()
  const name = String(settings?.name || "Restaurant").trim()
  const mark = storeOwnMark(settings?.logoIcon)
  return (
    <div className="orbit-ui o-page o-checkout">
      <header className="o-header">
        <div className="o-shell o-header-row">
          <Link href="/menu" className="o-pill" data-testid="back-to-menu-link" style={{ boxShadow: "none", background: "transparent", paddingLeft: 6 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
            <span>Menu</span>
          </Link>
          <Brand name={name} mark={mark} hue={settings?.logoColor} />
          <span style={{ width: 88 }} aria-hidden="true" />
        </div>
      </header>
      <main className="o-rel" data-testid="checkout-container">
        <Arcs variant="page" />
        {children}
      </main>
    </div>
  )
}

export async function OrbitCheckoutPage() {
  const base = await retrieveCart()
  const cart = base ? { ...base, promo: await getCartPromo() } : base
  if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
    return <Unavailable title="Your order is empty" message="Add a dish from the menu, then come back here to choose pickup or delivery and pay." />
  }
  const [customer, settings] = await Promise.all([getUser(), getStoreSettings()])
  return (
    <Wrapper cart={cart}>
      <CheckoutPaymentStateProvider>
        <div className="o-shell" style={{ paddingBlock: "clamp(1.5rem, 5vw, 3.5rem)" }}>
          <h1 className="o-split o-split-lg" style={{ marginBottom: "clamp(1.25rem, 4vw, 2.25rem)" }}>
            <span className="o-thin">Finish your</span>
            <span className="o-heavy">Order</span>
          </h1>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-10">
            <CheckoutForm cart={cart} customer={customer} storeSettings={settings} />
            <CheckoutSummary cart={cart} customer={customer} storeSettings={settings} />
          </div>
        </div>
      </CheckoutPaymentStateProvider>
    </Wrapper>
  )
}
