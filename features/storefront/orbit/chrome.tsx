"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { getServiceStatus, type ServiceStatus } from "@/features/storefront/lib/store-hours-display"
import { storefrontFont } from "@/features/storefront/lib/fonts"
import { Bag, CartButton, useOrbitCart } from "./cart"
import { MORE_LINKS, NAV_LINKS } from "./links"

/** The store's mark (the icon saved in Store Settings, tinted by its Logo Color) beside its name in the wordmark face. */
export function Brand({ name, mark, hue, style }: { name: string; mark: string; hue?: string | null; style?: React.CSSProperties }) {
  return (
    <Link href="/" className="o-brand" aria-label={`${name}, home`} style={style}>
      {mark ? <span className="o-brand-mark" style={{ filter: `hue-rotate(${hue || "0"}deg)` }} dangerouslySetInnerHTML={{ __html: mark }} aria-hidden="true" /> : null}
      <span className="o-brand-name" aria-hidden="true">{name.trim()}</span>
    </Link>
  )
}

function LiveStatus({ hours, timezone, locale, initial }: { hours: unknown; timezone: string; locale: string; initial: ServiceStatus }) {
  const [status, setStatus] = useState(initial)
  useEffect(() => {
    const read = () => setStatus(getServiceStatus(hours, timezone, locale))
    read()
    const timer = window.setInterval(read, 60_000)
    return () => window.clearInterval(timer)
  }, [hours, timezone, locale])
  const label = status.isOpen ? "Open" : "Closed"
  return (
    <Link href="/#visit" className="o-status">
      <span className="o-dot" data-on={status.isOpen ? "true" : "false"} aria-hidden="true" />
      <span>{status.detail ? `${label} · ${status.detail}` : label}</span>
    </Link>
  )
}

export function Header({
  name,
  mark,
  hue,
  banner,
  hours,
  timezone,
  locale,
  status,
}: {
  name: string
  mark: string
  hue?: string | null
  banner?: string | null
  hours: unknown
  timezone: string
  locale: string
  status: ServiceStatus
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const pathname = usePathname()
  useEffect(() => setMenuOpen(false), [pathname])
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false) }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [menuOpen])

  return (
    <>
    {/* The offer line sits above the bar and scrolls away with the page; the bar itself stays. */}
    {banner ? <p className="o-banner">{banner}</p> : null}
    <header className="o-header">
      <div className="o-shell o-header-row">
        <Brand name={name} mark={mark} hue={hue} />
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <nav className="o-nav" aria-label="Storefront">
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined}>{link.label}</Link>
            ))}
          </nav>
          <LiveStatus hours={hours} timezone={timezone} locale={locale} initial={status} />
          <CartButton />
          <button type="button" className="o-icon-btn" aria-label="More pages" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="M4 6.5h16M4 12h16M4 17.5h16" /></svg>
          </button>
        </div>
      </div>
      {menuOpen ? createPortal(
        <>
          <div className="o-drawer-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />
          <div className={`o-drawer orbit-ui ${storefrontFont.variable}`} role="dialog" aria-modal="true" aria-label="Pages">
            <div className="o-drawer-head">
              <p className="o-split o-split-md"><span className="o-thin">Find</span><span className="o-heavy">Your way</span></p>
              <button type="button" className="o-icon-btn" onClick={() => setMenuOpen(false)} aria-label="Close" autoFocus>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>
            <nav className="o-drawer-body" aria-label="All pages">
              {[...NAV_LINKS, ...MORE_LINKS].map((link) => (
                <Link key={link.href} href={link.href} data-in-dock={DOCK_HREFS.has(link.href) ? "true" : undefined} onClick={() => setMenuOpen(false)} style={{ display: "flex", alignItems: "center", minHeight: 52, fontSize: 20, fontWeight: 600, color: "var(--o-ink)", textDecoration: "none", borderBottom: "1px solid var(--o-line)" }}>
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </>,
        document.body,
      ) : null}
    </header>
    </>
  )
}

const TABS = [
  { href: "/", label: "Home", on: (p: string) => p === "/", icon: <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" /> },
  { href: "/menu", label: "Menu", on: (p: string) => p.startsWith("/menu"), icon: <path d="M7 3.5v7M4.5 3.5v4a2.5 2.5 0 0 0 5 0v-4M7 10.5v10M17.5 20.5v-17c-2 1-3.2 3.4-3.2 6.4v3.1h3.2" /> },
  { href: "/find-order", label: "Orders", on: (p: string) => p.startsWith("/find-order") || p.startsWith("/order"), icon: <path d="M6 3.5h12v17l-3-1.8-3 1.8-3-1.8-3 1.8zM9 8.5h6M9 12.5h6" /> },
  { href: "/account", label: "Account", on: (p: string) => p.startsWith("/account"), icon: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5c.6-3.6 3.6-5.5 7.5-5.5s6.9 1.9 7.5 5.5" /> },
]
const DOCK_HREFS = new Set(TABS.map((tab) => tab.href))

/** Phones only: the menu fixed to the bottom of the screen, with the order bar joined to its top once the cart has items. */
export function Dock() {
  const pathname = usePathname() || "/"
  const { count, total, open } = useOrbitCart()
  return (
    <div className="o-dock">
      {count > 0 ? (
        <button type="button" className="o-dock-cart" onClick={open} aria-label={`View order, ${count} item${count === 1 ? "" : "s"}, ${total}`}>
          <Bag />
          <span>View order</span>
          <small>{count} item{count === 1 ? "" : "s"}</small>
          <b>{total}</b>
        </button>
      ) : null}
      <nav className="o-tabbar" aria-label="Main pages">
        {TABS.map((tab) => (
          <Link key={tab.href} href={tab.href} className="o-tab" aria-current={tab.on(pathname) ? "page" : undefined}>
            <span className="o-tab-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{tab.icon}</svg></span>
            {tab.label}
          </Link>
        ))}
        <button type="button" className="o-tab" onClick={open} aria-label={count ? `Cart, ${count} item${count === 1 ? "" : "s"}` : "Cart"}>
          <span className="o-tab-ico"><Bag />{count ? <span className="o-badge" aria-hidden="true">{count > 99 ? "99+" : count}</span> : null}</span>
          Cart
        </button>
      </nav>
    </div>
  )
}
