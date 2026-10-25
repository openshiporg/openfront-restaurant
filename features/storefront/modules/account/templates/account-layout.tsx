import { AccountPrivacy } from "../components/account-privacy"
import React from "react"
import AccountNav from "../components/account-nav"

interface AccountLayoutProps {
  user: any
  children: React.ReactNode
}

export default function AccountLayout({
  user,
  children,
}: AccountLayoutProps) {
  const isAuthView = !user

  return (
    <div className="flex-1 bg-background py-8 sm:py-10 lg:py-14" data-testid="account-page">
      <div className="storefront-shell">
        {isAuthView ? (
          <div className="flex min-h-[calc(100dvh-16rem)] items-center justify-center">{children}</div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-8">
            <AccountNav user={user} />
            <div className="bg-paper p-6 sm:p-8">{children}<AccountPrivacy /></div>
          </div>
        )}
      </div>
    </div>
  )
}
