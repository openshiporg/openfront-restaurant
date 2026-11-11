import Link from "next/link"
import type { PlateCard as Card } from "./lib"
import { AddButton } from "./cart"
import { arcPath } from "./geometry"

const CARD_ARC = arcPath(196, 344, 200, 236, 176, 44)

/** The dish's picture: its cut-out, else its own photo with soft corners, else its initial on a pastel shape. */
export function DishImage({ src, cutout, name, className, size, priority }: { src: string | null; cutout: boolean; name: string; className?: string; size: number; priority?: boolean }) {
  if (!src) return <span className={`o-noimg ${className || ""}`} aria-hidden="true">{name.trim().charAt(0)}</span>
  return <img className={`${className || ""}${cutout ? "" : " o-photo"}`} src={src} alt="" width={size} height={size} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : undefined} />
}

/** A dish on a glass card: the cut-out floats over a pastel arc, name in thin over heavy. */
export function PlateCard({ card, showDescription = false }: { card: Card; showDescription?: boolean }) {
  return (
    <article className="o-card o-glass" style={{ "--o-accent": card.accent } as React.CSSProperties}>
      <svg className="o-card-arc" viewBox="0 0 400 400" aria-hidden="true"><path d={CARD_ARC} /></svg>
      <DishImage className="o-card-dish" src={card.plate} cutout={card.cutout} name={card.name} size={240} />
      <h3 className="o-card-name">
        <Link href={card.href} className="o-card-link" aria-label={`${card.name}, ${card.price}`} />
        <span className="o-thin">{card.thin}</span>
        <span className="o-heavy">{card.heavy}</span>
      </h3>
      {showDescription && card.description ? <p className="o-card-desc">{card.description}</p> : null}
      <div className="o-card-foot">
        <span className="o-price">{card.price}</span>
        <AddButton id={card.id} name={card.name} needsChoice={card.needsChoice} defaultModifierIds={card.defaultModifierIds} soldOut={card.soldOut} />
      </div>
    </article>
  )
}
