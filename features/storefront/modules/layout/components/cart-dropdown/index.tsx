"use client"

import { useEffect, useRef, useState, type CSSProperties } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { formatCurrency } from "@/features/storefront/lib/currency"
import { updateLineItem, removeLineItem } from "@/features/storefront/lib/data/cart"
import { useRouter } from "next/navigation"
import LineItemDisplay from "@/features/storefront/modules/common/components/line-item-display"
import { storefrontFont } from "@/features/storefront/lib/fonts"

interface CartItem {
  id: string
  quantity: number
  specialInstructions?: string
  menuItem: {
    id: string
    name: string
    price: number
    thumbnail?: string | null
  }
  modifiers: Array<{
    id: string
    name: string
    priceAdjustment: number
  }>
}

export interface CartData {
  id: string
  orderType?: string
  subtotal: number
  items: CartItem[]
}

interface CartDropdownProps {
  cart: CartData | null
  currencyCode: string
  locale: string
  brandHue: string
}

export default function CartDropdown({ cart, currencyCode, locale, brandHue }: CartDropdownProps) {
  const router = useRouter()
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)

  const items = cart?.items || []
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0)
  const subtotal = cart?.subtotal || 0

  const prevItemCount = useRef(itemCount)
  useEffect(() => {
    if (itemCount > prevItemCount.current) {
      setIsCartOpen(true)
    }
    prevItemCount.current = itemCount
  }, [itemCount])

  const handleUpdateQuantity = async (cartItemId: string, quantity: number) => {
    if (quantity < 1) return
    setIsUpdating(true)
    try {
      await updateLineItem({ cartId: cart?.id || "", lineId: cartItemId, quantity })
      router.refresh()
    } catch (error) {
      console.error("Error updating quantity:", error)
    }
    setIsUpdating(false)
  }

  const handleRemoveItem = async (cartItemId: string) => {
    setIsUpdating(true)
    try {
      await removeLineItem({ cartId: cart?.id || "", lineId: cartItemId })
      router.refresh()
    } catch (error) {
      console.error("Error removing item:", error)
    }
    setIsUpdating(false)
  }

  const currencyConfig = { currencyCode, locale }

  return (
    <>
      <button
        onClick={() => setIsCartOpen(true)}
        className="ticket relative ml-1 inline-flex h-12 items-start gap-2 px-3.5 pt-2.5 text-left transition-transform duration-150 active:scale-[0.97]"
        aria-label={itemCount > 0 ? `Open order, ${itemCount} item${itemCount === 1 ? "" : "s"}` : "Open order"}
      >
        <span key={itemCount} className={itemCount > 0 ? "ticket-drop flex w-full items-baseline justify-between gap-3" : "flex w-full items-baseline justify-between gap-3"}>
          <span className="font-serif text-lg font-extrabold leading-none">Order</span>
          {itemCount > 0 ? (
            <span className="flex items-baseline gap-2 leading-none">
              <span className="text-[0.95rem] font-semibold">{itemCount > 99 ? "99+" : itemCount}</span>
              <span className="hidden text-[0.95rem] text-ink-soft sm:inline">{formatCurrency(subtotal, { currencyCode, locale })}</span>
            </span>
          ) : null}
        </span>
      </button>

      <Sheet open={isCartOpen} onOpenChange={setIsCartOpen}>
        <SheetContent
          className={`storefront-sheet ${storefrontFont.variable} flex w-full max-w-lg flex-col gap-0 border-0 bg-steel p-0 text-ink sm:max-w-lg`}
          style={{
            "--primary": `oklch(0.47 0.2 ${brandHue})`,
            "--ring": `oklch(0.47 0.2 ${brandHue})`,
          } as CSSProperties}
        >
          <SheetHeader className="px-6 pb-4 pt-6 text-left">
            <SheetTitle className="font-serif text-4xl font-extrabold leading-none text-ink">
              Your order
            </SheetTitle>
            {itemCount > 0 ? (
              <p className="text-base text-ink-soft">{itemCount} item{itemCount === 1 ? "" : "s"}</p>
            ) : null}
          </SheetHeader>

          {items.length === 0 ? (
            <div className="flex flex-1 flex-col items-start justify-center px-6 pb-16">
              <p className="font-serif text-3xl font-extrabold text-ink">Nothing on the ticket yet</p>
              <p className="mt-2 max-w-[34ch] text-pretty text-base text-ink-soft">
                Pick a dish and it lands here, ready for pickup or delivery.
              </p>
              <button
                type="button"
                onClick={() => {
                  setIsCartOpen(false)
                  // Off the home page, closing the sheet alone leaves the guest where they were.
                  if (window.location.pathname !== "/") router.push("/#menu")
                }}
                className="pass-action mt-6"
              >
                Browse the menu
              </button>
            </div>
          ) : (
            <>
              <ScrollArea className="min-h-0 flex-1">
                <div className="ticket-top mx-4 bg-paper px-5 pb-2 sm:mx-6">
                  {items.map((item) => (
                    <LineItemDisplay
                      key={item.id}
                      item={item}
                      currencyCode={currencyCode}
                      locale={locale}
                      editable
                      isUpdating={isUpdating}
                      onRemove={handleRemoveItem}
                      onIncrease={handleUpdateQuantity}
                      onDecrease={handleUpdateQuantity}
                      className="py-5"
                    />
                  ))}
                </div>
              </ScrollArea>

              <div className="mx-4 mb-4 bg-paper px-5 pb-5 pt-4 sm:mx-6 sm:mb-6">
                <dl className="space-y-1.5 text-base">
                  <div className="flex items-center justify-between">
                    <dt className="text-ink-soft">Subtotal</dt>
                    <dd className="font-medium text-ink">{formatCurrency(subtotal, currencyConfig)}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-ink-soft">Tax (estimated)</dt>
                    <dd className="font-medium text-ink">{formatCurrency(subtotal * 0.0875, currencyConfig)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between pt-2">
                    <dt className="font-serif text-2xl font-extrabold text-ink">Total</dt>
                    <dd className="font-serif text-2xl font-extrabold text-ink">{formatCurrency(subtotal * 1.0875, currencyConfig)}</dd>
                  </div>
                </dl>

                <button
                  type="button"
                  className="pass-action mt-5 w-full"
                  onClick={() => {
                    setIsCartOpen(false)
                    router.push("/checkout?step=contact")
                  }}
                >
                  Checkout
                </button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
