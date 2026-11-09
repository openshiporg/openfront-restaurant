"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { addToCart, removeLineItem, updateLineItem } from "@/features/storefront/lib/data/cart"
import { formatCurrency } from "@/features/storefront/lib/currency"
import { getMenuItemHref } from "@/features/storefront/lib/menu-item-utils"
import { storefrontFont } from "@/features/storefront/lib/fonts"

export type OrbitCartLine = {
  id: string
  quantity: number
  specialInstructions?: string | null
  menuItem: { id: string; name: string; price: number | string; thumbnail?: string | null }
  modifiers?: Array<{ id: string; name: string; priceAdjustment: number | string }>
}
export type OrbitCart = { id: string; items: OrbitCartLine[]; subtotal?: number | string } | null

type Money = { currencyCode: string; locale: string }

type CartApi = {
  count: number
  open: () => void
  add: (input: { menuItemId: string; quantity?: number; modifierIds?: string[]; specialInstructions?: string }) => Promise<{ ok: true } | { ok: false; message: string }>
}

const CartContext = createContext<CartApi | null>(null)
export function useOrbitCart() {
  const api = useContext(CartContext)
  if (!api) throw new Error("useOrbitCart outside OrbitCartProvider")
  return api
}

const lineTotal = (line: OrbitCartLine) =>
  (Number(line.menuItem?.price || 0) + (line.modifiers || []).reduce((sum, m) => sum + Number(m.priceAdjustment || 0), 0)) * line.quantity

const Bag = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></svg>
)
const Close = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
)
export const Plus = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
)
export const Minus = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14" /></svg>
)

/** Holds the real cart for the whole storefront: the header button, the drawer, and every add button. */
export function OrbitCartProvider({
  cart,
  money,
  plates,
  children,
}: {
  cart: OrbitCart
  money: Money
  /** Menu item id -> plate cut-out, so the drawer shows the same plates as the menu. */
  plates: Record<string, string>
  children: React.ReactNode
}) {
  const router = useRouter()
  const [isOpen, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const lastFocus = useRef<HTMLElement | null>(null)
  const panel = useRef<HTMLDivElement | null>(null)
  useEffect(() => setMounted(true), [])

  const items = cart?.items || []
  const count = items.reduce((sum, line) => sum + line.quantity, 0)
  const subtotal = items.reduce((sum, line) => sum + lineTotal(line), 0)

  const open = useCallback(() => {
    lastFocus.current = document.activeElement as HTMLElement | null
    setOpen(true)
  }, [])
  const close = useCallback(() => {
    setOpen(false)
    lastFocus.current?.focus?.()
  }, [])

  // While the drawer is open: Escape closes it and focus stays inside. The page behind keeps its own scroll position.
  useEffect(() => {
    if (!isOpen) return
    panel.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
      if (e.key === "Tab" && panel.current) {
        const nodes = panel.current.querySelectorAll<HTMLElement>("a[href],button:not([disabled]),[tabindex]:not([tabindex='-1'])")
        if (!nodes.length) return
        const first = nodes[0]
        const last = nodes[nodes.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [isOpen, close])

  const add: CartApi["add"] = useCallback(async (input) => {
    try {
      const result = await addToCart({ menuItemId: input.menuItemId, quantity: input.quantity ?? 1, modifierIds: input.modifierIds || [], specialInstructions: input.specialInstructions })
      if (!result.success) return { ok: false as const, message: result.message }
      router.refresh()
      lastFocus.current = document.activeElement as HTMLElement | null
      setOpen(true)
      return { ok: true as const }
    } catch {
      return { ok: false as const, message: "That couldn't be added. Try again." }
    }
  }, [router])

  const setQty = async (line: OrbitCartLine, quantity: number) => {
    setBusy(line.id)
    try {
      if (quantity < 1) await removeLineItem({ cartId: cart?.id || "", lineId: line.id })
      else await updateLineItem({ cartId: cart?.id || "", lineId: line.id, quantity })
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  const drawer = isOpen ? (
    <>
      <div className="o-drawer-backdrop" onClick={close} aria-hidden="true" />
      <div ref={panel} className={`o-drawer orbit-ui ${storefrontFont.variable}`} role="dialog" aria-modal="true" aria-labelledby="o-bag-title" tabIndex={-1}>
        <div className="o-drawer-head">
          <div>
            <h2 id="o-bag-title" className="o-split o-split-md"><span className="o-thin">Your</span><span className="o-heavy">Order</span></h2>
            <p className="o-lede" style={{ marginTop: 6, fontSize: 14 }}>{count ? `${count} item${count === 1 ? "" : "s"}` : "Nothing in it yet"}</p>
          </div>
          <button type="button" className="o-icon-btn" onClick={close} aria-label="Close your order">
            <Close />
          </button>
        </div>
        <div className="o-drawer-body">
          {items.length === 0 ? (
            <div style={{ padding: "2rem 0", textAlign: "center" }}>
              <p className="o-lede" style={{ marginInline: "auto" }}>Pick a dish from the menu and it lands here.</p>
              <Link href="/menu" className="o-btn" style={{ marginTop: 18 }} onClick={() => setOpen(false)}>Browse the menu</Link>
            </div>
          ) : (
            items.map((line) => {
              const plate = plates[line.menuItem.id] || line.menuItem.thumbnail || ""
              const mods = (line.modifiers || []).map((m) => m.name).join(" · ")
              return (
                <div key={line.id} className="o-line" aria-busy={busy === line.id}>
                  <Link href={getMenuItemHref(line.menuItem.id)} onClick={() => setOpen(false)} tabIndex={-1} aria-hidden="true">
                    {plate ? <img src={plate} alt="" width={64} height={64} /> : <span />}
                  </Link>
                  <div style={{ minWidth: 0 }}>
                    <p className="o-line-name">{line.menuItem.name}</p>
                    {mods || line.specialInstructions ? <p className="o-line-mods">{[mods, line.specialInstructions ? `“${line.specialInstructions}”` : ""].filter(Boolean).join(" · ")}</p> : <p className="o-line-mods" />}
                    <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                      <div className="o-stepper">
                        <button type="button" disabled={busy === line.id} onClick={() => setQty(line, line.quantity - 1)} aria-label={line.quantity === 1 ? `Remove ${line.menuItem.name}` : `One less ${line.menuItem.name}`}><Minus /></button>
                        <output aria-live="polite">{line.quantity}</output>
                        <button type="button" disabled={busy === line.id} onClick={() => setQty(line, line.quantity + 1)} aria-label={`One more ${line.menuItem.name}`}><Plus /></button>
                      </div>
                      <button type="button" className="o-remove" disabled={busy === line.id} onClick={() => setQty(line, 0)}>Remove</button>
                    </div>
                  </div>
                  <span className="o-line-price">{formatCurrency(lineTotal(line), money)}</span>
                </div>
              )
            })
          )}
        </div>
        {items.length ? (
          <div className="o-drawer-foot">
            <dl className="o-totals">
              <div className="o-total"><dt>Subtotal</dt><dd>{formatCurrency(subtotal, money)}</dd></div>
            </dl>
            <p style={{ fontSize: 13, color: "var(--o-ink-soft)", margin: "-0.5rem 0 1rem" }}>Tax, tip and any pickup discount are worked out at checkout.</p>
            <Link href="/checkout?step=contact" className="o-btn o-btn-wide" onClick={() => setOpen(false)}>
              Checkout
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </Link>
          </div>
        ) : null}
      </div>
    </>
  ) : null

  return (
    <CartContext.Provider value={{ count, open, add }}>
      {children}
      {mounted && drawer ? createPortal(drawer, document.body) : null}
      {mounted && count > 0 && !isOpen ? createPortal(
        <button type="button" className={`o-floating orbit-ui ${storefrontFont.variable}`} onClick={open} aria-label={`Open your order, ${count} item${count === 1 ? "" : "s"}, ${formatCurrency(subtotal, money)}`}>
          <Bag />
          <span>View order · {formatCurrency(subtotal, money)}</span>
        </button>,
        document.body,
      ) : null}
    </CartContext.Provider>
  )
}

export function CartButton() {
  const { count, open } = useOrbitCart()
  return (
    <button type="button" className="o-cart-btn" onClick={open} aria-label={count ? `Your order, ${count} item${count === 1 ? "" : "s"}` : "Your order"}>
      <Bag />
      <span className="o-cart-label">Cart{count ? ` (${count})` : ""}</span>
    </button>
  )
}

/** The round + on a plate card. Dishes needing a choice open their page; the rest go straight in. */
export function AddButton({ id, name, needsChoice, defaultModifierIds, soldOut }: { id: string; name: string; needsChoice: boolean; defaultModifierIds: string[]; soldOut?: boolean }) {
  const router = useRouter()
  const { add } = useOrbitCart()
  const [state, setState] = useState<"idle" | "adding" | "error">("idle")
  if (soldOut) return <span className="o-tag">Sold out</span>
  return (
    <>
      <button
        type="button"
        className="o-plus"
        disabled={state === "adding"}
        aria-label={needsChoice ? `Choose options for ${name}` : `Add ${name} to your order`}
        onClick={async (e) => {
          e.preventDefault()
          e.stopPropagation()
          if (needsChoice) return router.push(getMenuItemHref(id))
          setState("adding")
          const result = await add({ menuItemId: id, modifierIds: defaultModifierIds })
          setState(result.ok ? "idle" : "error")
        }}
      >
        {state === "adding" ? <span aria-hidden="true" style={{ width: 16, height: 16, borderRadius: 99, border: "2px solid #fff", borderRightColor: "transparent", animation: "spin .8s linear infinite" }} /> : <Plus />}
      </button>
      {state === "error" ? <span role="alert" className="dsh-sr">Couldn&apos;t add {name}. Try again.</span> : null}
    </>
  )
}
