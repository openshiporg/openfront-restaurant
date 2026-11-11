import { getUser, getUserOrders } from "@/features/storefront/lib/data/user"
import { formatCurrency } from "@/features/storefront/lib/currency"
import { getStoreSettings } from "@/features/storefront/lib/data/menu"
import { Package, ChevronRight } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

export default async function AccountOverviewPage() {
  const user = await getUser()
  if (!user) notFound()

  const [orders, storeSettings] = await Promise.all([
    getUserOrders(),
    getStoreSettings(),
  ])
  const currencyConfig = {
    currencyCode: storeSettings?.currencyCode || "USD",
    locale: storeSettings?.locale || "en-US",
  }

  const completion = getProfileCompletion(user)
  const firstName = user.firstName || user.name?.split(" ")[0] || "there"

  return (
    <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className=" pb-6">
        <h1 className="mt-3 sf-page-title text-foreground">Hello, {firstName}</h1>
        <p className="mt-2 text-base text-muted-foreground">Welcome back to your account.</p>
      </div>

      <div className="o-acct-stats">
        <div className="o-acct-stat">
          <p className="text-sm font-medium text-primary">Profile</p>
          <p className="mt-2 text-[1.3rem] font-semibold text-foreground sm:text-3xl">{completion}%</p>
          <Link href="/account/profile" className="mt-3 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-primary">
            Edit profile <ChevronRight size={14} />
          </Link>
        </div>
        <div className="o-acct-stat">
          <p className="text-sm font-medium text-primary">Addresses</p>
          <p className="mt-2 text-[1.3rem] font-semibold text-foreground sm:text-3xl">{user.addresses?.length || 0}</p>
          <Link href="/account/addresses" className="mt-3 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-primary">
            Manage <ChevronRight size={14} />
          </Link>
        </div>
        <div className="o-acct-stat">
          <p className="text-sm font-medium text-primary">Orders</p>
          <p className="mt-2 text-[1.3rem] font-semibold text-foreground sm:text-3xl">{orders.length}</p>
          <Link href="/account/orders" className="mt-3 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-primary">
            View history <ChevronRight size={14} />
          </Link>
        </div>
      </div>

      <div className="pt-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="o-acct-h2">Recent orders</h2>
          {orders.length > 0 ? (
            <Link href="/account/orders" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-primary">
              View all <ChevronRight size={14} />
            </Link>
          ) : null}
        </div>

        {orders.length === 0 ? (
          <div className="border border-dashed border-border bg-muted/30 py-16 text-center">
            <Package className="mx-auto mb-4 size-8 text-muted-foreground/70" />
            <p className="text-base text-muted-foreground">No orders yet.</p>
            <Link href="/" className="mt-3 inline-block text-sm text-primary hover:underline">
              Browse the menu
            </Link>
          </div>
        ) : (
          <div className="o-acct-rows">
            {orders.slice(0, 4).map((order: any) => (
              <Link
                key={order.id}
                href={`/account/orders/details/${order.id}`}
                className="o-acct-row"
              >
                <div>
                  <p className="text-base font-medium text-foreground">#{order.orderNumber}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium text-foreground">
                    {formatCurrency(order.total, currencyConfig)}
                  </span>
                  <ChevronRight size={14} className="text-muted-foreground" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function getProfileCompletion(user: any) {
  let count = 0
  if (user.email) count++
  if (user.firstName && user.lastName) count++
  if (user.phone) count++
  if (user.addresses?.length > 0) count++
  return Math.round((count / 4) * 100)
}
