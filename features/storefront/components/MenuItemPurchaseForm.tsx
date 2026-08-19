"use client"

import { useEffect, useMemo, useState } from "react"
import { Minus, Plus, ShoppingBag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"
import { formatCurrency } from "@/features/storefront/lib/currency"
import { addToCart } from "@/features/storefront/lib/data/cart"
import type {
  MenuItem,
  MenuItemModifier,
  SelectedModifier,
} from "@/features/storefront/lib/store-data"

interface MenuItemPurchaseFormProps {
  item: MenuItem
  currencyCode?: string
  locale?: string
  orderType?: "pickup" | "delivery"
  onAdded?: () => void
  className?: string
}

export function MenuItemPurchaseForm({
  item,
  currencyCode = "USD",
  locale = "en-US",
  orderType = "pickup",
  onAdded,
  className,
}: MenuItemPurchaseFormProps) {
  const router = useRouter()
  const [quantity, setQuantity] = useState(1)
  const [selectedModifiers, setSelectedModifiers] = useState<SelectedModifier[]>([])
  const [specialInstructions, setSpecialInstructions] = useState("")
  const [isAdding, setIsAdding] = useState(false)

  const modifierGroups = useMemo(() => {
    if (!item.modifiers || item.modifiers.length === 0) return []

    const groups: Record<string, MenuItemModifier[]> = {}
    item.modifiers.forEach((modifier) => {
      const groupKey = modifier.modifierGroup || "other"
      if (!groups[groupKey]) {
        groups[groupKey] = []
      }
      groups[groupKey].push(modifier)
    })

    return Object.entries(groups).map(([groupName, modifiers]) => {
      const firstModifier = modifiers[0]
      return {
        id: groupName,
        name:
          firstModifier.modifierGroupLabel ||
          groupName.charAt(0).toUpperCase() + groupName.slice(1),
        required: firstModifier.required || false,
        min: firstModifier.minSelections || 0,
        max: firstModifier.maxSelections || modifiers.length,
        modifiers: modifiers.map((modifier) => ({
          id: modifier.id,
          name: modifier.name,
          price: Number(modifier.priceAdjustment),
          calories: modifier.calories,
          default: modifier.defaultSelected || false,
        })),
      }
    })
  }, [item.modifiers])

  useEffect(() => {
    setQuantity(1)
    setSpecialInstructions("")

    const defaults: SelectedModifier[] = []
    modifierGroups.forEach((group) => {
      group.modifiers.forEach((modifier) => {
        if (modifier.default) {
          defaults.push({
            groupId: group.id,
            modifierId: modifier.id,
            name: modifier.name,
            price: modifier.price,
          })
        }
      })
    })
    setSelectedModifiers(defaults)
  }, [item.id, modifierGroups])

  const toggleModifier = (group: (typeof modifierGroups)[number], modifierId: string) => {
    const modifier = group.modifiers.find((entry) => entry.id === modifierId)
    if (!modifier) return

    const existingIndex = selectedModifiers.findIndex(
      (entry) => entry.groupId === group.id && entry.modifierId === modifierId
    )

    if (existingIndex >= 0) {
      if (
        group.required &&
        selectedModifiers.filter((entry) => entry.groupId === group.id).length <= group.min
      ) {
        return
      }
      setSelectedModifiers((previous) => previous.filter((_, index) => index !== existingIndex))
      return
    }

    const currentGroupCount = selectedModifiers.filter((entry) => entry.groupId === group.id).length
    if (currentGroupCount >= group.max) {
      if (group.max === 1) {
        setSelectedModifiers((previous) => [
          ...previous.filter((entry) => entry.groupId !== group.id),
          {
            groupId: group.id,
            modifierId: modifier.id,
            name: modifier.name,
            price: modifier.price,
          },
        ])
      }
      return
    }

    setSelectedModifiers((previous) => [
      ...previous,
      {
        groupId: group.id,
        modifierId: modifier.id,
        name: modifier.name,
        price: modifier.price,
      },
    ])
  }

  const isModifierSelected = (groupId: string, modifierId: string) => {
    return selectedModifiers.some(
      (entry) => entry.groupId === groupId && entry.modifierId === modifierId
    )
  }

  const modifiersTotal = selectedModifiers.reduce((sum, modifier) => sum + modifier.price, 0)
  const itemTotal = (Number(item.price) + modifiersTotal) * quantity

  const handleAddToCart = async () => {
    if (item.available === false) return

    setIsAdding(true)

    try {
      await addToCart({
        menuItemId: item.id,
        quantity,
        modifierIds: selectedModifiers.map((modifier) => modifier.modifierId),
        specialInstructions: specialInstructions || undefined,
        orderType,
      })

      router.refresh()
      onAdded?.()
    } catch (error) {
      console.error("Error adding to cart:", error)
    }

    setIsAdding(false)
  }

  return (
    <div className={cn("space-y-6 px-5 py-5 sm:px-6", className)}>
      {modifierGroups.length > 0 ? (
        <div className="space-y-6">
          {modifierGroups.map((group) => (
            <div key={group.id} className="space-y-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-medium text-foreground">{group.name}</h3>
                  {group.required ? (
                    <span className="border border-border bg-background px-2 py-0.5 text-xs font-medium text-primary">
                      Required
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">
                  {group.required ? "Choose an option" : "Optional"}
                  {group.max > 1 ? ` · up to ${group.max}` : ""}
                </p>
              </div>

              <div className="space-y-2">
                {group.modifiers.map((modifier) => {
                  const isSelected = isModifierSelected(group.id, modifier.id)
                  const allowsMultiple = group.max > 1

                  return (
                    <button
                      key={modifier.id}
                      type="button"
                      onClick={() => toggleModifier(group, modifier.id)}
                      className={cn(
                        "w-full border px-4 py-3 text-left transition-colors",
                        isSelected
                          ? "border-primary bg-primary/8"
                          : "border-border bg-background hover:border-primary/25"
                      )}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <span
                            className={cn(
                              "flex size-4 items-center justify-center border",
                              allowsMultiple ? "rounded-sm" : "rounded-full",
                              isSelected ? "border-primary" : "border-border"
                            )}
                          >
                            {isSelected ? (
                              <span
                                className={cn(
                                  "size-2 bg-primary",
                                  allowsMultiple ? "rounded-[2px]" : "rounded-full"
                                )}
                              />
                            ) : null}
                          </span>
                          <span className="text-sm font-medium text-foreground">{modifier.name}</span>
                        </div>

                        <div className="text-right text-xs text-muted-foreground">
                          {modifier.calories ? <p>{modifier.calories} cal</p> : null}
                          {modifier.price > 0 ? (
                            <p className="font-medium text-foreground">
                              +{formatCurrency(modifier.price, { currencyCode, locale })}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="space-y-2">
        <h3 className="text-base font-medium text-foreground">Special instructions</h3>
        <Textarea
          placeholder="Add any preparation notes for the kitchen."
          value={specialInstructions}
          onChange={(event) => setSpecialInstructions(event.target.value)}
          className="min-h-24 resize-none border-border bg-background text-sm text-foreground"
          rows={3}
        />
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center">
        <div className="inline-flex self-start items-center border border-border bg-background">
          <button
            type="button"
            className="flex size-11 items-center justify-center text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            disabled={quantity <= 1}
            aria-label="Decrease quantity"
          >
            <Minus className="size-4" />
          </button>
          <span className="w-12 text-center text-base font-semibold tabular-nums text-foreground">
            {quantity}
          </span>
          <button
            type="button"
            className="flex size-11 items-center justify-center text-muted-foreground transition-colors hover:bg-muted"
            onClick={() => setQuantity(quantity + 1)}
            aria-label="Increase quantity"
          >
            <Plus className="size-4" />
          </button>
        </div>

        <Button
          variant="ghost"
          className="h-12 flex-1 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
          onClick={handleAddToCart}
          disabled={isAdding || item.available === false}
        >
          <ShoppingBag className="size-4" />
          {item.available === false
            ? "Currently unavailable"
            : isAdding
              ? "Adding to order..."
              : `Add to order — ${formatCurrency(itemTotal, { currencyCode, locale })}`}
        </Button>
      </div>
    </div>
  )
}
