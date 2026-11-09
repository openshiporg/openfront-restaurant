"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import Link from "next/link"
import { gsap } from "gsap"
import { arcPath } from "./geometry"

export { arcPath }

/*
 * Dish Orbit: the storefront hero, built from the owner's DishOrbitCarousel.
 * The plated dish sits on the left; changing dish swings it out over the top on
 * a wide orbit while the next plate swings in from the other side. The two-weight
 * title wipes out and back in, the glass card cross-fades, and the pastel arc
 * turns and takes the dish's colour.
 *
 * It never touches the page scroll. The stage is an ordinary block in the page
 * flow: no pinning, no scroll-driven progress, no wheel or touchmove listeners.
 * Dishes change only from the arrows, the thumbnails, the side pager, the arrow
 * keys, a horizontal swipe on the stage (touch-action: pan-y keeps vertical
 * swipes scrolling the page), and a slow autoplay that pauses on hover, focus or
 * touch and stops for good once the guest picks a dish themselves.
 */

export type OrbitDish = {
  id: string
  /** The thin first title line, e.g. "Signature". */
  title: string
  /** The heavy second title line, e.g. "Cheeseburger". */
  subtitle: string
  image: string
  alt: string
  /** Small line above the title, e.g. "$13.99 · Burgers". */
  eyebrow: string
  /** Name under the thumbnail. */
  label: string
  /** Badge number, e.g. prep minutes. Omitted when the kitchen hasn't set one. */
  badge?: string
  badgeUnit?: string
  /** Bold line in the card (the store name). */
  heading: string
  /** Small line under it (the kitchen station). */
  subheading?: string
  description: string
  /** Real modifier names for the Options tab. */
  options: string[]
  accent: string
  href: string
  needsChoice: boolean
  defaultModifierIds: string[]
}

export function wrapIndex(i: number, n: number): number {
  if (n <= 0) return 0
  return ((Math.round(i) % n) + n) % n
}

/** Which way to swing when jumping from one dish to another: the shorter way round. */
export function stepDirection(from: number, to: number, n: number): 1 | -1 {
  if (n <= 0) return 1
  const fwd = (((to - from) % n) + n) % n
  return fwd <= n - fwd ? 1 : -1
}

/** First thumbnail shown in the strip window, keeping the current one in view. */
export function stripStart(index: number, n: number, visible: number): number {
  if (n <= visible) return 0
  return Math.max(0, Math.min(index - 1, n - visible))
}

/** Title font size so a line of `chars` characters fits `width` px at `em` average glyph width. */
export function fitSize(chars: number, max: number, width: number, em: number): number {
  return Math.min(max, width / (Math.max(1, chars) * em))
}

export const ARC_REST = [[50, 98], [46, 124], [60, 126], [40, 100]]
export function arcRest(index: number): number[] {
  return ARC_REST[((index % ARC_REST.length) + ARC_REST.length) % ARC_REST.length]
}
export const ARC_SWEEP = [38, 146]

const ORBIT_X = 299
const ORBIT_Y = -450
const ORBIT_R = 650
const SWING = 50
const HIDE_1 = "inset(0% 0% 0% 100%)"
const HIDE_2 = "inset(0% 100% 0% 0%)"
const SHOW = "inset(0% 0% 0% 0%)"

const Icon = {
  order: <svg className="dsh-ico dsh-fill" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5 3 15h18zM3 18h18v2.5H3z" /></svg>,
  prev: <svg viewBox="0 0 12 16" aria-hidden="true"><path d="M11 0v16L0 8z" /></svg>,
  next: <svg viewBox="0 0 12 16" aria-hidden="true"><path d="M1 0v16l11-8z" /></svg>,
}

export function DishOrbit({
  dishes,
  backdrop,
  height = "clamp(560px, calc(100svh - 76px), 820px)",
  autoplayMs = 7000,
  orderLabel,
  orderBusy = false,
  onOrder,
}: {
  dishes: OrbitDish[]
  backdrop?: string
  /** Desktop stage height. The stage never pins; on phones it is as tall as its content. */
  height?: string
  /** Slow autoplay; 0 turns it off. Reduced-motion guests never get it. */
  autoplayMs?: number
  orderLabel?: (dish: OrbitDish) => string
  orderBusy?: boolean
  onOrder?: (dish: OrbitDish, index: number) => void
}) {
  const n = dishes.length
  const [index, setIndex] = useState(0)
  const [tab, setTab] = useState<"overview" | "options">("overview")
  const [compact, setCompact] = useState(false)
  const [hovering, setHovering] = useState(false)
  const [focused, setFocused] = useState(false)
  const [chosen, setChosen] = useState(false)
  const [reduced, setReduced] = useState(false)
  const [tick, setTick] = useState(0)

  const rootRef = useRef<HTMLDivElement | null>(null)
  const orbits = useRef<(HTMLDivElement | null)[]>([])
  const heads = useRef<(HTMLDivElement | null)[]>([])
  const bodies = useRef<(HTMLDivElement | null)[]>([])
  const arcRef = useRef<SVGPathElement | null>(null)
  const arc = useRef({ a0: 0, a1: 0 })
  const shown = useRef(-1)
  const dirRef = useRef<1 | -1>(1)
  const tlRef = useRef<gsap.core.Timeline | null>(null)
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const inView = useRef(true)

  // Fit the 960 x 520 design canvas to the stage. Measured on resize only.
  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return
    const fit = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      setCompact(w < 640)
      el.style.setProperty("--dsh-s", String(Math.min(w / 960, h / 520, 1.6)))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const on = () => setReduced(mq.matches)
    on()
    mq.addEventListener("change", on)
    const el = rootRef.current
    const io = el ? new IntersectionObserver(([entry]) => { inView.current = entry.isIntersecting }, { threshold: 0.25 }) : null
    if (el && io) io.observe(el)
    return () => {
      mq.removeEventListener("change", on)
      io?.disconnect()
    }
  }, [])

  // The swap. Every dish is in the DOM; GSAP only moves the outgoing and incoming ones.
  useLayoutEffect(() => {
    const from = shown.current
    const to = index
    const parts = (i: number) => {
      const head = heads.current[i]
      return {
        orbit: orbits.current[i],
        head,
        eye: head && head.querySelector(".dsh-eye"),
        t1: head && head.querySelector(".dsh-t1"),
        t2: head && head.querySelector(".dsh-t2"),
        body: bodies.current[i],
      }
    }
    const drawArc = () => arcRef.current?.setAttribute("d", arcPath(arc.current.a0, arc.current.a1, ORBIT_X, ORBIT_Y, ORBIT_R, 118))
    const rest = arcRest(to)
    const tint = dishes[to] ? dishes[to].accent : "transparent"
    if (tlRef.current) tlRef.current.progress(1).kill()
    const b = parts(to)
    if (from === -1 || from === to || reduced) {
      for (let i = 0; i < n; i++) if (i !== to) {
        const p = parts(i)
        gsap.set([p.orbit, p.head, p.body].filter(Boolean), { autoAlpha: 0 })
      }
      gsap.set([b.orbit, b.head, b.body, b.eye].filter(Boolean), { autoAlpha: 1, rotation: 0, y: 0 })
      if (b.t1) gsap.set(b.t1, { clipPath: SHOW })
      if (b.t2) gsap.set(b.t2, { clipPath: SHOW })
      arc.current.a0 = rest[0]
      arc.current.a1 = rest[1]
      drawArc()
      if (arcRef.current) gsap.set(arcRef.current, { fill: tint })
      shown.current = to
      return
    }
    const a = parts(from)
    const d = dirRef.current
    const tl = gsap.timeline({ onComplete: () => { tlRef.current = null } })
    tlRef.current = tl
    tl.to(a.orbit, { rotation: SWING * d, duration: 0.62, ease: "power2.in" }, 0)
      .set(a.orbit, { autoAlpha: 0, rotation: 0 }, 0.62)
      .fromTo(b.orbit, { autoAlpha: 1, rotation: -SWING * d }, { rotation: 0, duration: 0.95, ease: "power3.out" }, 0.3)
    tl.to(a.t1, { clipPath: HIDE_1, duration: 0.42, ease: "power2.in" }, 0)
      .to(a.t2, { clipPath: HIDE_2, duration: 0.42, ease: "power2.in" }, 0.06)
      .to(a.eye, { autoAlpha: 0, duration: 0.25 }, 0)
      .set(a.head, { autoAlpha: 0 }, 0.5)
      .set(b.head, { autoAlpha: 1 }, 0.5)
      .fromTo(b.eye, { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: "power2.out" }, 0.55)
      .fromTo(b.t1, { clipPath: HIDE_1 }, { clipPath: SHOW, duration: 0.7, ease: "power3.out" }, 0.55)
      .fromTo(b.t2, { clipPath: HIDE_2 }, { clipPath: SHOW, duration: 0.7, ease: "power3.out" }, 0.62)
    tl.to(a.body, { autoAlpha: 0, y: -6, duration: 0.3, ease: "power1.in" }, 0.05)
      .set(b.body, { autoAlpha: 1, y: 0 }, 0.4)
    if (b.body) tl.fromTo(b.body.children, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.06, ease: "power2.out" }, 0.4)
    tl.to(arc.current, { a0: ARC_SWEEP[0], a1: ARC_SWEEP[1], duration: 0.6, ease: "power2.inOut", onUpdate: drawArc }, 0)
      .to(arc.current, { a0: rest[0], a1: rest[1], duration: 0.85, ease: "power3.out", onUpdate: drawArc }, 0.6)
    if (arcRef.current) tl.to(arcRef.current, { fill: tint, duration: 1.1, ease: "power1.inOut" }, 0.1)
    shown.current = to
  }, [index, n, dishes, reduced])

  useEffect(() => () => { tlRef.current?.kill() }, [])

  const go = (to: number, dir?: 1 | -1) => {
    if (n < 2) return
    const next = wrapIndex(to, n)
    if (next === index) return
    dirRef.current = dir ?? stepDirection(index, next, n)
    setIndex(next)
  }
  const pick = (to: number, dir?: 1 | -1) => {
    setChosen(true)
    go(to, dir)
  }
  const step = (d: 1 | -1) => pick(index + d, d)

  // Slow autoplay: off for reduced motion, while hovered, focused or off screen, and after the guest chooses.
  const paused = hovering || focused || chosen || reduced || !autoplayMs || n < 2
  useEffect(() => {
    if (paused) return
    const timer = window.setTimeout(() => {
      if (document.visibilityState === "visible" && inView.current) go(index + 1, 1)
      else setTick((t) => t + 1) // hidden or off screen: wait another round
    }, autoplayMs)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, paused, autoplayMs, tick])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); step(1) }
    else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1) }
  }
  // Swipe: read on pointer up only. Nothing here can cancel or delay the page's own scrolling.
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") setChosen(true)
    swipe.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const s = swipe.current
    swipe.current = null
    if (!s) return
    const dx = e.clientX - s.x
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(e.clientY - s.y) * 1.4) step(dx < 0 ? 1 : -1)
  }

  const visible = compact ? 3 : 4
  const start = stripStart(index, n, visible)
  const dish = dishes[index]

  return (
    <div className="dsh-host">
      <div
        ref={rootRef}
        className="dsh-root"
        style={{ "--dsh-h": height } as React.CSSProperties}
        role="region"
        aria-roledescription="carousel"
        aria-label="Dishes from the kitchen"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerEnter={(e) => { if (e.pointerType === "mouse") setHovering(true) }}
        onPointerLeave={(e) => { if (e.pointerType === "mouse") setHovering(false) }}
        onFocus={() => setFocused(true)}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocused(false) }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (swipe.current = null)}
      >
        {backdrop ? <img className="dsh-bd" src={backdrop} alt="" width={1200} height={900} fetchPriority="high" /> : null}
        {backdrop ? <div className="dsh-wash" /> : null}

        <div className="dsh-canvas">
          <svg className="dsh-arc" viewBox="0 0 960 520" aria-hidden="true">
            <path ref={arcRef} style={{ opacity: 0.34 }} />
          </svg>

          <div className="dsh-pager" role="tablist" aria-label="Choose a dish">
            {dishes.map((d, i) => (
              <button key={d.id} type="button" role="tab" className="dsh-btn dsh-dot" aria-selected={i === index}
                aria-current={i === index ? "true" : undefined} aria-label={d.label} onClick={() => pick(i)}>
                <i />
              </button>
            ))}
          </div>

          <div className="dsh-plates">
            {dishes.map((d, i) => (
              <div key={d.id} ref={(el) => { orbits.current[i] = el }} className={"dsh-orbit" + (i === 0 ? " dsh-on" : "")} aria-hidden={i !== index}>
                <img src={d.image} alt={d.alt} width={245} height={245} draggable={false} fetchPriority={i === 0 ? "high" : "low"} loading={i === 0 ? "eager" : "lazy"} />
              </div>
            ))}
          </div>

          <div className="dsh-head" aria-live="polite">
            {dishes.map((d, i) => (
              <div key={d.id} ref={(el) => { heads.current[i] = el }} className={"dsh-hd" + (i === 0 ? " dsh-on" : "")} aria-hidden={i !== index}>
                <p className="dsh-eye">{d.eyebrow}</p>
                {/* The first dish's name is the page's heading; the rest are its siblings. */}
                {i === 0 ? (
                  <h1 className="dsh-h">
                    <span className="dsh-t1" style={{ fontSize: `min(${fitSize(d.title.length, 56, 330, 0.56)}px, ${(86 / (Math.max(1, d.title.length) * 0.56)).toFixed(2)}cqi, var(--dsh-tmax1))` }}>{d.title}</span>
                    <span className="dsh-t2" style={{ fontSize: `min(${fitSize(d.subtitle.length, 62, 320, 0.64)}px, ${(86 / (Math.max(1, d.subtitle.length) * 0.64)).toFixed(2)}cqi, var(--dsh-tmax2))` }}>{d.subtitle}</span>
                  </h1>
                ) : (
                  <h2 className="dsh-h">
                    <span className="dsh-t1" style={{ fontSize: `min(${fitSize(d.title.length, 56, 330, 0.56)}px, ${(86 / (Math.max(1, d.title.length) * 0.56)).toFixed(2)}cqi, var(--dsh-tmax1))` }}>{d.title}</span>
                    <span className="dsh-t2" style={{ fontSize: `min(${fitSize(d.subtitle.length, 62, 320, 0.64)}px, ${(86 / (Math.max(1, d.subtitle.length) * 0.64)).toFixed(2)}cqi, var(--dsh-tmax2))` }}>{d.subtitle}</span>
                  </h2>
                )}
              </div>
            ))}
          </div>

          <div className="dsh-acts">
            <button type="button" className="dsh-btn dsh-order" disabled={orderBusy} onClick={() => dish && onOrder?.(dish, index)}>
              {Icon.order}{dish ? (orderLabel?.(dish) ?? "Order food") : "Order food"}
            </button>
            {dish ? <Link className="dsh-btn dsh-more" href={dish.href}>{dish.needsChoice ? "See options" : "Details"}</Link> : null}
          </div>

          <div className="dsh-card">
            <div className="dsh-tabs" role="tablist" aria-label="Dish details">
              {(["overview", "options"] as const).map((t) => (
                <button key={t} type="button" role="tab" className="dsh-btn dsh-tab" aria-selected={tab === t} onClick={() => setTab(t)}>
                  {t === "overview" ? "Overview" : "Options"}
                </button>
              ))}
            </div>
            <div className="dsh-bodies">
              {dishes.map((d, i) => (
                <div key={d.id} ref={(el) => { bodies.current[i] = el }} className={"dsh-body" + (i === 0 ? " dsh-on" : "")} aria-hidden={i !== index}>
                  <div className="dsh-rate">
                    {d.badge ? (
                      <div className="dsh-badge" style={{ background: d.accent }}>
                        <span className="dsh-num">{d.badge}<small>{d.badgeUnit}</small></span>
                      </div>
                    ) : <div className="dsh-badge dsh-badge-dot" style={{ background: d.accent }} />}
                  </div>
                  <p className="dsh-chef">{d.heading}</p>
                  <p className="dsh-kit">{d.subheading ?? "\u00a0"}</p>
                  {tab === "overview" ? (
                    <p className="dsh-desc">{d.description}</p>
                  ) : d.options.length ? (
                    <ul className="dsh-ing">{d.options.map((x) => <li key={x}>{x}</li>)}</ul>
                  ) : (
                    <p className="dsh-desc">Served as it comes. No choices to make.</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="dsh-strip" style={{ "--dsh-vis": visible } as React.CSSProperties}>
            <button type="button" className="dsh-btn dsh-arrow" aria-label="Previous dish" onClick={() => step(-1)}>{Icon.prev}</button>
            <div className="dsh-win">
              <div className="dsh-track" style={{ transform: `translateX(calc(${-start} * var(--dsh-item)))` }}>
                {dishes.map((d, i) => (
                  <div key={d.id} className="dsh-th">
                    <button type="button" className="dsh-btn" aria-current={i === index ? "true" : undefined} aria-label={d.label} onClick={() => pick(i)}>
                      <img src={d.image} alt="" width={56} height={56} draggable={false} loading="lazy" />
                      <span aria-hidden="true">{d.label}</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <button type="button" className="dsh-btn dsh-arrow" aria-label="Next dish" onClick={() => step(1)}>{Icon.next}</button>
          </div>
        </div>
        <p className="dsh-sr" aria-live="polite">{dish ? `Dish ${index + 1} of ${n}: ${dish.label}` : ""}</p>
      </div>
    </div>
  )
}
