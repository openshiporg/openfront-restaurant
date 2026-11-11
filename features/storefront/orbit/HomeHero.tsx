"use client"

import { DishOrbit, type OrbitDish } from "./DishOrbit"
import { useOrbitCart } from "./cart"

/** The dish orbit at the top of the home page. Its card puts the showing dish, with the chosen options, in the real cart. */
export function HomeHero({ dishes, money }: { dishes: OrbitDish[]; money: { currencyCode: string; locale: string } }) {
  const { add } = useOrbitCart()
  return (
    <DishOrbit
      dishes={dishes}
      money={money}
      onAdd={async (dish, modifierIds) => {
        const result = await add({ menuItemId: dish.id, modifierIds })
        return result.ok ? { ok: true } : { ok: false, message: result.message }
      }}
    />
  )
}
