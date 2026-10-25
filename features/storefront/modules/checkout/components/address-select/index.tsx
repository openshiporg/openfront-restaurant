"use client"

import { useId } from "react"
import { Plus } from "lucide-react"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

type Address = {
  id: string
  name?: string
  address1: string
  address2?: string | null
  city: string
  state?: string | null
  postalCode: string
  countryCode?: string | null
  country?: string | { iso2?: string | null } | null
  phone?: string | null
  isDefault?: boolean
  isBilling?: boolean
}

type AddressSelectProps = {
  addresses: Address[]
  selectedAddressId?: string | null
  onSelect: (address: Address) => void
  onNewAddress?: () => void
  onSameAsDelivery?: () => void
  label?: string
  showNewAddressOption?: boolean
  showSameAsDeliveryOption?: boolean
}

const NEW_ADDRESS_VALUE = "__new__"
const SAME_AS_DELIVERY_VALUE = "__same__"

const getCountryCode = (address: Address) =>
  typeof address.country === "object"
    ? address.country?.iso2
    : address.country || address.countryCode

const formatAddressLine = (address: Address) =>
  [
    address.address1,
    address.address2,
    `${address.city}${address.state ? `, ${address.state}` : ""}`,
    `${address.postalCode}${
      getCountryCode(address) ? ` ${String(getCountryCode(address)).toUpperCase()}` : ""
    }`,
  ]
    .filter(Boolean)
    .join(", ")

const AddressSelect = ({
  addresses,
  selectedAddressId,
  onSelect,
  onNewAddress,
  onSameAsDelivery,
  label,
  showNewAddressOption = true,
  showSameAsDeliveryOption = false,
}: AddressSelectProps) => {
  const id = useId()
  const selectedAddress =
    addresses.find((address) => address.id === selectedAddressId) || null

  const isNewSelected = selectedAddressId === NEW_ADDRESS_VALUE
  const isSameAsDelivery = selectedAddressId === SAME_AS_DELIVERY_VALUE

  return (
    <div className="space-y-2">
      {label ? (
        <Label
          htmlFor={id}
          className="text-[0.95rem] font-semibold text-ink-soft"
        >
          {label}
        </Label>
      ) : null}
      <Select
        value={isSameAsDelivery ? SAME_AS_DELIVERY_VALUE : isNewSelected ? NEW_ADDRESS_VALUE : selectedAddress?.id}
        onValueChange={(value) => {
          if (value === SAME_AS_DELIVERY_VALUE) {
            onSameAsDelivery?.()
            return
          }
          if (value === NEW_ADDRESS_VALUE) {
            onNewAddress?.()
            return
          }
          const savedAddress = addresses.find((address) => address.id === value)
          if (savedAddress) {
            onSelect(savedAddress)
          }
        }}
      >
        <SelectTrigger
          id={id}
          className="bg-muted/40 h-auto min-h-12 ps-3 text-left [&>span]:flex [&>span]:items-center [&>span]:gap-2"
        >
          <SelectValue placeholder="Choose an address">
            {isSameAsDelivery ? (
              <span className="py-1 text-sm font-medium">Same as delivery address</span>
            ) : isNewSelected ? (
              <span className="flex items-center gap-2 py-1 text-sm font-medium">
                <Plus className="h-3.5 w-3.5" />
                New address
              </span>
            ) : selectedAddress ? (
              <span className="flex flex-col gap-0.5 py-1">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <span>{selectedAddress.name || selectedAddress.address1}</span>
                  {selectedAddress.isDefault ? (
                    <span className="bg-steel px-2 py-0.5 text-sm font-semibold text-ink">
                      Default
                    </span>
                  ) : null}
                  {selectedAddress.isBilling ? (
                    <span className="bg-steel px-2 py-0.5 text-sm font-semibold text-ink">
                      Billing
                    </span>
                  ) : null}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatAddressLine(selectedAddress)}
                </span>
              </span>
            ) : null}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="[&_*[role=option]]:ps-2 [&_*[role=option]]:pe-8 [&_*[role=option]>span]:start-auto [&_*[role=option]>span]:end-2">
          {showSameAsDeliveryOption ? (
            <>
              <SelectItem
                value={SAME_AS_DELIVERY_VALUE}
                className="cursor-pointer py-3"
              >
                <span className="text-sm font-medium">Same as delivery address</span>
              </SelectItem>
              <SelectSeparator />
            </>
          ) : null}
          {addresses.map((address) => (
            <SelectItem
              key={address.id}
              value={address.id}
              className={cn(
                "cursor-pointer py-3",
                selectedAddress?.id === address.id && "bg-accent"
              )}
            >
              <span className="flex flex-col gap-0.5">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <span>{address.name || address.address1}</span>
                  {address.isDefault ? (
                    <span className="bg-steel px-1.5 py-0.5 text-sm font-semibold text-ink">
                      Default
                    </span>
                  ) : null}
                  {address.isBilling ? (
                    <span className="bg-steel px-1.5 py-0.5 text-sm font-semibold text-ink">
                      Billing
                    </span>
                  ) : null}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatAddressLine(address)}
                </span>
              </span>
            </SelectItem>
          ))}
          {showNewAddressOption ? (
            <>
              <SelectSeparator />
              <SelectItem
                value={NEW_ADDRESS_VALUE}
                className="cursor-pointer py-3"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-primary">
                  <Plus className="h-3.5 w-3.5" />
                  Add new address
                </span>
              </SelectItem>
            </>
          ) : null}
        </SelectContent>
      </Select>
    </div>
  )
}

export { NEW_ADDRESS_VALUE, SAME_AS_DELIVERY_VALUE }
export default AddressSelect
