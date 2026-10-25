"use client"

import { useActionState, useEffect, useState } from "react"
import { upsertBillingAddress } from "@/features/storefront/lib/data/user"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Loader2, Check } from "lucide-react"

export default function ProfileBillingAddress({ customer }: { customer: any }) {
  const [state, action, isPending] = useActionState(upsertBillingAddress, null)
  const [success, setSuccess] = useState(false)
  const billingAddress = customer?.billingAddress

  useEffect(() => {
    if (state?.success) {
      setSuccess(true)
      const timer = setTimeout(() => setSuccess(false), 3000)
      return () => clearTimeout(timer)
    }
  }, [state])

  return (
    <form action={action} className="storefront-surface bg-background p-5 sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-primary">Billing address</p>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            This address is used when card payments need billing details. You can still manage all saved addresses separately.
          </p>

          <input type="hidden" name="id" value={billingAddress?.id || ""} />
          <input type="hidden" name="name" value="Billing Address" />

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="billing-address1" className="text-sm font-medium text-foreground">Street address</Label>
              <Input id="billing-address1" name="address1" defaultValue={billingAddress?.address1 || ""} required className="h-11 border-border bg-card" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="billing-address2" className="text-sm font-medium text-foreground">Address 2</Label>
              <Input id="billing-address2" name="address2" defaultValue={billingAddress?.address2 || ""} className="h-11 border-border bg-card" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="billing-city" className="text-sm font-medium text-foreground">City</Label>
              <Input id="billing-city" name="city" defaultValue={billingAddress?.city || ""} required className="h-11 border-border bg-card" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="billing-state" className="text-sm font-medium text-foreground">State / Province</Label>
              <Input id="billing-state" name="state" defaultValue={billingAddress?.state || ""} className="h-11 border-border bg-card" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="billing-postal" className="text-sm font-medium text-foreground">ZIP / Postal Code</Label>
              <Input id="billing-postal" name="postalCode" defaultValue={billingAddress?.postalCode || ""} required className="h-11 border-border bg-card" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="billing-country" className="text-sm font-medium text-foreground">Country Code</Label>
              <Input id="billing-country" name="countryCode" defaultValue={billingAddress?.countryCode || billingAddress?.country || "US"} required className="h-11 border-border bg-card" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="billing-phone" className="text-sm font-medium text-foreground">Phone</Label>
              <Input id="billing-phone" name="phone" defaultValue={billingAddress?.phone || customer?.phone || ""} className="h-11 max-w-sm border-border bg-card" />
            </div>
          </div>

          {state?.error ? <p className="mt-3 text-sm text-destructive">{state.error}</p> : null}
        </div>

        <Button type="submit" variant="ghost" disabled={isPending} className="h-11 rounded-full px-5 text-sm text-foreground hover:border-primary/30 hover:text-primary">
          {isPending ? <Loader2 size={14} className="mr-2 animate-spin" /> : success ? <Check size={14} className="mr-2 text-emerald-600" /> : null}
          {success ? "Saved" : "Save"}
        </Button>
      </div>
    </form>
  )
}
