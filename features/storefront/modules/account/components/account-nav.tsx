"use client"

import clsx from "clsx"
import { LogOut, MapPin, Package, User } from "lucide-react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { signOut } from "@/features/storefront/lib/data/user"

interface AccountNavProps {
  user: any
}

export default function AccountNav({ user }: AccountNavProps) {
  const route = usePathname()

  const handleLogout = async () => {
    await signOut()
  }

  const navLinks = [
    { href: "/account", label: "Overview", icon: Package },
    { href: "/account/profile", label: "Profile", icon: User },
    { href: "/account/addresses", label: "Addresses", icon: MapPin },
    { href: "/account/orders", label: "Orders", icon: Package },
  ]

  return (
    <aside className="storefront-surface h-fit bg-card p-4 sm:p-6">
      <div className="px-1 pb-3 sm:pb-5">
        <p className="text-sm font-medium text-primary">Account</p>
        <h2 className="mt-1 sf-section-title text-foreground">{user?.name || "Your profile"}</h2>
        <p className="mt-1 text-sm text-muted-foreground break-all">{user?.email}</p>
      </div>

      <nav className="mt-2 grid grid-cols-2 gap-1.5 sm:mt-4 lg:flex lg:flex-col lg:gap-1">
        {navLinks.map((link) => {
          const Icon = link.icon
          const isActive = route === link.href
          return (
            <Link
              key={link.href}
              href={link.href}
              className={clsx(
                "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-mint text-leaf"
                  : "text-muted-foreground hover:bg-muted hover:text-ink"
              )}
            >
              <Icon size={16} />
              <span>{link.label}</span>
            </Link>
          )
        })}

        <button
          onClick={handleLogout}
          className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-destructive lg:mt-2"
        >
          <LogOut size={16} />
          <span>Log out</span>
        </button>
      </nav>
    </aside>
  )
}
