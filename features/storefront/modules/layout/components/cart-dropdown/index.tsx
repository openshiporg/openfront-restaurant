"use client"

import { useEffect, useRef, useState, type CSSProperties } from "react"
import { ArrowRight, ShoppingBag } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { formatCurrency } from "@/features/storefront/lib/currency"
import { updateLineItem, removeLineItem } from "@/features/storefront/lib/data/cart"
import { useRouter } from "next/navigation"
import LineItemDisplay from "@/features/storefront/modules/common/components/line-item-display"

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
        className="relative inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        aria-label="Open cart"
      >
        <span className="hidden sm:inline">Order</span>
        <span className="relative">
          <ShoppingBag className="size-4" />
          {itemCount > 0 ? (
            <span className="absolute -right-2 -top-2 flex size-4 items-center justify-center rounded-full bg-background text-[10px] font-semibold text-foreground">
              {itemCount > 9 ? "9+" : itemCount}
            </span>
          ) : null}
        </span>
      </button>

      <Sheet open={isCartOpen} onOpenChange={setIsCartOpen}>
        <SheetContent
          className="flex w-full max-w-xl flex-col border-l border-border bg-background p-0 sm:max-w-xl"
          style={{
            "--primary": `oklch(0.55 0.22 ${brandHue})`,
            "--ring": `oklch(0.55 0.12 ${brandHue})`,
          } as CSSProperties}
        >
          <SheetHeader className="border-b border-border px-6 py-5 text-left">
            <SheetTitle className="font-serif text-2xl font-semibold text-foreground">Your order</SheetTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Review items, adjust quantities, and continue to checkout.
            </p>
          </SheetHeader>

          {items.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <div className="flex size-16 items-center justify-center rounded-full border border-border bg-muted">
                <ShoppingBag className="size-7 text-muted-foreground" />
              </div>
              <p className="mt-5 font-serif text-2xl font-semibold text-foreground">Your order is empty</p>
              <p className="mt-2 max-w-xs text-base leading-7 text-muted-foreground">
                Browse the menu and add something fresh from the kitchen.
              </p>
              <button
                type="button"
                onClick={() => setIsCartOpen(false)}
                className="mt-6 rounded-full border border-border bg-background px-5 py-3 text-sm font-medium text-foreground transition-colors hover:border-primary/30 hover:text-primary"
              >
                Browse menu
              </button>
            </div>
          ) : (
            <>
              <ScrollArea className="flex-1">
                <div className="px-6 py-4">
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

              <div className="border-t border-border bg-muted/50 p-6">
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-medium tabular-nums text-foreground">
                      {formatCurrency(subtotal, currencyConfig)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Tax (estimated)</span>
                    <span className="font-medium tabular-nums text-foreground">
                      {formatCurrency(subtotal * 0.0875, currencyConfig)}
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                  <span className="text-base font-medium text-foreground">Total</span>
                  <span className="text-base font-semibold tabular-nums text-foreground">
                    {formatCurrency(subtotal * 1.0875, currencyConfig)}
                  </span>
                </div>

                <button
                  type="button"
                  className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-none bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  onClick={() => {
                    setIsCartOpen(false)
                    router.push("/checkout?step=contact")
                  }}
                >
                  Proceed to checkout
                  <ArrowRight className="size-4" />
                </button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
