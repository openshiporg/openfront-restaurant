import { Metadata } from "next"
import { getUser } from "@/features/storefront/lib/data/user"
import { AddressBook } from "@/features/storefront/components/AddressBook"
import { notFound } from "next/navigation"

export const metadata: Metadata = {
  title: "Addresses",
  description: "Manage your saved addresses.",
}

export default async function AccountAddressesPage() {
  const user = await getUser()

  if (!user) {
    notFound()
  }

  return (
    <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className=" pb-6">
        <h1 className="mt-4 font-serif text-4xl font-semibold text-foreground">Saved addresses</h1>
        <p className="mt-2 text-base text-muted-foreground">
          Save as many addresses as you need. Delivery availability is still checked at checkout.
        </p>
      </div>
      <div className="pt-6">
        <AddressBook addresses={user.addresses || []} />
      </div>
    </div>
  )
}
