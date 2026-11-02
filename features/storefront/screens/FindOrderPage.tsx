import { Metadata } from "next"
import FindOrderForm from "@/features/storefront/components/FindOrderForm"

export const metadata: Metadata = { title: "Find your order", description: "Look up an order with its number and the email you used at checkout." }

export default function FindOrderPage() {
  return (
    <main className="bg-white text-ink">
      <div className="storefront-shell py-6 sm:py-10 lg:py-14">
        <h1 className="sf-page-title">Find your order</h1>
        <p className="mt-2 max-w-[52ch] sf-lede sm:mt-3">See where your order is. No account needed.</p>
        <div className="mt-6 max-w-xl sm:mt-10"><FindOrderForm /></div>
      </div>
    </main>
  )
}
