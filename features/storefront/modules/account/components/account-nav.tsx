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
    <aside className="storefront-surface h-fit bg-card p-6">
      <div className=" pb-5">
        <p className="text-sm font-medium text-primary">Account</p>
        <h2 className="mt-2 font-serif text-2xl font-semibold text-foreground">{user?.name || "Your profile"}</h2>
        <p className="mt-1 text-sm text-muted-foreground break-all">{user?.email}</p>
      </div>

      <nav className="mt-5 flex flex-col gap-2">
        {navLinks.map((link) => {
          const Icon = link.icon
          const isActive = route === link.href
          return (
            <Link
              key={link.href}
              href={link.href}
              className={clsx(
                "flex items-center gap-3 border px-4 py-3 text-sm font-medium transition-colors",
                isActive
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-primary"
              )}
            >
              <Icon size={16} />
              <span>{link.label}</span>
            </Link>
          )
        })}

        <button
          onClick={handleLogout}
          className="mt-2 flex items-center gap-3 bg-background px-4 py-3 text-left text-sm font-medium text-muted-foreground transition-colors hover:border-destructive/30 hover:text-destructive"
        >
          <LogOut size={16} />
          <span>Log out</span>
        </button>
      </nav>
    </aside>
  )
}
