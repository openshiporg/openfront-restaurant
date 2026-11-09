"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { DishOrbit, type OrbitDish } from "./DishOrbit"
import { useOrbitCart } from "./cart"

/** The dish orbit at the top of the home page. "Order food" puts the showing dish in the real cart. */
export function HomeHero({ dishes, backdrop }: { dishes: OrbitDish[]; backdrop?: string }) {
  const router = useRouter()
  const { add } = useOrbitCart()
  const [state, setState] = useState<{ id: string; s: "adding" | "error" } | null>(null)

  return (
    <>
      <DishOrbit
        dishes={dishes}
        backdrop={backdrop}
        orderBusy={state?.s === "adding"}
        orderLabel={(dish) => (state?.id === dish.id ? (state.s === "adding" ? "Adding…" : "Try again") : dish.needsChoice ? "Choose & order" : "Order food")}
        onOrder={async (dish) => {
          if (dish.needsChoice) return router.push(dish.href)
          setState({ id: dish.id, s: "adding" })
          const result = await add({ menuItemId: dish.id, modifierIds: dish.defaultModifierIds })
          setState(result.ok ? null : { id: dish.id, s: "error" })
        }}
      />
      <p className="dsh-sr" role="status">{state?.s === "error" ? "Couldn't add that. Try again." : ""}</p>
    </>
  )
}
