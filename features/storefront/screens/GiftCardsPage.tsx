import { Metadata } from "next"
import { getStoreSettings } from "@/features/storefront/lib/data/menu"
import { StorefrontUnavailable } from "@/features/storefront/components/StorefrontUnavailable"
import GiftCardPurchase from "@/features/storefront/components/GiftCardPurchase"
import GiftCardBalance from "@/features/storefront/components/GiftCardBalance"
import { getCurrencyConfig } from "@/features/storefront/lib/currency"

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getStoreSettings()
  const name = settings?.name || "Restaurant"
  return { title: `Gift cards - ${name}`, description: `Give a ${name} gift card by email, or check the balance on one you have.` }
}

export default async function GiftCardsPage() {
  const settings = await getStoreSettings()
  if (!settings) return <StorefrontUnavailable title="Gift cards aren't available yet" message="Please try again later." />
  const currency = getCurrencyConfig(settings)
  return (
    <main className="bg-steel text-ink">
      <div className="storefront-shell py-10 sm:py-14 lg:py-20">
        <h1 className="text-balance font-serif text-5xl font-black leading-[0.9] lg:text-7xl">Gift cards</h1>
        <p className="mt-4 max-w-[48ch] text-xl">Send a meal at {settings.name || "the restaurant"} by email, or keep one for yourself.</p>
        <div className="mt-10 grid gap-12 lg:grid-cols-12 lg:gap-10">
          <section className="storefront-surface bg-card p-5 sm:p-8 lg:col-span-7" aria-labelledby="buy-heading">
            <h2 id="buy-heading" className="mb-6 font-serif text-3xl font-extrabold">Buy a gift card</h2>
            <GiftCardPurchase locale={currency.locale} currencyCode={currency.currencyCode} />
          </section>
          <section className="lg:col-span-4 lg:col-start-9" aria-labelledby="balance-heading">
            <h2 id="balance-heading" className="mb-4 font-serif text-3xl font-extrabold">Check a balance</h2>
            <GiftCardBalance locale={currency.locale} />
          </section>
        </div>
      </div>
    </main>
  )
}
