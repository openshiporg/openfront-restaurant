"use client"

import { useEffect, useMemo, useState } from "react"
import { CircleCheck, Loader2, MapPin, Truck } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { cn } from "@/lib/utils"
import AddressSelect, { NEW_ADDRESS_VALUE, SAME_AS_DELIVERY_VALUE } from "../address-select"
import { setCheckoutContact, setCheckoutDelivery } from "@/features/storefront/lib/data/cart"
import compareAddresses from "@/features/storefront/lib/util/compare-addresses"
import {
  getDeliveryEligibility,
  normalizeCountryCode,
  normalizePostalCode,
} from "@/features/lib/delivery-zones"
import { calculateRestaurantTotals } from "@/features/lib/restaurant-order-pricing"
import { formatCurrency } from "@/features/storefront/lib/currency"

const sortAddresses = (addresses: any[] = []) =>
  [...addresses].sort((left, right) => {
    if (left.isDefault !== right.isDefault) {
      return left.isDefault ? -1 : 1
    }

    if (left.isBilling !== right.isBilling) {
      return left.isBilling ? -1 : 1
    }

    return (left.name || "").localeCompare(right.name || "")
  })

type AddressFormState = {
  address1: string
  address2: string
  city: string
  state: string
  postalCode: string
  countryCode: string
}

const toAddressFormState = (source: any, fallbackCountryCode?: string | null): AddressFormState => ({
  address1: source?.address1 || source?.deliveryAddress || "",
  address2: source?.address2 || source?.deliveryAddress2 || "",
  city: source?.city || source?.deliveryCity || "",
  state: source?.state || source?.deliveryState || "",
  postalCode: normalizePostalCode(source?.postalCode || source?.deliveryZip),
  countryCode: normalizeCountryCode(
    source?.countryCode || source?.country || source?.deliveryCountryCode || fallbackCountryCode || "US"
  ),
})

const getCartAddressSnapshot = (cart: any, fallbackCountryCode?: string | null) =>
  toAddressFormState(
    {
      address1: cart?.deliveryAddress,
      address2: cart?.deliveryAddress2,
      city: cart?.deliveryCity,
      state: cart?.deliveryState,
      postalCode: cart?.deliveryZip,
      countryCode: cart?.deliveryCountryCode,
    },
    fallbackCountryCode
  )

const hasSnapshotAddress = (address: AddressFormState) =>
  Boolean(address.address1 || address.city || address.postalCode || address.countryCode)

const getInitialDeliverySelection = ({
  cart,
  savedAddresses,
  storeCountryCode,
}: {
  cart: any
  savedAddresses: any[]
  storeCountryCode?: string | null
}) => {
  const cartAddress = getCartAddressSnapshot(cart, storeCountryCode)
  const matchedAddress = savedAddresses.find((address) => compareAddresses(address, cartAddress)) || null
  const fallbackAddress = matchedAddress || savedAddresses.find((address) => address.isDefault) || savedAddresses[0] || null

  return {
    selectedAddressId: matchedAddress?.id || fallbackAddress?.id || null,
    addressInfo:
      hasSnapshotAddress(cartAddress) && (cart?.deliveryAddress || cart?.deliveryZip)
        ? cartAddress
        : toAddressFormState(fallbackAddress, storeCountryCode),
  }
}

const getInitialBillingSelection = ({
  customer,
  savedAddresses,
  deliveryAddressInfo,
  storeCountryCode,
}: {
  customer: any
  savedAddresses: any[]
  deliveryAddressInfo: AddressFormState
  storeCountryCode?: string | null
}) => {
  const billingAddress =
    customer?.billingAddress || savedAddresses.find((address) => address.isBilling) || null
  const billingAddressInfo = billingAddress
    ? toAddressFormState(billingAddress, storeCountryCode)
    : deliveryAddressInfo

  return {
    billingSameAsDelivery:
      !billingAddress || compareAddresses(billingAddress, deliveryAddressInfo),
    selectedBillingAddressId: billingAddress?.id || null,
    billingAddressInfo,
  }
}

const formatAddressLines = (address: AddressFormState) => [
  address.address1,
  address.address2,
  [address.city, address.state].filter(Boolean).join(", "),
  [address.postalCode, address.countryCode].filter(Boolean).join(" "),
].filter(Boolean)

const AddressFields = ({
  idPrefix,
  address,
  onChange,
}: {
  idPrefix: string
  address: AddressFormState
  onChange: (field: keyof AddressFormState, value: string) => void
}) => {
  return (
    <div className="space-y-3">
      <div>
        <Label
          htmlFor={`${idPrefix}-address1`}
          className="text-[0.95rem] font-semibold text-ink-soft"
        >
          Street Address
        </Label>
        <Input
          id={`${idPrefix}-address1`}
          placeholder="123 Main St"
          className="mt-1.5 h-11 rounded-lg"
          value={address.address1}
          onChange={(event) => onChange("address1", event.target.value)}
          data-testid={`${idPrefix}-address-input`}
        />
      </div>
      <div>
        <Label
          htmlFor={`${idPrefix}-address2`}
          className="text-[0.95rem] font-semibold text-ink-soft"
        >
          Address 2
        </Label>
        <Input
          id={`${idPrefix}-address2`}
          placeholder="Apt, suite, unit, building"
          className="mt-1.5 h-11 rounded-lg"
          value={address.address2}
          onChange={(event) => onChange("address2", event.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label
            htmlFor={`${idPrefix}-city`}
            className="text-[0.95rem] font-semibold text-ink-soft"
          >
            City
          </Label>
          <Input
            id={`${idPrefix}-city`}
            placeholder="Brooklyn"
            className="mt-1.5 h-11 rounded-lg"
            value={address.city}
            onChange={(event) => onChange("city", event.target.value)}
            data-testid={`${idPrefix}-city-input`}
          />
        </div>
        <div>
          <Label
            htmlFor={`${idPrefix}-state`}
            className="text-[0.95rem] font-semibold text-ink-soft"
          >
            State / Province
          </Label>
          <Input
            id={`${idPrefix}-state`}
            placeholder="NY"
            className="mt-1.5 h-11 rounded-lg"
            value={address.state}
            onChange={(event) => onChange("state", event.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label
            htmlFor={`${idPrefix}-postal`}
            className="text-[0.95rem] font-semibold text-ink-soft"
          >
            ZIP / Postal Code
          </Label>
          <Input
            id={`${idPrefix}-postal`}
            placeholder="11201"
            className="mt-1.5 h-11 rounded-lg"
            value={address.postalCode}
            onChange={(event) => onChange("postalCode", event.target.value)}
            data-testid={`${idPrefix}-zip-input`}
          />
        </div>
        <div>
          <Label
            htmlFor={`${idPrefix}-country`}
            className="text-[0.95rem] font-semibold text-ink-soft"
          >
            Country Code
          </Label>
          <Input
            id={`${idPrefix}-country`}
            placeholder="US"
            className="mt-1.5 h-11 rounded-lg"
            value={address.countryCode}
            onChange={(event) => onChange("countryCode", event.target.value)}
          />
        </div>
      </div>
    </div>
  )
}

const Delivery = ({
  cart,
  customer,
  storeSettings,
}: {
  cart: any
  customer: any
  storeSettings: any
}) => {
  const user = customer
  const storeInfo = storeSettings || {}
  const savedAddresses = useMemo(() => sortAddresses(user?.addresses || []), [user?.addresses])
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const currentStep = searchParams?.get("step") || "contact"
  const isOpen = currentStep === "delivery"
  const orderType = cart?.orderType || "pickup"
  const deliveryEnabled = storeInfo.deliveryEnabled ?? true
  const allowedPostalCodes = Array.isArray(storeInfo.deliveryPostalCodes)
    ? storeInfo.deliveryPostalCodes
    : []
  const currencyConfig = {
    currencyCode: storeInfo?.currencyCode || "USD",
    locale: storeInfo?.locale || "en-US",
  }
  const deliveryPricing = useMemo(
    () =>
      calculateRestaurantTotals({
        subtotal: Number(cart?.subtotal || 0),
        orderType,
        tipPercent: Number(cart?.tipPercent || 0),
        deliveryFee: storeInfo?.deliveryFee,
        deliveryMinimum: storeInfo?.deliveryMinimum,
        pickupDiscountPercent: Number(storeInfo?.pickupDiscount || 0),
        taxRate: Number(storeInfo?.taxRate || 0),
        currencyCode: currencyConfig.currencyCode,
      }),
    [
      cart?.subtotal,
      cart?.tipPercent,
      orderType,
      storeInfo?.deliveryFee,
      storeInfo?.deliveryMinimum,
      storeInfo?.pickupDiscount,
      storeInfo?.taxRate,
      currencyConfig.currencyCode,
    ]
  )
  const deliveryMinimumNotMet = Boolean(deliveryPricing.deliveryMinimumNotMet)

  const initialDeliverySelection = useMemo(
    () =>
      getInitialDeliverySelection({
        cart,
        savedAddresses,
        storeCountryCode: storeInfo.countryCode,
      }),
    [cart, savedAddresses, storeInfo.countryCode]
  )

  const initialBillingSelection = useMemo(
    () =>
      getInitialBillingSelection({
        customer: user,
        savedAddresses,
        deliveryAddressInfo: initialDeliverySelection.addressInfo,
        storeCountryCode: storeInfo.countryCode,
      }),
    [initialDeliverySelection.addressInfo, savedAddresses, storeInfo.countryCode, user]
  )

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    initialDeliverySelection.selectedAddressId
  )
  const [hasModifiedFields, setHasModifiedFields] = useState(false)
  const [addressInfo, setAddressInfo] = useState(initialDeliverySelection.addressInfo)
  const [isCreatingNewAddress, setIsCreatingNewAddress] = useState(savedAddresses.length === 0)
  const [billingSameAsDelivery, setBillingSameAsDelivery] = useState(true)
  const [selectedBillingAddressId, setSelectedBillingAddressId] = useState<string | null>(
    initialBillingSelection.selectedBillingAddressId
  )
  const [hasModifiedBillingFields, setHasModifiedBillingFields] = useState(false)
  const [billingAddressInfo, setBillingAddressInfo] = useState(
    initialBillingSelection.billingAddressInfo
  )
  const [isCreatingNewBillingAddress, setIsCreatingNewBillingAddress] = useState(savedAddresses.length === 0)

  useEffect(() => {
    setSelectedAddressId(initialDeliverySelection.selectedAddressId)
    setAddressInfo(initialDeliverySelection.addressInfo)
    setHasModifiedFields(false)
  }, [initialDeliverySelection])

  useEffect(() => {
    setBillingSameAsDelivery(initialBillingSelection.billingSameAsDelivery)
    setSelectedBillingAddressId(initialBillingSelection.selectedBillingAddressId)
    setHasModifiedBillingFields(false)
    setBillingAddressInfo(initialBillingSelection.billingAddressInfo)
  }, [initialBillingSelection])

  const hasRequiredDeliveryFields =
    !!addressInfo.address1 &&
    !!addressInfo.city &&
    !!addressInfo.postalCode &&
    !!addressInfo.countryCode

  const hasRequiredBillingFields =
    !!billingAddressInfo.address1 &&
    !!billingAddressInfo.city &&
    !!billingAddressInfo.postalCode &&
    !!billingAddressInfo.countryCode

  const deliveryEligibility = useMemo(
    () =>
      getDeliveryEligibility({
        deliveryEnabled,
        storeCountryCode: storeInfo.countryCode,
        deliveryPostalCodes: allowedPostalCodes,
        addressCountryCode: addressInfo.countryCode,
        addressPostalCode: addressInfo.postalCode,
      }),
    [
      deliveryEnabled,
      storeInfo.countryCode,
      allowedPostalCodes,
      addressInfo.countryCode,
      addressInfo.postalCode,
    ]
  )

  const billingSummary = billingSameAsDelivery ? addressInfo : billingAddressInfo

  const isComplete =
    orderType === "pickup" ||
    (hasRequiredDeliveryFields &&
      deliveryEligibility.eligible &&
      !deliveryMinimumNotMet &&
      (billingSameAsDelivery || hasRequiredBillingFields))

  const deliveryErrorMessage = useMemo(() => {
    if (orderType !== "delivery") return null
    if (!deliveryEnabled) return "Delivery is not available for this restaurant right now."
    if (!hasRequiredDeliveryFields) return null

    switch (deliveryEligibility.reason) {
      case "country_mismatch":
        return `Delivery is only available within ${storeInfo.countryCode || "the store country"}.`
      case "postal_code_outside_zone":
        return "This address is outside the delivery zone."
      case "missing_delivery_zones":
        return "Delivery zones are not configured for this restaurant yet."
      default:
        return null
    }
  }, [
    orderType,
    deliveryEnabled,
    hasRequiredDeliveryFields,
    deliveryEligibility.reason,
    storeInfo.countryCode,
  ])

  const deliveryMinimumMessage =
    orderType === "delivery" && deliveryMinimumNotMet
      ? `Delivery requires a minimum subtotal of ${formatCurrency(storeInfo?.deliveryMinimum || 0, currencyConfig, {
          inputIsCents: false,
        })}. Add ${formatCurrency(deliveryPricing.deliveryMinimumShortfall, currencyConfig)} more or switch to pickup.`
      : null

  const handleEdit = () => {
    router.push(pathname + "?step=delivery", { scroll: false })
  }

  const handleAddressFieldChange = (field: keyof AddressFormState, value: string) => {
    setAddressInfo((prev) => ({
      ...prev,
      [field]:
        field === "postalCode"
          ? normalizePostalCode(value)
          : field === "countryCode"
            ? normalizeCountryCode(value)
            : value,
    }))

    if (selectedAddressId) {
      setHasModifiedFields(true)
    }
  }

  const handleBillingAddressFieldChange = (field: keyof AddressFormState, value: string) => {
    setBillingAddressInfo((prev) => ({
      ...prev,
      [field]:
        field === "postalCode"
          ? normalizePostalCode(value)
          : field === "countryCode"
            ? normalizeCountryCode(value)
            : value,
    }))

    if (selectedBillingAddressId) {
      setHasModifiedBillingFields(true)
    }
  }

  const handleAddressSelect = (address: any) => {
    setSelectedAddressId(address.id)
    setIsCreatingNewAddress(false)
    setHasModifiedFields(false)
    setAddressInfo(toAddressFormState(address, storeInfo.countryCode))
  }

  const handleNewDeliveryAddress = () => {
    setSelectedAddressId(NEW_ADDRESS_VALUE)
    setIsCreatingNewAddress(true)
    setHasModifiedFields(false)
    setAddressInfo(toAddressFormState(null, storeInfo.countryCode))
  }

  const handleBillingAddressSelect = (address: any) => {
    setBillingSameAsDelivery(false)
    setSelectedBillingAddressId(address.id)
    setIsCreatingNewBillingAddress(false)
    setHasModifiedBillingFields(false)
    setBillingAddressInfo(toAddressFormState(address, storeInfo.countryCode))
  }

  const handleNewBillingAddress = () => {
    setBillingSameAsDelivery(false)
    setSelectedBillingAddressId(NEW_ADDRESS_VALUE)
    setIsCreatingNewBillingAddress(true)
    setHasModifiedBillingFields(false)
    setBillingAddressInfo(toAddressFormState(null, storeInfo.countryCode))
  }

  const handleBillingSameAsDeliveryChange = () => {
    setBillingSameAsDelivery(true)
    setIsCreatingNewBillingAddress(false)
  }

  const handleSwitchToPickup = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const result = await setCheckoutContact({
        email: cart?.email || "",
        customerName: cart?.customerName || "",
        customerPhone: cart?.customerPhone || "",
        orderType: "pickup",
        userId: user?.id,
      })

      if (!result.success) {
        throw new Error(result.message || "Could not switch order type")
      }

      router.refresh()
      router.push(pathname + "?step=delivery", { scroll: false })
    } catch (err: any) {
      setError(err.message || "Could not switch to pickup")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (!isComplete) return

    if (orderType !== "delivery") {
      router.push(pathname + "?step=payment", { scroll: false })
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const result = await setCheckoutDelivery({
        selectedAddressId: isCreatingNewAddress ? null : selectedAddressId,
        hasModifiedFields: isCreatingNewAddress ? true : hasModifiedFields,
        deliveryAddress: addressInfo.address1,
        deliveryAddress2: addressInfo.address2,
        deliveryCity: addressInfo.city,
        deliveryState: addressInfo.state,
        deliveryZip: addressInfo.postalCode,
        deliveryCountryCode: addressInfo.countryCode,
        billingSameAsDelivery,
        selectedBillingAddressId: billingSameAsDelivery ? undefined : (isCreatingNewBillingAddress ? null : selectedBillingAddressId),
        hasModifiedBillingFields: billingSameAsDelivery ? undefined : (isCreatingNewBillingAddress ? true : hasModifiedBillingFields),
        billingAddress: billingSameAsDelivery ? addressInfo.address1 : billingAddressInfo.address1,
        billingAddress2: billingSameAsDelivery ? addressInfo.address2 : billingAddressInfo.address2,
        billingCity: billingSameAsDelivery ? addressInfo.city : billingAddressInfo.city,
        billingState: billingSameAsDelivery ? addressInfo.state : billingAddressInfo.state,
        billingZip: billingSameAsDelivery ? addressInfo.postalCode : billingAddressInfo.postalCode,
        billingCountryCode: billingSameAsDelivery
          ? addressInfo.countryCode
          : billingAddressInfo.countryCode,
      })

      if (!result.success) {
        throw new Error(result.message || "Could not update delivery details")
      }

      router.refresh()
      router.push(pathname + "?step=payment", { scroll: false })
    } catch (err: any) {
      setError(err.message || "Could not update delivery details")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div>
      <div className="mb-5 flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
            {orderType === "delivery" ? (
              <Truck className="h-4 w-4 text-foreground" />
            ) : (
              <MapPin className="h-4 w-4 text-foreground" />
            )}
          </div>
          <h2
            className={cn("font-serif text-xl font-bold tracking-tight", {
              "text-muted-foreground": !isOpen && !isComplete,
            })}
          >
            {orderType === "delivery" ? "Delivery Address" : "Pickup Location"}
          </h2>
          {!isOpen && isComplete ? <CircleCheck className="h-4 w-4 text-green-600" /> : null}
        </div>
        {!isOpen && isComplete ? (
          <Button
            onClick={handleEdit}
            data-testid="edit-delivery-button"
            variant="ghost"
            size="sm"
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Edit
          </Button>
        ) : null}
      </div>

      {isOpen ? (
        <div className="space-y-5">
          {orderType === "delivery" ? (
            <div className="space-y-5">
              {/* Delivery Zone Info at Top */}
              {allowedPostalCodes.length > 0 ? (
                <div className="rounded-xl bg-muted/30 p-3">
                  <p className="text-[0.95rem] font-semibold text-ink-soft">
                    Delivery Zone
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Delivery is available in {storeInfo.countryCode || "the store country"} for:{" "}
                    {allowedPostalCodes.join(", ")}
                  </p>
                </div>
              ) : null}

              <div className="space-y-4">
                {savedAddresses.length > 0 ? (
                  /* --- Has saved addresses: show both dropdowns --- */
                  <>
                    <AddressSelect
                      addresses={savedAddresses}
                      selectedAddressId={isCreatingNewAddress ? NEW_ADDRESS_VALUE : selectedAddressId}
                      onSelect={handleAddressSelect}
                      onNewAddress={handleNewDeliveryAddress}
                      label="Delivery Address"
                    />

                    {isCreatingNewAddress ? (
                      <AddressFields
                        idPrefix="delivery"
                        address={addressInfo}
                        onChange={handleAddressFieldChange}
                      />
                    ) : null}

                    <AddressSelect
                      addresses={savedAddresses}
                      selectedAddressId={billingSameAsDelivery ? SAME_AS_DELIVERY_VALUE : (isCreatingNewBillingAddress ? NEW_ADDRESS_VALUE : selectedBillingAddressId)}
                      onSelect={handleBillingAddressSelect}
                      onNewAddress={handleNewBillingAddress}
                      onSameAsDelivery={handleBillingSameAsDeliveryChange}
                      label="Billing Address"
                      showSameAsDeliveryOption={true}
                    />

                    {!billingSameAsDelivery && isCreatingNewBillingAddress ? (
                      <AddressFields
                        idPrefix="billing"
                        address={billingAddressInfo}
                        onChange={handleBillingAddressFieldChange}
                      />
                    ) : null}
                  </>
                ) : (
                  /* --- No saved addresses: show form + billing checkbox --- */
                  <>
                    <AddressFields
                      idPrefix="delivery"
                      address={addressInfo}
                      onChange={handleAddressFieldChange}
                    />

                    <div className="flex items-start gap-3 rounded-xl bg-muted/30 p-3">
                      <Checkbox
                        id="billing-same-as-delivery"
                        checked={billingSameAsDelivery}
                        onCheckedChange={(checked) => setBillingSameAsDelivery(Boolean(checked))}
                        className="mt-0.5"
                      />
                      <Label htmlFor="billing-same-as-delivery" className="text-sm font-medium">
                        Billing address same as delivery
                      </Label>
                    </div>

                    {!billingSameAsDelivery ? (
                      <div className="space-y-3">
                        <p className="text-[0.95rem] font-semibold text-ink-soft">
                          Billing Address
                        </p>
                        <AddressFields
                          idPrefix="billing"
                          address={billingAddressInfo}
                          onChange={handleBillingAddressFieldChange}
                        />
                      </div>
                    ) : null}
                  </>
                )}
              </div>


              {deliveryErrorMessage ? (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
                  <p className="text-sm font-medium text-amber-800">{deliveryErrorMessage}</p>
                  <p className="mt-1 text-xs text-amber-700/90">
                    You can still switch this order to pickup and keep the same cart.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={handleSwitchToPickup}
                    disabled={isLoading}
                  >
                    Switch to Pickup
                  </Button>
                </div>
              ) : null}

              {deliveryMinimumMessage ? (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
                  <p className="text-sm font-medium text-amber-800">{deliveryMinimumMessage}</p>
                  <p className="mt-1 text-xs text-amber-700/90">
                    Delivery fee:{" "}
                    {formatCurrency(storeInfo?.deliveryFee || 0, currencyConfig, {
                      inputIsCents: false,
                    })}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={handleSwitchToPickup}
                    disabled={isLoading}
                  >
                    Switch to Pickup
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-xl bg-muted/50 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-background">
                  <MapPin className="h-4 w-4 text-foreground" />
                </div>
                <div>
                  <h3 className="mb-1 text-sm font-semibold">Pickup Location</h3>
                  <p className="text-sm text-muted-foreground">{storeInfo.address}</p>
                  {storeInfo.estimatedPickup ? (
                    <p className="mt-1 text-sm font-medium text-foreground">
                      Estimated ready in {storeInfo.estimatedPickup}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          {error ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs leading-5 text-destructive">
              {error}
            </div>
          ) : null}

          <Button
            size="lg"
            onClick={handleSubmit}
            disabled={!isComplete || isLoading}
            data-testid="submit-delivery-button"
            className="h-12 w-full rounded-xl font-semibold"
          >
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Continue to Payment
          </Button>
        </div>
      ) : isComplete ? (
        <div className="space-y-4 pl-11" data-testid="delivery-summary">
          {orderType === "delivery" ? (
            <>
              <div>
                <p className="mb-1 text-[0.95rem] font-semibold text-ink-soft">
                  Delivery Address
                </p>
                {formatAddressLines(addressInfo).map((line) => (
                  <p key={line} className="text-sm text-muted-foreground">
                    {line}
                  </p>
                ))}
              </div>
              <div>
                <p className="mb-1 text-[0.95rem] font-semibold text-ink-soft">
                  Billing Address
                </p>
                {billingSameAsDelivery ? (
                  <p className="text-sm text-muted-foreground">
                    Billing address is the same as your delivery address.
                  </p>
                ) : (
                  formatAddressLines(billingSummary).map((line) => (
                    <p key={line} className="text-sm text-muted-foreground">
                      {line}
                    </p>
                  ))
                )}
              </div>
            </>
          ) : (
            <>
              <p className="mb-1 text-[0.95rem] font-semibold text-ink-soft">
                Pickup Location
              </p>
              <p className="text-sm text-foreground">{storeInfo.address}</p>
              {storeInfo.estimatedPickup ? (
                <p className="text-sm font-medium text-foreground">
                  Estimated ready in {storeInfo.estimatedPickup}
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

export default Delivery
