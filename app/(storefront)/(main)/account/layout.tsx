import type { ReactNode } from "react"
import { getUser } from "@/features/storefront/lib/data/user"
import AccountNav from "@/features/storefront/modules/account/components/account-nav"
import { AccountPrivacy } from "@/features/storefront/modules/account/components/account-privacy"
import { PageHero } from "@/features/storefront/orbit/Pages"

export const metadata = { title: "Account", description: "Your orders, details and saved addresses." }

export default async function AccountLayout({ dashboard, login }: { dashboard?: ReactNode; login?: ReactNode }) {
  const user = await getUser()
  return (
    <div className="o-checkout o-acct" data-testid="account-page">
      <PageHero thin={user ? "Your" : "Sign"} heavy={user ? "Account" : "In"} lede={user ? `Signed in as ${user.email}` : "Track orders, reorder favourites and keep your details for checkout."} />
      <div className="o-shell" style={{ paddingBottom: "4rem" }}>
        {user ? (
          <div className="o-acct-grid">
            <AccountNav user={user} />
            <div className="storefront-card o-acct-panel">{dashboard}<AccountPrivacy /></div>
          </div>
        ) : (
          <div style={{ maxWidth: 560 }}>{login}</div>
        )}
      </div>
    </div>
  )
}
