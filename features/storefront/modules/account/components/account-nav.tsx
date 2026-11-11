"use client"

import { usePathname } from "next/navigation"
import Link from "next/link"
import { signOut } from "@/features/storefront/lib/data/user"

const LINKS = [
  { href: "/account", label: "Overview" },
  { href: "/account/orders", label: "Orders" },
  { href: "/account/profile", label: "Profile" },
  { href: "/account/addresses", label: "Addresses" },
]

/** The account's own tabs: a column of pills beside the panel on desktop, a wrapping row above it on phones. */
export default function AccountNav(_props: { user: any }) {
  const route = usePathname() || ""
  return (
    <nav className="o-acct-nav" aria-label="Account">
      {LINKS.map((link) => {
        const active = link.href === "/account" ? route === link.href : route.startsWith(link.href)
        return (
          <Link key={link.href} href={link.href} className="o-acct-link" aria-current={active ? "page" : undefined}>
            {link.label}
          </Link>
        )
      })}
      <button type="button" className="o-acct-link o-acct-out" onClick={() => { void signOut() }}>
        Log out
      </button>
    </nav>
  )
}
