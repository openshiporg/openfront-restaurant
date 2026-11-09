"use client"

import { useLayoutEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { addToCart } from "@/features/storefront/lib/data/cart"
import { getMenuItemHref } from "@/features/storefront/lib/menu-item-utils"
import { DishOrbitCarousel, type Dish } from "./DishOrbitCarousel"

export type OrbitDish = Dish & {
  id: string
  needsChoice: boolean
  defaultModifierIds: string[]
}

/** The home page's pinned dish carousel. "Order food" puts the showing dish in the real cart. */
export function HomeOrbit({ dishes, backdrop }: { dishes: OrbitDish[]; backdrop?: string }) {
  const router = useRouter()
  const [state, setState] = useState<"idle" | "adding" | "added" | "error">("idle")
  const timer = useRef<number | undefined>(undefined)
  const host = useRef<HTMLDivElement>(null)

  // The stage fills what the sticky header and the phone tab bar leave.
  useLayoutEffect(() => {
    const header = document.querySelector<HTMLElement>(".storefront-ui .sticky")
    const el = host.current
    if (!el) return
    const set = () => el.style.setProperty("--sf-nav", `${header?.offsetHeight ?? 80}px`)
    set()
    const ro = header ? new ResizeObserver(set) : null
    if (header) ro?.observe(header)
    return () => ro?.disconnect()
  }, [])

  const order = async (_dish: Dish, index: number) => {
    const dish = dishes[index]
    if (!dish || state === "adding") return
    if (dish.needsChoice) {
      router.push(getMenuItemHref(dish.id))
      return
    }
    setState("adding")
    try {
      const result = await addToCart({ menuItemId: dish.id, quantity: 1, modifierIds: dish.defaultModifierIds })
      setState(result.success ? "added" : "error")
      if (result.success) router.refresh()
    } catch {
      setState("error")
    }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setState("idle"), 1800)
  }

  return (
    <div ref={host} className="orbit-host">
      <DishOrbitCarousel
        dishes={dishes}
        backdrop={backdrop}
        height="calc(100svh - var(--sf-nav) - var(--sf-bottom))"
        loop={false}
        searchHref="#menu"
        detailsLabel="Options"
        orderLabel={state === "adding" ? "Adding…" : state === "added" ? "Added to order" : state === "error" ? "Try again" : "Order food"}
        orderBusy={state === "adding"}
        onOrder={order}
      />
      <p className="sr-only" role="status">{state === "added" ? "Added to your order" : state === "error" ? "Couldn't add that. Try again." : ""}</p>
    </div>
  )
}
