"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { CalendarDays, Gift, House, Receipt, UserRound } from "lucide-react"
import { cn } from "@/lib/utils"

const tabs = [
  { href: "/", label: "Menu", icon: House, match: (path: string) => path === "/" || path.startsWith("/menu") },
  { href: "/reservations", label: "Reserve", icon: CalendarDays, match: (path: string) => path.startsWith("/reservations") },
  { href: "/gift-cards", label: "Gift cards", icon: Gift, match: (path: string) => path.startsWith("/gift-cards") },
  { href: "/find-order", label: "Orders", icon: Receipt, match: (path: string) => path.startsWith("/find-order") || path.startsWith("/order") || path.startsWith("/account/orders") },
  { href: "/account", label: "Profile", icon: UserRound, match: (path: string) => path === "/account" || path.startsWith("/account/profile") || path.startsWith("/account/addresses") },
]

/** The phone's bottom bar: the storefront's main places, one thumb away. */
export function TabBar() {
  const path = usePathname() || "/"
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      aria-label="Main"
    >
      <ul className="grid grid-cols-5">
        {tabs.map(({ href, label, icon: Icon, match }) => {
          const on = match(path)
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={on ? "page" : undefined}
                className={cn("flex h-[3.4rem] flex-col items-center justify-center gap-0.5 text-[0.7rem]", on ? "font-medium text-leaf" : "text-ink-soft")}
              >
                <Icon className="size-5" strokeWidth={1.6} aria-hidden="true" />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
