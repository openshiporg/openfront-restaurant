"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2, Plus } from "lucide-react"
import { addToCart } from "@/features/storefront/lib/data/cart"
import { getMenuItemHref } from "@/features/storefront/lib/menu-item-utils"
import { cn } from "@/lib/utils"

/**
 * The round "+" on a menu tile. Dishes that need a choice open their page;
 * the rest go straight into the bag with their default options.
 */
export function QuickAdd({
  itemId,
  name,
  needsChoice,
  defaultModifierIds = [],
  soldOut,
  variant = "solid",
  className,
}: {
  itemId: string
  name: string
  needsChoice: boolean
  defaultModifierIds?: string[]
  soldOut: boolean
  variant?: "solid" | "light"
  className?: string
}) {
  const router = useRouter()
  const [state, setState] = useState<"idle" | "adding" | "added">("idle")
  const [error, setError] = useState<string | null>(null)

  if (soldOut) return null

  return (
    <>
      <button
        type="button"
        aria-label={needsChoice ? `Choose options for ${name}` : `Add ${name} to your order`}
        disabled={state === "adding"}
        onClick={async (event) => {
          event.preventDefault()
          event.stopPropagation()
          if (needsChoice) {
            router.push(getMenuItemHref(itemId))
            return
          }
          setState("adding")
          setError(null)
          try {
            const result = await addToCart({ menuItemId: itemId, quantity: 1, modifierIds: defaultModifierIds })
            if (!result.success) {
              setError(result.message)
              setState("idle")
              return
            }
            setState("added")
            router.refresh()
            window.setTimeout(() => setState("idle"), 1400)
          } catch {
            setError("Couldn't add that. Try again.")
            setState("idle")
          }
        }}
        className={cn(
          "relative z-10 grid size-10 shrink-0 place-items-center rounded-full transition-transform duration-150 active:scale-90",
          variant === "solid" ? "bg-leaf text-white hover:bg-[color-mix(in_oklch,var(--leaf)_86%,black)]" : "bg-white text-ink shadow-sm hover:bg-mint",
          className,
        )}
      >
        {state === "adding" ? <Loader2 className="size-5 animate-spin" /> : state === "added" ? <Check className="size-5" strokeWidth={2.5} /> : <Plus className="size-5" strokeWidth={2.5} />}
      </button>
      {error ? <span role="alert" className="sr-only">{error}</span> : null}
    </>
  )
}
