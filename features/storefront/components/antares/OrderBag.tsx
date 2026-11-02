"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Clock, MapPin, Minus, Plus, ShoppingBag, X } from "lucide-react"
import { formatCurrency } from "@/features/storefront/lib/currency"
import { removeLineItem, updateLineItem } from "@/features/storefront/lib/data/cart"
import type { CartData } from "@/features/storefront/modules/layout/components/cart-dropdown"
import { cn } from "@/lib/utils"

interface OrderBagProps {
  cart: CartData | null
  currencyCode: string
  locale: string
  readyIn?: string | null
  address?: string | null
  className?: string
}

/** The order bag that sits beside the menu on wide screens: live items, totals and checkout. */
export function OrderBag({ cart, currencyCode, locale, readyIn, address, className }: OrderBagProps) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const items = cart?.items || []
  const count = items.reduce((sum, item) => sum + item.quantity, 0)
  const money = (value: number) => formatCurrency(value, { currencyCode, locale })

  const run = async (task: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await task()
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className={cn("storefront-card flex flex-col p-6", className)} aria-label="Your order bag">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-3 font-serif text-2xl font-bold">
          <ShoppingBag className="size-6" strokeWidth={1.75} aria-hidden="true" />
          Your order bag
        </h2>
        <span className="grid size-9 place-items-center rounded-full bg-mint text-base font-semibold text-leaf" aria-label={`${count} items`}>
          {count}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="mt-6 flex min-h-64 flex-1 flex-col items-center justify-center rounded-2xl bg-mint px-6 py-10 text-center">
          <span className="grid size-24 place-items-center rounded-full bg-white/70 text-leaf">
            <ShoppingBag className="size-11" strokeWidth={1.5} aria-hidden="true" />
          </span>
          <p className="mt-6 text-xl font-medium text-ink">Your order bag is empty</p>
          <p className="mt-1.5 max-w-[24ch] text-pretty text-[0.95rem] text-ink-soft">Add something delicious to get started.</p>
        </div>
      ) : (
        <>
          <ul className="mt-5 max-h-[22rem] divide-y divide-border overflow-y-auto pr-1">
            {items.map((item) => {
              const extra = item.modifiers.reduce((sum, modifier) => sum + (modifier.priceAdjustment || 0), 0)
              const line = (Number(item.menuItem.price) + extra) * item.quantity
              return (
                <li key={item.id} className="flex gap-3 py-3">
                  <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-muted">
                    {item.menuItem.thumbnail ? (
                      <Image src={item.menuItem.thumbnail} alt="" fill sizes="56px" className="object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate font-medium text-ink">{item.menuItem.name}</p>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => run(() => removeLineItem({ cartId: cart?.id || "", lineId: item.id }))}
                        className="-m-1 rounded-full p-1 text-ink-soft transition-colors hover:text-ink disabled:opacity-40"
                        aria-label={`Remove ${item.menuItem.name}`}
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                    {item.modifiers.length > 0 ? (
                      <p className="truncate text-sm text-ink-soft">{item.modifiers.map((modifier) => modifier.name).join(", ")}</p>
                    ) : null}
                    <div className="mt-1.5 flex items-center justify-between">
                      <div className="inline-flex items-center rounded-full border border-border">
                        <button
                          type="button"
                          disabled={busy || item.quantity <= 1}
                          onClick={() => run(() => updateLineItem({ cartId: cart?.id || "", lineId: item.id, quantity: item.quantity - 1 }))}
                          className="grid size-7 place-items-center rounded-full text-ink-soft hover:text-ink disabled:opacity-40"
                          aria-label={`Decrease ${item.menuItem.name}`}
                        >
                          <Minus className="size-3.5" />
                        </button>
                        <span className="w-6 text-center text-sm font-semibold tabular-nums">{item.quantity}</span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => run(() => updateLineItem({ cartId: cart?.id || "", lineId: item.id, quantity: item.quantity + 1 }))}
                          className="grid size-7 place-items-center rounded-full text-leaf hover:bg-mint disabled:opacity-40"
                          aria-label={`Increase ${item.menuItem.name}`}
                        >
                          <Plus className="size-3.5" />
                        </button>
                      </div>
                      <span className="text-[0.95rem] font-semibold tabular-nums text-leaf">{money(line)}</span>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-4 text-base">
            <span className="text-ink-soft">Subtotal</span>
            <span className="font-semibold tabular-nums">{money(cart?.subtotal || 0)}</span>
          </div>
          <Link href="/checkout?step=contact" className="pass-action mt-4 w-full">
            Go to checkout
          </Link>
        </>
      )}

      {readyIn || address ? (
        <div className="mt-6 space-y-4 border-t border-border pt-6 text-[1.05rem]">
          {readyIn ? (
            <p className="flex items-center gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-leaf text-white">
                <Clock className="size-4" strokeWidth={2.25} aria-hidden="true" />
              </span>
              <span>
                Ready in <span className="font-semibold text-leaf">{readyIn}</span>
              </span>
            </p>
          ) : null}
          {address ? (
            <p className="flex items-start gap-3">
              <MapPin className="mt-0.5 size-6 shrink-0 text-ink-soft" strokeWidth={1.75} aria-hidden="true" />
              <span className="leading-snug">
                {/* Street on one line, city on the next, the way the address is written on a card. */}
                {address.includes(",") ? (
                  <>
                    <span className="block">{address.slice(0, address.indexOf(",")).trim()}</span>
                    <span className="block">{address.slice(address.indexOf(",") + 1).trim()}</span>
                  </>
                ) : address}
              </span>
            </p>
          ) : null}
        </div>
      ) : null}
    </aside>
  )
}
