import { Metadata } from "next"
import { getUser } from "@/features/storefront/lib/data/user"
import ProfileName from "@/features/storefront/modules/account/components/profile-name"
import ProfileEmail from "@/features/storefront/modules/account/components/profile-email"
import ProfilePhone from "@/features/storefront/modules/account/components/profile-phone"
import ProfileBillingAddress from "@/features/storefront/modules/account/components/profile-billing-address"
import { notFound } from "next/navigation"

export const metadata: Metadata = {
  title: "Profile",
  description: "View and edit your profile.",
}

export default async function AccountProfilePage() {
  const customer = await getUser()

  if (!customer) {
    notFound()
  }

  return (
    <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className=" pb-6">
        <h1 className="mt-4 font-serif text-4xl font-semibold text-foreground">Manage your details</h1>
        <p className="mt-2 text-base text-muted-foreground">
          Update your name, email address, phone number, and billing address.
        </p>
      </div>

      <div className="mt-6 space-y-4">
        <ProfileName customer={customer} />
        <ProfileEmail customer={customer} />
        <ProfilePhone customer={customer} />
        <ProfileBillingAddress customer={customer} />
      </div>
    </div>
  )
}
