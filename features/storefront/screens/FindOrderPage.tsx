import { Metadata } from "next"
import FindOrderForm from "@/features/storefront/components/FindOrderForm"

export const metadata: Metadata = { title: "Find your order", description: "Look up an order with its number and the email you used at checkout." }

export default function FindOrderPage() {
  return (
    <main className="bg-steel text-ink">
      <div className="storefront-shell py-10 sm:py-14 lg:py-20">
        <h1 className="text-balance font-serif text-5xl font-black leading-[0.9] lg:text-7xl">Find your order</h1>
        <p className="mt-4 max-w-[48ch] text-xl">See where your order is. No account needed.</p>
        <div className="mt-10 max-w-xl"><FindOrderForm /></div>
      </div>
    </main>
  )
}
