"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { MapPin, Plus, Trash2, Edit2, Loader2 } from "lucide-react"
import { deleteAddress } from "@/features/storefront/lib/data/user"
import { AddressModal } from "./AddressModal"
import { cn } from "@/lib/utils"

export function AddressBook({ addresses }: { addresses: any[] }) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingAddress, setEditingAddress] = useState<any>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const sortedAddresses = useMemo(
    () =>
      [...addresses].sort((left, right) => {
        if (left.isDefault !== right.isDefault) {
          return left.isDefault ? -1 : 1
        }

        if (left.isBilling !== right.isBilling) {
          return left.isBilling ? -1 : 1
        }

        return (left.name || "").localeCompare(right.name || "")
      }),
    [addresses]
  )

  const handleEdit = (address: any) => {
    setEditingAddress(address)
    setIsModalOpen(true)
  }

  const handleCreate = () => {
    setEditingAddress(null)
    setIsModalOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this address?")) {
      setDeletingId(id)
      await deleteAddress(id)
      setDeletingId(null)
    }
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-end">
        <Button variant="ghost" onClick={handleCreate} className="rounded-full px-5 text-sm text-foreground hover:border-primary/30 hover:text-primary">
          <Plus className="mr-2 size-4" />
          Add address
        </Button>
      </div>

      {sortedAddresses.length === 0 ? (
        <div className="border border-dashed border-border bg-muted/30 py-16 text-center">
          <MapPin className="mx-auto mb-4 size-8 text-muted-foreground/70" />
          <p className="text-base text-muted-foreground">No saved addresses yet.</p>
          <button onClick={handleCreate} className="mt-3 text-sm text-primary hover:underline">
            Add your first address
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sortedAddresses.map((address: any) => (
            <div key={address.id} className={cn("storefront-surface bg-background p-5", address.isDefault ? "border-primary/40" : undefined)}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="mt-1 flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <MapPin size={16} />
                  </div>
                  <div>
                    <p className="text-base font-medium text-foreground">{address.name}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {address.isDefault ? <span className=" bg-card px-2 py-0.5 text-xs text-primary">Default</span> : null}
                      {address.isBilling ? <span className=" bg-card px-2 py-0.5 text-xs text-primary">Billing</span> : null}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-1 text-sm text-muted-foreground">
                <p>{address.address1}</p>
                {address.address2 ? <p>{address.address2}</p> : null}
                <p>
                  {address.city}
                  {address.state ? `, ${address.state}` : ""} {address.postalCode}
                </p>
                {address.countryCode || address.country ? <p>{address.countryCode || address.country}</p> : null}
                {address.phone ? <p className="pt-1">{address.phone}</p> : null}
              </div>

              <div className="mt-5 flex items-center gap-2 pt-4">
                <button onClick={() => handleEdit(address)} className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary">
                  <Edit2 size={14} />
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(address.id)}
                  disabled={deletingId === address.id}
                  className="ml-auto inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
                >
                  {deletingId === address.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddressModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        address={editingAddress}
        key={editingAddress?.id || "new"}
      />
    </>
  )
}
