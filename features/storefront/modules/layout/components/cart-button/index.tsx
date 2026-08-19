import CartDropdown, { type CartData } from "../cart-dropdown"

interface CartButtonProps {
  cart: CartData | null
  currencyCode: string
  locale: string
  brandHue: string
}

export default function CartButton({
  cart,
  currencyCode,
  locale,
  brandHue,
}: CartButtonProps) {
  return (
    <CartDropdown
      cart={cart}
      currencyCode={currencyCode}
      locale={locale}
      brandHue={brandHue}
    />
  )
}
