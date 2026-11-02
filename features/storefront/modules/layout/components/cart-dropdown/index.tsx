"use client"

import { useEffect, useRef, useState } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { formatCurrency } from "@/features/storefront/lib/currency"
import { updateLineItem, removeLineItem } from "@/features/storefront/lib/data/cart"
import { useRouter } from "next/navigation"
import LineItemDisplay from "@/features/storefront/modules/common/components/line-item-display"
import { storefrontFont } from "@/features/storefront/lib/fonts"
import { ShoppingBag, ShoppingCart } from "lucide-react"

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
        className="relative hidden size-11 place-items-center rounded-full text-ink md:grid transition-colors hover:bg-mint active:scale-95"
        aria-label={itemCount > 0 ? `Open order bag, ${itemCount} item${itemCount === 1 ? "" : "s"}` : "Open order bag"}
      >
        <ShoppingBag className="size-6" strokeWidth={1.75} aria-hidden="true" />
        {itemCount > 0 ? (
          <span key={itemCount} className="ticket-drop absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-leaf px-1 text-xs font-semibold leading-5 text-white">
            {itemCount > 99 ? "99+" : itemCount}
          </span>
        ) : null}
      </button>

      {itemCount > 0 ? (
        <button
          type="button"
          onClick={() => setIsCartOpen(true)}
          className="fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom))] right-4 z-40 inline-flex h-11 items-center gap-2.5 rounded-full bg-white pl-5 pr-4 text-[0.95rem] font-medium tabular-nums text-ink shadow-[0_8px_30px_rgb(0_0_0/0.14)] transition-transform active:scale-95 md:hidden"
          aria-label={`Open order bag, ${formatCurrency(subtotal, { currencyCode, locale })}`}
        >
          {formatCurrency(subtotal, { currencyCode, locale })}
          <ShoppingCart className="size-5 text-leaf" strokeWidth={2} aria-hidden="true" />
        </button>
      ) : null}

      <Sheet open={isCartOpen} onOpenChange={setIsCartOpen}>
        <SheetContent
          className={`storefront-sheet ${storefrontFont.variable} flex w-full max-w-md flex-col gap-0 border-0 bg-white p-0 text-ink sm:max-w-md`}
        >
          <SheetHeader className="px-6 pb-4 pt-6 text-left">
            <SheetTitle className="flex items-center gap-3 font-serif text-3xl font-bold leading-none text-ink">
              <ShoppingBag className="size-7" strokeWidth={1.75} aria-hidden="true" />
              Your order bag
            </SheetTitle>
            {itemCount > 0 ? (
              <p className="text-base text-ink-soft">{itemCount} item{itemCount === 1 ? "" : "s"}</p>
            ) : null}
          </SheetHeader>

          {items.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 pb-16">
              <div className="flex w-full flex-col items-center rounded-2xl bg-mint px-6 py-12 text-center">
                <ShoppingBag className="size-12 text-leaf" strokeWidth={1.5} aria-hidden="true" />
                <p className="mt-5 text-xl font-medium text-ink">Your order bag is empty</p>
                <p className="mt-1.5 max-w-[26ch] text-pretty text-[0.95rem] text-ink-soft">Add something delicious to get started.</p>
              </div>
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
                <div className="mx-4 divide-y divide-border sm:mx-6">
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

              <div className="mx-4 mb-4 border-t border-border pb-5 pt-4 sm:mx-6 sm:mb-6">
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
                    <dt className="text-xl font-semibold text-ink">Estimated total</dt>
                    <dd className="text-xl font-semibold text-leaf">{formatCurrency(subtotal * 1.0875, currencyConfig)}</dd>
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
                  Go to checkout
                </button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
