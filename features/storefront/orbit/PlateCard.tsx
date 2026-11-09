import Link from "next/link"
import type { PlateCard as Card } from "./lib"
import { AddButton } from "./cart"

/** A dish as a plate: the cut-out sits over a pastel arc on a glass card, name in thin over heavy. */
export function PlateCard({ card, showDescription = false }: { card: Card; showDescription?: boolean }) {
  return (
    <article className="o-card o-glass" style={{ "--o-accent": card.accent } as React.CSSProperties}>
      <span className="o-card-arc" aria-hidden="true" />
      {card.plate ? (
        <img className="o-card-plate" src={card.plate} alt="" width={240} height={240} loading="lazy" style={card.cutout ? undefined : { borderRadius: "50%", objectFit: "cover" }} />
      ) : (
        <span className="o-card-plate" aria-hidden="true" style={{ borderRadius: "50%", background: "#fff" }} />
      )}
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
