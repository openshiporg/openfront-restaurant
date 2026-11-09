"use client"

import { useMemo, useState } from "react"
import { formatCurrency } from "@/features/storefront/lib/currency"
import type { MenuItem } from "@/features/storefront/lib/store-data"
import { Minus, Plus, useOrbitCart } from "./cart"

type Group = { id: string; name: string; required: boolean; min: number; max: number; options: Array<{ id: string; name: string; price: number; default: boolean }> }

function groupsOf(item: MenuItem): Group[] {
  const map = new Map<string, Group>()
  for (const m of item.modifiers || []) {
    const key = m.modifierGroup || "other"
    const group = map.get(key) || {
      id: key,
      name: m.modifierGroupLabel || key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " "),
      required: false,
      min: 0,
      max: 0,
      options: [],
    }
    group.required ||= Boolean(m.required)
    group.min = Math.max(group.min, m.minSelections || 0)
    group.max = Math.max(group.max, m.maxSelections || 0)
    group.options.push({ id: m.id, name: m.name, price: Number(m.priceAdjustment || 0), default: Boolean(m.defaultSelected) })
    map.set(key, group)
  }
  return [...map.values()].map((g) => ({ ...g, max: g.max || g.options.length, min: g.required ? Math.max(1, g.min) : g.min }))
}

/** Modifier choices, a note, quantity, and the one dark button that adds the dish to the real cart. */
export function DishForm({ item, money }: { item: MenuItem; money: { currencyCode: string; locale: string } }) {
  const { add } = useOrbitCart()
  const groups = useMemo(() => groupsOf(item), [item])
  const [picked, setPicked] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(groups.map((g) => [g.id, g.options.filter((o) => o.default).map((o) => o.id)])),
  )
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState("")
  const [state, setState] = useState<"idle" | "adding" | "added">("idle")
  const [error, setError] = useState<string | null>(null)

  const toggle = (g: Group, id: string) => {
    setPicked((prev) => {
      const now = prev[g.id] || []
      if (now.includes(id)) {
        if (now.length <= g.min) return prev
        return { ...prev, [g.id]: now.filter((x) => x !== id) }
      }
      if (g.max === 1) return { ...prev, [g.id]: [id] }
      if (now.length >= g.max) return prev
      return { ...prev, [g.id]: [...now, id] }
    })
  }
  const missing = groups.filter((g) => (picked[g.id] || []).length < g.min)
  const extras = groups.flatMap((g) => g.options.filter((o) => (picked[g.id] || []).includes(o.id))).reduce((s, o) => s + o.price, 0)
  const total = (Number(item.price) + extras) * qty
  const soldOut = item.available === false

  return (
    <form
      className="o-form"
      onSubmit={async (e) => {
        e.preventDefault()
        if (soldOut || missing.length) return
        setState("adding")
        setError(null)
        const result = await add({ menuItemId: item.id, quantity: qty, modifierIds: Object.values(picked).flat(), specialInstructions: note.trim() || undefined })
        if (!result.ok) {
          setError(result.message)
          setState("idle")
          return
        }
        setState("added")
        setQty(1)
        setNote("")
        window.setTimeout(() => setState("idle"), 1600)
      }}
    >
      {groups.map((g) => {
        const multi = g.max > 1
        return (
          <fieldset key={g.id}>
            <legend>
              <strong>{g.name}</strong>
              <small data-req={g.min > 0 ? "true" : undefined}>
                {g.min > 0 ? (g.min > 1 ? `Choose ${g.min}` : "Required") : "Optional"}{multi ? `, up to ${g.max}` : ""}
              </small>
            </legend>
            <div className="o-choices" role={multi ? "group" : "radiogroup"} aria-label={g.name}>
              {g.options.map((o) => {
                const on = (picked[g.id] || []).includes(o.id)
                return (
                  <button key={o.id} type="button" className="o-choice" role={multi ? "checkbox" : "radio"} aria-checked={on} onClick={() => toggle(g, o.id)}>
                    <span>{o.name}</span>
                    {o.price > 0 ? <small>+{formatCurrency(o.price, money)}</small> : null}
                  </button>
                )
              })}
            </div>
          </fieldset>
        )
      })}

      <fieldset>
        <legend><strong><label htmlFor={`note-${item.id}`}>Note for the kitchen</label></strong><small>Optional</small></legend>
        <textarea id={`note-${item.id}`} className="o-note" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="No onions, extra crispy…" />
      </fieldset>

      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div className="o-stepper" role="group" aria-label="Quantity">
          <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="One less"><Minus /></button>
          <output aria-live="polite">{qty}</output>
          <button type="button" onClick={() => setQty((q) => Math.min(50, q + 1))} aria-label="One more"><Plus /></button>
        </div>
        <button type="submit" className="o-btn" style={{ flex: "1 1 14rem", minHeight: 54 }} disabled={soldOut || state === "adding" || missing.length > 0}>
          {soldOut ? "Sold out" : state === "adding" ? "Adding…" : state === "added" ? "Added to your order" : `Add to order · ${formatCurrency(total, money)}`}
        </button>
      </div>
      {missing.length ? <p style={{ fontSize: 14, color: "var(--o-ink-soft)", marginTop: 10 }}>Choose {missing.map((g) => g.name.toLowerCase()).join(" and ")} to continue.</p> : null}
      {error ? <p role="alert" className="o-error" style={{ marginTop: 10 }}>{error}</p> : null}
    </form>
  )
}
