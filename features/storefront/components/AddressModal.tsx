"use client"

import { useActionState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { createAddress, updateAddress } from "@/features/storefront/lib/data/user"
import { Loader2 } from "lucide-react"

export function AddressModal({
  isOpen,
  onClose,
  address,
}: {
  isOpen: boolean
  onClose: () => void
  address?: any
}) {
  const [state, action, isPending] = useActionState(address ? updateAddress : createAddress, null)

  useEffect(() => {
    if (state?.success) {
      onClose()
    }
  }, [state, onClose])

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl bg-background p-0">
        <DialogHeader className=" px-6 py-5">
          <DialogTitle className="font-serif text-2xl font-semibold text-foreground">
            {address ? "Edit address" : "Add address"}
          </DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-5 px-6 py-6">
          {address ? <input type="hidden" name="id" value={address.id} /> : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="name" className="text-sm font-medium text-foreground">Name</Label>
              <Input id="name" name="name" defaultValue={address?.name} placeholder="Home, Work, Studio" className="h-11 border-border bg-card" required />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="address1" className="text-sm font-medium text-foreground">Address</Label>
              <Input id="address1" name="address1" defaultValue={address?.address1} className="h-11 border-border bg-card" required />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="address2" className="text-sm font-medium text-foreground">Apt / Suite</Label>
              <Input id="address2" name="address2" defaultValue={address?.address2} className="h-11 border-border bg-card" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city" className="text-sm font-medium text-foreground">City</Label>
              <Input id="city" name="city" defaultValue={address?.city} className="h-11 border-border bg-card" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state" className="text-sm font-medium text-foreground">State</Label>
              <Input id="state" name="state" defaultValue={address?.state} className="h-11 border-border bg-card" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="postalCode" className="text-sm font-medium text-foreground">ZIP / Postal</Label>
              <Input id="postalCode" name="postalCode" defaultValue={address?.postalCode} className="h-11 border-border bg-card" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="countryCode" className="text-sm font-medium text-foreground">Country code</Label>
              <Input id="countryCode" name="countryCode" defaultValue={address?.countryCode || address?.country || "US"} placeholder="US" className="h-11 border-border bg-card" required />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="phone" className="text-sm font-medium text-foreground">Phone</Label>
              <Input id="phone" name="phone" defaultValue={address?.phone} className="h-11 border-border bg-card" />
            </div>
          </div>

          <div className="grid gap-3 pt-5">
            <label htmlFor="isDefault" className="flex items-center gap-3 text-sm text-foreground">
              <Checkbox id="isDefault" name="isDefault" defaultChecked={address?.isDefault} />
              Set as default address
            </label>
            <label htmlFor="isBilling" className="flex items-center gap-3 text-sm text-foreground">
              <Checkbox id="isBilling" name="isBilling" defaultChecked={address?.isBilling} />
              Use as billing address
            </label>
          </div>

          <DialogFooter className="gap-3 pt-5 sm:justify-end">
            <Button type="button" variant="ghost" onClick={onClose} className="rounded-full px-5 text-sm text-foreground hover:border-primary/30 hover:text-primary">
              Cancel
            </Button>
            <Button type="submit" variant="ghost" disabled={isPending} className="rounded-full bg-primary px-5 text-sm text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground">
              {isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Save address
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
