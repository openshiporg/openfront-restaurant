"use client"

import { useEffect, useMemo, useState } from "react"
import { Minus, Plus } from "lucide-react"
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
  const [addError, setAddError] = useState<string | null>(null)

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
    setAddError(null)

    try {
      const result = await addToCart({
        menuItemId: item.id,
        quantity,
        modifierIds: selectedModifiers.map((modifier) => modifier.modifierId),
        specialInstructions: specialInstructions || undefined,
        orderType,
      })

      if (!result.success) {
        setAddError(result.message)
      } else {
        router.refresh()
        onAdded?.()
      }
    } catch (error) {
      console.error("Error adding to cart:", error)
      setAddError("This item couldn't be added to your order. Try again.")
    }

    setIsAdding(false)
  }

  const ticketLines = selectedModifiers.map((modifier) => ({
    key: `${modifier.groupId}-${modifier.modifierId}`,
    name: modifier.name,
    price: modifier.price,
  }))

  return (
    <div className={cn("space-y-8 px-5 py-5 sm:px-6", className)}>
      {modifierGroups.length > 0 ? (
        <div className="space-y-8">
          {modifierGroups.map((group) => (
            <fieldset key={group.id}>
              <legend className="flex w-full items-baseline justify-between gap-3">
                <span className="font-serif text-2xl font-extrabold">{group.name}</span>
                <span className={cn("text-[0.95rem]", group.required ? "font-semibold text-ink" : "text-ink-soft")}>
                  {group.required ? "Required" : "Optional"}
                  {group.max > 1 ? `, up to ${group.max}` : ""}
                </span>
              </legend>

              <div className="mt-3 space-y-1">
                {group.modifiers.map((modifier) => {
                  const isSelected = isModifierSelected(group.id, modifier.id)
                  const allowsMultiple = group.max > 1

                  return (
                    <button
                      key={modifier.id}
                      type="button"
                      role={allowsMultiple ? "checkbox" : "radio"}
                      aria-checked={isSelected}
                      onClick={() => toggleModifier(group, modifier.id)}
                      className={cn(
                        "flex w-full items-center justify-between gap-4 px-3 py-3 text-left transition-colors duration-150 active:scale-[0.99]",
                        isSelected ? "bg-ink text-paper" : "bg-steel/45 text-ink hover:bg-steel",
                      )}
                    >
                      <span className="flex items-center gap-3">
                        <span
                          aria-hidden="true"
                          className={cn(
                            "flex size-5 shrink-0 items-center justify-center",
                            allowsMultiple ? "" : "rounded-full",
                            isSelected ? "bg-paper" : "bg-paper ring-1 ring-inset ring-steel-deep",
                          )}
                        >
                          {isSelected ? (
                            <span className={cn("size-2.5 bg-ink", allowsMultiple ? "" : "rounded-full")} />
                          ) : null}
                        </span>
                        <span className="text-base font-medium">{modifier.name}</span>
                      </span>

                      <span className={cn("shrink-0 text-right text-[0.95rem]", isSelected ? "text-paper/80" : "text-ink-soft")}>
                        {modifier.price > 0 ? (
                          <span className={cn("font-semibold", isSelected ? "text-paper" : "text-ink")}>
                            +{formatCurrency(modifier.price, { currencyCode, locale })}
                          </span>
                        ) : null}
                        {modifier.calories ? <span className="block">{modifier.calories} cal</span> : null}
                      </span>
                    </button>
                  )
                })}
              </div>
            </fieldset>
          ))}
        </div>
      ) : null}

      <div>
        <label htmlFor={`instructions-${item.id}`} className="font-serif text-2xl font-extrabold">
          Note for the kitchen
        </label>
        <Textarea
          id={`instructions-${item.id}`}
          placeholder="Optional"
          value={specialInstructions}
          onChange={(event) => setSpecialInstructions(event.target.value)}
          className="mt-3 min-h-20 resize-none rounded-none border-0 bg-steel/45 text-base text-ink shadow-none placeholder:text-ink-soft focus-visible:ring-2 focus-visible:ring-ring"
          rows={2}
        />
      </div>

      {ticketLines.length > 0 || specialInstructions ? (
        <div className="text-base" aria-live="polite">
          <p className="font-semibold">{quantity} × {item.name}</p>
          {ticketLines.map((line) => (
            <p key={line.key} className="flex justify-between gap-4 text-ink-soft">
              <span>+ {line.name}</span>
              {line.price > 0 ? <span>{formatCurrency(line.price * quantity, { currencyCode, locale })}</span> : null}
            </p>
          ))}
          {specialInstructions ? <p className="text-ink-soft">Note: {specialInstructions}</p> : null}
        </div>
      ) : null}

      <div className="flex items-stretch gap-3">
        <div className="inline-flex shrink-0 items-center bg-steel">
          <button
            type="button"
            className="flex h-12 w-10 items-center justify-center text-ink transition-colors hover:bg-steel-shade disabled:opacity-40"
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            disabled={quantity <= 1}
            aria-label="Decrease quantity"
          >
            <Minus className="size-4" />
          </button>
          <span className="w-8 text-center text-lg font-semibold tabular-nums text-ink" aria-live="polite">
            {quantity}
          </span>
          <button
            type="button"
            className="flex h-12 w-10 items-center justify-center text-ink transition-colors hover:bg-steel-shade"
            onClick={() => setQuantity(quantity + 1)}
            aria-label="Increase quantity"
          >
            <Plus className="size-4" />
          </button>
        </div>

        <button
          type="button"
          className="pass-action min-w-0 flex-1 justify-between gap-3 whitespace-nowrap px-4 sm:px-5"
          onClick={handleAddToCart}
          disabled={isAdding || item.available === false}
        >
          {item.available === false ? (
            <span>Sold out</span>
          ) : (
            <>
              <span>{isAdding ? "Adding…" : "Add to order"}</span>
              <span>{formatCurrency(itemTotal, { currencyCode, locale })}</span>
            </>
          )}
        </button>
      </div>

      {addError ? (
        <p role="alert" className="text-base font-medium text-destructive">
          {addError}
        </p>
      ) : null}
    </div>
  )
}
