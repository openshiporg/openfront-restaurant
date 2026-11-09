"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { gsap } from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

/*
 * Dish Orbit Carousel: a smart-kitchen-display menu. The plated dish sits on
 * the left; changing dish swings it out over the top on a wide orbit while the
 * next plate swings in from the other side. The two-weight title wipes out and
 * back in (thin line from the right, heavy line from the left), the chef card
 * and its coloured rating badge cross-fade, and a pastel arc behind the scene
 * turns and takes the dish's colour. The page scroll drives it: the section
 * pins and each stretch of scroll brings the next dish, endlessly both ways.
 * Arrows, thumbnails, the side pager, arrow keys and swipes jump too.
 */

export type Dish = {
  /** The thin first title line, e.g. "Char grill". */
  title: string
  /** The heavy second title line, e.g. "Ribeye". */
  subtitle: string
  /** Plate photo, ideally a top-down cut-out (transparent PNG/WebP), square. */
  image: string
  alt?: string
  /** Small line above the title. Defaults to "#n Most loved dish". */
  eyebrow?: string
  /** Two-line label under the thumbnail. Defaults to title + subtitle. */
  label?: string
  /** Omit when the store has no real rating: the badge then shows `badge` instead. */
  rating?: number
  /** Badge text used when there is no rating, e.g. "12" with `badgeUnit` "min". */
  badge?: string
  badgeUnit?: string
  chef: string
  /** Kitchen or restaurant, under the chef's name. */
  kitchen?: string
  description: string
  /** Omit when likes are not recorded: the reaction row is then hidden. */
  likes?: number
  ingredients?: string[]
  /** Badge and band colour: hex or rgb(), so the band can morph between dishes. */
  accent: string
}

export type DishOrbitCarouselProps = {
  dishes: Dish[]
  /** Root height. A definite length: percentages collapse on a host page. */
  height?: string
  /** Optional photo behind the display, e.g. a kitchen wall. Washed by the theme background. */
  backdrop?: string
  /** Scroll on forever: past the last dish comes the first again, and up from the first, the last. */
  loop?: boolean
  /** Embedded display face (Outfit, OFL). Pass null to use the host's font. */
  fontSrc?: string | null
  /** Omit when a dish has no video: the Play video button is then not shown. */
  onPlay?: (dish: Dish, index: number) => void
  orderLabel?: string
  orderBusy?: boolean
  detailsLabel?: string
  /** Anchors for the two top icons (search, menu). Omit to hide them. */
  searchHref?: string
  onOrder?: (dish: Dish, index: number) => void
  onChange?: (index: number) => void
  className?: string
}

// #region carousel
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

/** Scroll stretches in the section: one per dish change, plus one back round to the first when looping. */
export function scrollSteps(n: number, loop: boolean): number {
  return Math.max(0, loop ? n : n - 1)
}

/** The scroll stretch for dish `i` nearest the current one (when looping, dish 0 is also the last stretch). */
export function segmentFor(i: number, current: number, n: number, loop: boolean): number {
  return loop && i === 0 && current > n / 2 ? n : i
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
/**
 * The pastel band: a thick stroke along the plates' orbit circle, tapering at
 * both ends. Angles in degrees, screen space (0 = right, 90 = straight down).
 */
export function arcPath(a0: number, a1: number, cx: number, cy: number, r: number, w: number, steps = 48): string {
  const outer: string[] = []
  const inner: string[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const a = ((a0 + (a1 - a0) * t) * Math.PI) / 180
    const h = (w / 2) * Math.pow(Math.sin(Math.PI * t), 0.45)
    const c = Math.cos(a)
    const s = Math.sin(a)
    outer.push((cx + c * (r + h)).toFixed(1) + " " + (cy + s * (r + h)).toFixed(1))
    inner.push((cx + c * (r - h)).toFixed(1) + " " + (cy + s * (r - h)).toFixed(1))
  }
  return "M" + outer.join("L") + "L" + inner.reverse().join("L") + "Z"
}

/** Where the band rests for each dish, as [start, end] angles along the orbit. Measured off the reference. */
export const ARC_REST = [[50, 98], [46, 124], [60, 126], [40, 100]]
export function arcRest(index: number): number[] {
  return ARC_REST[((index % ARC_REST.length) + ARC_REST.length) % ARC_REST.length]
}

/** The band mid-swap: it stretches to trail between the outgoing and incoming plate. */
export const ARC_SWEEP = [38, 146]
// #endregion

// The plates' orbit: its pivot sits above the canvas (the .dsh-orbit transform-origin).
const ORBIT_X = 299
const ORBIT_Y = -450
const ORBIT_R = 650
const SCROLL_PER_DISH = 0.7 // stage heights of scroll per dish
const SWING = 50 // degrees the plate travels round the orbit's pivot
const ITEM = 118 // thumbnail pitch in canvas px
const VISIBLE = 4

const FONT = "dsh-face"

const CSS =
  ".dsh-trk{position:relative;width:100%}" +
  ".dsh-root{position:sticky;top:0;overflow:hidden;width:100%;background:var(--color-background);color:var(--color-foreground);" +
  "font-family:" + FONT + ",ui-sans-serif,system-ui,sans-serif;container-type:inline-size;-webkit-tap-highlight-color:transparent}" +
  ".dsh-root *{box-sizing:border-box}" +
  ".dsh-bd{position:absolute;inset:0;width:100%;height:100%;max-width:none;object-fit:cover;pointer-events:none}" +
  ".dsh-wash{position:absolute;inset:0;background:color-mix(in oklab,var(--color-background) 38%,transparent);pointer-events:none}" +
  // multiply by the background: a no-op on a light theme, lights-off on a dark one
  ".dsh-dim{position:absolute;inset:0;background:var(--color-background);mix-blend-mode:multiply;opacity:.72;pointer-events:none}" +
  ".dsh-root:focus-visible{outline:2px solid var(--color-primary);outline-offset:-4px}" +
  ".dsh-canvas{position:absolute;left:50%;top:50%;width:960px;height:520px;transform:translate(-50%,-50%) scale(var(--dsh-s,1));transform-origin:50% 50%}" +
  ".dsh-arc{position:absolute;left:0;top:0;width:960px;height:520px;overflow:visible;pointer-events:none}" +
  ".dsh-btn{appearance:none;border:0;background:none;color:inherit;font:inherit;padding:0;margin:0;cursor:pointer}" +
  ".dsh-btn:focus-visible{outline:2px solid var(--color-primary);outline-offset:3px;border-radius:10px}" +
  ".dsh-ico{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}" +
  ".dsh-top{position:absolute;left:800px;top:52px;display:flex;gap:14px}" +
  ".dsh-top .dsh-btn{width:36px;height:36px;display:grid;place-items:center;border-radius:10px}" +
  ".dsh-pager{position:absolute;left:76px;top:172px;display:flex;flex-direction:column;align-items:center;gap:7px}" +
  ".dsh-dot{width:14px;height:10px;display:grid;place-items:center}" +
  ".dsh-dot i{display:block;width:3px;height:3px;border-radius:3px;background:var(--color-foreground);opacity:.45;transition:height .45s cubic-bezier(.3,.7,.2,1),opacity .3s}" +
  ".dsh-dot[aria-current] i{height:22px;opacity:.9}" +
  ".dsh-dot[aria-current]{height:26px}" +
  ".dsh-dot{transition:height .45s cubic-bezier(.3,.7,.2,1)}" +
  ".dsh-plates{position:absolute;left:130px;top:82px;width:245px;height:245px;touch-action:pan-y}" +
  ".dsh-orbit{position:absolute;inset:0;transform-origin:69% -217%;visibility:hidden;will-change:transform}" +
  ".dsh-orbit>img{display:block;width:245px;height:245px;max-width:none;object-fit:contain;user-select:none;-webkit-user-drag:none;" +
  "filter:drop-shadow(0 16px 22px rgba(0,0,0,.2)) drop-shadow(0 3px 5px rgba(0,0,0,.12))}" +
  ".dsh-head{position:absolute;left:388px;top:96px;width:330px;height:150px}" +
  ".dsh-hd{position:absolute;inset:0;visibility:hidden}" +
  ".dsh-eye{font-size:12.5px;font-weight:600;letter-spacing:.01em;margin:0 0 4px 2px}" +
  ".dsh-t1,.dsh-t2{display:block;white-space:nowrap;line-height:1;text-transform:uppercase;margin:0}" +
  ".dsh-t1{font-weight:200;letter-spacing:-.015em;margin-top:6px}" +
  ".dsh-t2{font-weight:800;letter-spacing:-.025em;margin-top:6px;color:color-mix(in oklab,var(--color-foreground) 86%,transparent)}" +
  ".dsh-acts{position:absolute;left:396px;top:280px;display:flex;gap:44px;font-size:12.5px;font-weight:500}" +
  ".dsh-acts .dsh-btn{display:flex;align-items:center;gap:9px;padding:4px 0}" +
  ".dsh-acts .dsh-ico{width:13px;height:13px}" +
  ".dsh-acts .dsh-fill{fill:currentColor;stroke:none}" +
  ".dsh-card{position:absolute;left:722px;top:137px;width:223px;padding:18px 20px 20px;border-radius:20px;" +
  "background:color-mix(in oklab,var(--color-background) 72%,transparent);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);" +
  "box-shadow:0 1px 0 color-mix(in oklab,var(--color-foreground) 6%,transparent) inset,0 18px 40px -24px rgba(0,0,0,.25)}" +
  ".dsh-tabs{display:flex;justify-content:space-between;padding:0 6px 0 20px;font-size:12px;margin-bottom:20px}" +
  ".dsh-tab{color:var(--color-muted-foreground);font-weight:500;padding:3px 0}" +
  ".dsh-tab[aria-selected=true]{color:var(--color-foreground);font-weight:600}" +
  ".dsh-bodies{display:grid}" +
  ".dsh-body{grid-area:1/1;visibility:hidden}" +
  ".dsh-rate{position:relative;height:62px;margin:0 0 14px 6px}" +
  ".dsh-badge{position:absolute;left:0;top:0;width:46px;height:62px;border-radius:10px}" +
  ".dsh-badge svg{position:absolute;left:17px;bottom:9px;width:12px;height:12px;fill:var(--color-foreground);opacity:.8}" +
  ".dsh-num{position:absolute;left:10px;top:4px;font-size:36px;font-weight:700;letter-spacing:-.04em;line-height:1}" +
  ".dsh-chef{font-size:19px;font-weight:600;letter-spacing:-.01em;margin:0}" +
  ".dsh-kit{font-size:10.5px;color:var(--color-muted-foreground);margin:3px 0 12px}" +
  ".dsh-desc{font-size:12.5px;line-height:1.38;margin:0;min-height:52px}" +
  ".dsh-ing{display:flex;flex-wrap:wrap;gap:5px;margin:0;padding:0;list-style:none;min-height:52px}" +
  ".dsh-ing li{font-size:11px;padding:4px 9px;border-radius:99px;background:color-mix(in oklab,var(--color-foreground) 7%,transparent)}" +
  ".dsh-react{display:flex;gap:12px;margin-top:20px}" +
  ".dsh-like{display:flex;align-items:center;gap:8px;height:34px;padding:0 14px 0 10px;border-radius:99px;font-size:10.5px;" +
  "background:color-mix(in oklab,var(--color-foreground) 6%,transparent);transition:background .25s}" +
  ".dsh-meh{width:34px;height:34px;display:grid;place-items:center;border-radius:99px;background:color-mix(in oklab,var(--color-foreground) 6%,transparent)}" +
  ".dsh-react .dsh-ico{width:16px;height:16px}" +
  ".dsh-react [aria-pressed=true] .dsh-ico{fill:currentColor}" +
  ".dsh-strip{position:absolute;left:130px;top:362px;width:550px;height:122px;display:flex;align-items:center}" +
  ".dsh-arrow{width:36px;height:36px;display:grid;place-items:center;flex:none}" +
  ".dsh-arrow svg{width:12px;height:16px;fill:currentColor}" +
  ".dsh-win{position:relative;width:" + ITEM * VISIBLE + "px;height:122px;overflow:hidden;flex:none;margin:0 2px;" +
  "-webkit-mask-image:linear-gradient(90deg,#000 88%,transparent);mask-image:linear-gradient(90deg,#000 88%,transparent)}" +
  ".dsh-track{position:absolute;left:0;top:0;display:flex;transition:transform .6s cubic-bezier(.65,0,.35,1)}" +
  ".dsh-th{width:" + ITEM + "px;height:122px;display:flex;justify-content:center;padding-top:3px}" +
  ".dsh-th .dsh-btn{width:80px;height:116px;border-radius:14px;display:flex;flex-direction:column;align-items:center;gap:7px;padding-top:9px;transition:background .45s}" +
  ".dsh-th .dsh-btn[aria-current]{background:color-mix(in oklab,var(--color-background) 62%,transparent);box-shadow:0 10px 24px -16px rgba(0,0,0,.3)}" +
  ".dsh-th img{width:56px;height:56px;max-width:none;object-fit:contain;filter:drop-shadow(0 4px 6px rgba(0,0,0,.18));transition:transform .45s}" +
  ".dsh-th .dsh-btn[aria-current] img{transform:scale(1.06)}" +
  ".dsh-th span{font-size:10px;line-height:1.25;text-align:center;font-weight:500;color:color-mix(in oklab,var(--color-foreground) 78%,transparent);max-width:78px}" +
  ".dsh-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}" +
  "@container (max-width:639px){" +
  ".dsh-canvas{position:relative;left:auto;top:auto;width:100%;height:auto;transform:none;display:flex;flex-direction:column;align-items:center;padding:14px 16px 18px}" +
  ".dsh-arc{width:200%;height:auto;left:-60%;top:-30px}" +
  ".dsh-top{position:relative;left:auto;top:auto;align-self:flex-end}" +
  ".dsh-pager{left:14px;top:150px}" +
  ".dsh-plates{position:relative;left:auto;top:auto;width:min(52vw,32svh);height:min(52vw,32svh);margin-top:0}" +
  ".dsh-orbit>img{width:100%;height:100%}" +
  ".dsh-head{position:relative;left:auto;top:auto;width:100%;height:132px;margin-top:10px}" +
  ".dsh-hd{text-align:center;transform:scale(.78);transform-origin:50% 0}" +
  ".dsh-acts{position:relative;left:auto;top:auto;margin-top:4px}" +
  ".dsh-card{position:relative;left:auto;top:auto;width:100%;max-width:420px;margin-top:12px}" +
  // phone: the pinned stage has to fit one screen; the pager, swipes and scroll cover the strip
  ".dsh-strip{display:none}" +
  "}" +
  "@media (prefers-reduced-motion:reduce){.dsh-track,.dsh-dot,.dsh-dot i,.dsh-th .dsh-btn,.dsh-th img,.dsh-like{transition:none}}"

const HIDE_1 = "inset(0% 0% 0% 100%)" // thin line: wipes in from the right
const HIDE_2 = "inset(0% 100% 0% 0%)" // heavy line: wipes in from the left
const SHOW = "inset(0% 0% 0% 0%)"

const Icon = {
  search: <svg className="dsh-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>,
  menu: <svg className="dsh-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5h16M4 12h16M4 17.5h16" /></svg>,
  play: <svg className="dsh-ico dsh-fill" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5v17l14-8.5z" /></svg>,
  order: <svg className="dsh-ico dsh-fill" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5 3 15h18zM3 18h18v2.5H3z" /></svg>,
  up: <svg className="dsh-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10v10H3.5V10zM7 10l4-7c1.6 0 2.6 1.2 2.2 2.8L12.6 9H19a2 2 0 0 1 2 2.3l-1.3 7A2 2 0 0 1 17.7 20H7" /></svg>,
  down: <svg className="dsh-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M17 14V4h3.5v10zM17 14l-4 7c-1.6 0-2.6-1.2-2.2-2.8l.6-3.2H5a2 2 0 0 1-2-2.3l1.3-7A2 2 0 0 1 6.3 4H17" /></svg>,
}

export function DishOrbitCarousel({
  dishes,
  height = "100svh",
  backdrop,
  loop = true,
  fontSrc = FONT_DATA,
  onPlay,
  orderLabel = "Order food",
  orderBusy = false,
  detailsLabel = "Ingredients",
  searchHref,
  onOrder,
  onChange,
  className,
}: DishOrbitCarouselProps) {
  const n = dishes.length
  const [index, setIndex] = useState(0)
  const [tab, setTab] = useState("overview")
  const [liked, setLiked] = useState({} as Record<number, boolean>)
  const [disliked, setDisliked] = useState({} as Record<number, boolean>)

  const trackRef = useRef(null as HTMLDivElement | null)
  const rootRef = useRef(null as HTMLDivElement | null)
  const stRef = useRef(null as ScrollTrigger | null)
  const segRef = useRef(0)
  const indexRef = useRef(0)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const orbits = useRef([] as (HTMLDivElement | null)[])
  const heads = useRef([] as (HTMLDivElement | null)[])
  const bodies = useRef([] as (HTMLDivElement | null)[])
  const arcRef = useRef(null as SVGPathElement | null)
  const arc = useRef({ a0: 0, a1: 0 })
  const shown = useRef(-1)
  const dirRef = useRef(1 as 1 | -1)
  const tlRef = useRef(null as gsap.core.Timeline | null)
  const reducedRef = useRef(false)
  const swipe = useRef(null as { x: number; y: number } | null)

  // Fit the 960 x 520 design canvas to the root. Measured on resize only.
  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return
    const fit = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      el.style.setProperty("--dsh-s", String(Math.min(w / 960, h / 520, 1.6)))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const on = () => (reducedRef.current = mq.matches)
    on()
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
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
    // Writes the band's path only; no layout is read.
    const drawArc = () => arcRef.current?.setAttribute("d", arcPath(arc.current.a0, arc.current.a1, ORBIT_X, ORBIT_Y, ORBIT_R, 118))
    const rest = arcRest(to)
    const tint = dishes[to] ? dishes[to].accent : "transparent"
    if (tlRef.current) tlRef.current.progress(1).kill()
    const b = parts(to)
    if (from === -1 || from === to || reducedRef.current) {
      for (let i = 0; i < n; i++) if (i !== to) {
        const p = parts(i)
        gsap.set([p.orbit, p.head, p.body], { autoAlpha: 0 })
      }
      gsap.set([b.orbit, b.head, b.body, b.eye], { autoAlpha: 1, rotation: 0, y: 0 })
      gsap.set(b.t1, { clipPath: SHOW })
      gsap.set(b.t2, { clipPath: SHOW })
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
    // plate: out over the top on the orbit, the next one swings in from the far side
    tl.to(a.orbit, { rotation: SWING * d, duration: 0.62, ease: "power2.in" }, 0)
      .set(a.orbit, { autoAlpha: 0, rotation: 0 }, 0.62)
      .fromTo(b.orbit, { autoAlpha: 1, rotation: -SWING * d }, { rotation: 0, duration: 0.95, ease: "power3.out" }, 0.3)
    // title: thin line clips away to the right, heavy line to the left, then the next wipes in
    tl.to(a.t1, { clipPath: HIDE_1, duration: 0.42, ease: "power2.in" }, 0)
      .to(a.t2, { clipPath: HIDE_2, duration: 0.42, ease: "power2.in" }, 0.06)
      .to(a.eye, { autoAlpha: 0, duration: 0.25 }, 0)
      .set(a.head, { autoAlpha: 0 }, 0.5)
      .set(b.head, { autoAlpha: 1 }, 0.5)
      .fromTo(b.eye, { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: "power2.out" }, 0.55)
      .fromTo(b.t1, { clipPath: HIDE_1 }, { clipPath: SHOW, duration: 0.7, ease: "power3.out" }, 0.55)
      .fromTo(b.t2, { clipPath: HIDE_2 }, { clipPath: SHOW, duration: 0.7, ease: "power3.out" }, 0.62)
    // card: cross-fade, the incoming rows rise in turn
    tl.to(a.body, { autoAlpha: 0, y: -6, duration: 0.3, ease: "power1.in" }, 0.05)
      .set(b.body, { autoAlpha: 1, y: 0 }, 0.4)
    if (b.body) tl.fromTo(b.body.children, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.06, ease: "power2.out" }, 0.4)
    // the band stretches along the orbit with the plates, then settles into the next dish's span, morphing colour
    tl.to(arc.current, { a0: ARC_SWEEP[0], a1: ARC_SWEEP[1], duration: 0.6, ease: "power2.inOut", onUpdate: drawArc }, 0)
      .to(arc.current, { a0: rest[0], a1: rest[1], duration: 0.85, ease: "power3.out", onUpdate: drawArc }, 0.6)
    if (arcRef.current) tl.to(arcRef.current, { fill: tint, duration: 1.1, ease: "power1.inOut" }, 0.1)
    shown.current = to
  }, [index, n, dishes])

  useEffect(() => () => { tlRef.current?.kill() }, [])

  const select = (next: number, dir: 1 | -1) => {
    if (next === indexRef.current) return
    dirRef.current = dir
    indexRef.current = next
    setIndex(next)
    onChangeRef.current?.(next)
  }

  // The page scroll drives the dish: the stage pins, one stretch of scroll per dish, snapping between them.
  const steps = scrollSteps(n, loop)
  useEffect(() => {
    const track = trackRef.current
    if (!track || steps < 1) return
    const trigger = ScrollTrigger.create({
      trigger: track,
      start: () => "top top+=" + (parseFloat(getComputedStyle(rootRef.current as HTMLElement).top) || 0),
      end: "bottom bottom",
      invalidateOnRefresh: true,
      snap: { snapTo: 1 / steps, duration: { min: 0.3, max: 0.8 }, delay: 0.08, ease: "power2.inOut" },
      onUpdate: (self) => {
        // Looping: the last stretch shows the first dish, so jump back to the top unseen.
        if (loop && self.progress >= 1 && self.direction > 0) {
          segRef.current = 0
          self.scroll(self.start + 1)
          select(0, 1)
          return
        }
        const seg = Math.round(self.progress * steps)
        if (seg === segRef.current) return
        const dir = seg > segRef.current ? 1 : -1
        segRef.current = seg
        select(wrapIndex(seg, n), dir)
      },
    })
    // At the very top no scroll is left to fire onUpdate, so scrolling up there wraps round to the last dish.
    // Deferred a frame so the browser's own wheel scroll has landed first.
    let raf = 0
    const onWheel = (e: WheelEvent) => {
      const y = trigger.scroll()
      if (!loop || e.deltaY >= 0 || y < trigger.start - 1 || y > trigger.start + 1) return
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        segRef.current = n - 1
        trigger.scroll(trigger.start + ((trigger.end - trigger.start) * (n - 1)) / steps)
        select(n - 1, -1)
      })
    }
    window.addEventListener("wheel", onWheel, { passive: true })
    stRef.current = trigger
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("wheel", onWheel)
      trigger.kill()
      stRef.current = null
    }
  }, [steps, loop, n])

  // Buttons, keys and swipes jump to a dish and move the scroll to its stretch, so the two stay in step.
  const go = (to: number, dir?: 1 | -1) => {
    if (n < 2) return
    const next = wrapIndex(to, n)
    if (next === index) return
    const st = stRef.current
    const y = st ? st.scroll() : 0
    if (st && y >= st.start - 1 && y <= st.end + 1) {
      const seg = segmentFor(next, segRef.current, n, loop)
      segRef.current = seg
      st.scroll(st.start + ((st.end - st.start) * seg) / steps)
    }
    select(next, dir ?? stepDirection(index, next, n))
  }
  const step = (d: 1 | -1) => go(index + d, d)

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); step(1) }
    else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1) }
  }
  const onPointerDown = (e: React.PointerEvent) => { swipe.current = { x: e.clientX, y: e.clientY } }
  const onPointerUp = (e: React.PointerEvent) => {
    const s = swipe.current
    swipe.current = null
    if (!s) return
    const dx = e.clientX - s.x
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(e.clientY - s.y) * 1.4) step(dx < 0 ? 1 : -1)
  }

  const start = stripStart(index, n, VISIBLE)
  const dish = dishes[index]

  return (
    <div ref={trackRef} className={"dsh-trk" + (className ? " " + className : "")} style={{ height: "calc(" + height + " * " + (1 + steps * SCROLL_PER_DISH) + ")" }}>
    <div
      ref={rootRef}
      className="dsh-root"
      style={{ height }}
      role="region"
      aria-roledescription="carousel"
      aria-label="Dishes"
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <style>
        {(fontSrc ? "@font-face{font-family:" + FONT + ";src:url(" + fontSrc + ") format('woff2');font-weight:100 900;font-display:swap}" : "") + CSS}
      </style>
      {backdrop ? <img className="dsh-bd" src={backdrop} alt="" width={1200} height={900} /> : null}
      {backdrop ? <div className="dsh-dim" /> : null}
      {backdrop ? <div className="dsh-wash" /> : null}

      <div className="dsh-canvas">
        <svg className="dsh-arc" viewBox="0 0 960 520" aria-hidden="true">
          <path ref={arcRef} style={{ opacity: 0.34 }} />
        </svg>

        <div className="dsh-top">
          {searchHref ? <a className="dsh-btn" href={searchHref} aria-label="Browse the full menu">{Icon.menu}</a> : null}
        </div>

        <div className="dsh-pager" role="tablist" aria-label="Choose a dish">
          {dishes.map((d, i) => (
            <button key={i} type="button" role="tab" className="dsh-btn dsh-dot" aria-selected={i === index}
              aria-current={i === index ? "true" : undefined} aria-label={d.title + " " + d.subtitle} onClick={() => go(i)}>
              <i />
            </button>
          ))}
        </div>

        <div className="dsh-plates" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => (swipe.current = null)}>
          {dishes.map((d, i) => (
            <div key={i} ref={(el) => { orbits.current[i] = el }} className="dsh-orbit" aria-hidden={i !== index}>
              <img src={d.image} alt={d.alt ?? d.title + " " + d.subtitle} width={245} height={245} draggable={false} />
            </div>
          ))}
        </div>

        <div className="dsh-head" aria-live="polite">
          {dishes.map((d, i) => (
            <div key={i} ref={(el) => { heads.current[i] = el }} className="dsh-hd" aria-hidden={i !== index}>
              <p className="dsh-eye">{d.eyebrow ?? "#" + (i + 1) + " Most loved dish"}</p>
              <h2 style={{ margin: 0, font: "inherit" }}>
                <span className="dsh-t1" style={{ fontSize: fitSize(d.title.length, 56, 330, 0.56) + "px" }}>{d.title}</span>
                <span className="dsh-t2" style={{ fontSize: fitSize(d.subtitle.length, 62, 320, 0.64) + "px" }}>{d.subtitle}</span>
              </h2>
            </div>
          ))}
        </div>

        <div className="dsh-acts">
          {onPlay ? <button type="button" className="dsh-btn" onClick={() => dish && onPlay(dish, index)}>{Icon.play}Play video</button> : null}
          <button type="button" className="dsh-btn" disabled={orderBusy} onClick={() => dish && onOrder?.(dish, index)}>{Icon.order}{orderLabel}</button>
        </div>

        <div className="dsh-card">
          <div className="dsh-tabs" role="tablist" aria-label="Dish details">
            {["overview", "ingredients"].map((t) => (
              <button key={t} type="button" role="tab" className="dsh-btn dsh-tab" aria-selected={tab === t} onClick={() => setTab(t)}>
                {t === "overview" ? "Overview" : detailsLabel}
              </button>
            ))}
          </div>
          <div className="dsh-bodies">
            {dishes.map((d, i) => (
              <div key={i} ref={(el) => { bodies.current[i] = el }} className="dsh-body" aria-hidden={i !== index}>
                <div className="dsh-rate">
                  <div className="dsh-badge" style={{ background: d.accent }}>
                    {d.rating != null ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.5 2.9 6 6.6.8-4.9 4.6 1.3 6.6L12 17.2l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" /></svg> : null}
                  </div>
                  {d.rating != null ? (
                    <span className="dsh-num" aria-label={"Rated " + d.rating.toFixed(1) + " out of 5"}>{d.rating.toFixed(1)}</span>
                  ) : d.badge ? (
                    <span className="dsh-num" style={{ whiteSpace: "nowrap" }}>{d.badge}<small style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0, marginLeft: 3 }}>{d.badgeUnit}</small></span>
                  ) : null}
                </div>
                <p className="dsh-chef">{d.chef}</p>
                <p className="dsh-kit">{d.kitchen ?? " "}</p>
                {tab === "overview" || !d.ingredients?.length ? (
                  <p className="dsh-desc">{d.description}</p>
                ) : (
                  <ul className="dsh-ing">{d.ingredients.map((x) => <li key={x}>{x}</li>)}</ul>
                )}
                {d.likes != null ? <div className="dsh-react">
                  <button type="button" className="dsh-btn dsh-like" aria-pressed={!!liked[i]} tabIndex={i === index ? 0 : -1}
                    onClick={() => { setLiked((s) => ({ ...s, [i]: !s[i] })); setDisliked((s) => ({ ...s, [i]: false })) }}>
                    {Icon.up}{d.likes! + (liked[i] ? 1 : 0)} likes
                  </button>
                  <button type="button" className="dsh-btn dsh-meh" aria-pressed={!!disliked[i]} aria-label="Not for me" tabIndex={i === index ? 0 : -1}
                    onClick={() => { setDisliked((s) => ({ ...s, [i]: !s[i] })); setLiked((s) => ({ ...s, [i]: false })) }}>
                    {Icon.down}
                  </button>
                </div> : null}
              </div>
            ))}
          </div>
        </div>

        <div className="dsh-strip">
          <button type="button" className="dsh-btn dsh-arrow" aria-label="Previous dish" onClick={() => step(-1)}>
            <svg viewBox="0 0 12 16" aria-hidden="true"><path d="M11 0v16L0 8z" /></svg>
          </button>
          <div className="dsh-win">
            <div className="dsh-track" style={{ transform: "translateX(" + -start * ITEM + "px)" }}>
              {dishes.map((d, i) => (
                <div key={i} className="dsh-th">
                  <button type="button" className="dsh-btn" aria-current={i === index ? "true" : undefined} onClick={() => go(i)}>
                    <img src={d.image} alt="" width={56} height={56} draggable={false} />
                    <span>{d.label ?? d.title + " " + d.subtitle}</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
          <button type="button" className="dsh-btn dsh-arrow" aria-label="Next dish" onClick={() => step(1)}>
            <svg viewBox="0 0 12 16" aria-hidden="true"><path d="M1 0v16l11-8z" /></svg>
          </button>
        </div>

      </div>
      <p className="dsh-sr" aria-live="polite">{dish ? "Dish " + (index + 1) + " of " + n + ": " + dish.title + " " + dish.subtitle : ""}</p>
    </div>
    </div>
  )
}

export default DishOrbitCarousel

// Outfit (c) 2021 The Outfit Project Authors, SIL Open Font License 1.1.
// Variable weight 100-900, subset to Basic Latin.
const FONT_DATA = "data:font/woff2;base64,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"
