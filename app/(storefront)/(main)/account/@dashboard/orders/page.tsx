import { Metadata } from "next"
import { getUser, getUserOrders } from "@/features/storefront/lib/data/user"
import { formatCurrency } from "@/features/storefront/lib/currency"
import { getStoreSettings } from "@/features/storefront/lib/data/menu"
import { Package, ChevronRight } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

export const metadata: Metadata = {
  title: "Orders",
  description: "View your order history.",
}

const STATUS_COLORS: Record<string, string> = {
  completed: "bg-emerald-500",
  cancelled: "bg-red-500",
  open: "bg-blue-500",
  in_progress: "bg-amber-500",
  ready: "bg-purple-500",
  served: "bg-teal-500",
  sent_to_kitchen: "bg-orange-500",
}

function StatusDot({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? "bg-zinc-400"
  return <span className={`inline-block size-2 rounded-full shrink-0 ${color}`} />
}

export default async function AccountOrdersPage() {
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

  return (
    <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="border-b border-border pb-6">
        <span className="storefront-kicker">Order history</span>
        <h1 className="mt-4 font-serif text-4xl font-semibold text-foreground">Your orders</h1>
        <p className="mt-2 text-base text-muted-foreground">
          {orders.length > 0
            ? `${orders.length} order${orders.length !== 1 ? "s" : ""} placed`
            : "No orders yet."}
        </p>
      </div>

      <div className="pt-6">
        {orders.length === 0 ? (
          <div className="border border-dashed border-border bg-muted/30 py-16 text-center">
            <Package className="mx-auto mb-4 size-8 text-muted-foreground/70" />
            <p className="text-base text-muted-foreground">You haven&apos;t placed any orders yet.</p>
            <Link href="/" className="mt-3 inline-block text-sm text-primary hover:underline">
              Start browsing the menu
            </Link>
          </div>
        ) : (
          <div className="border border-border bg-background">
            {orders.map((order: any) => (
              <Link
                key={order.id}
                href={`/account/orders/details/${order.id}`}
                className="flex items-center justify-between gap-4 border-b border-border px-5 py-4 transition-colors last:border-b-0 hover:bg-muted/30"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <StatusDot status={order.status} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-medium text-foreground">#{order.orderNumber}</span>
                      <span className="text-sm text-muted-foreground">{order.status.replace(/_/g, " ")}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {new Date(order.createdAt).toLocaleDateString()} · {new Date(order.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0">
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
