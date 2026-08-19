export interface MenuItemImage {
  image?: { url: string }
  imagePath?: string
  altText?: string
  order?: number
}

export interface MenuItem {
  id: string
  name: string
  description: string | { document: any }
  price: number | string
  thumbnail?: string | null
  menuItemImages?: MenuItemImage[]
  category?: { id: string; name: string } | string
  categoryId?: string
  calories?: number
  popular?: boolean
  featured?: boolean
  available?: boolean
  prepTime?: number
  kitchenStation?: string
  allergens?: string[]
  dietaryFlags?: string[]
  mealPeriods?: string[]
  modifiers?: MenuItemModifier[]
}

export interface MenuItemModifier {
  id: string
  name: string
  modifierGroup?: string
  modifierGroupLabel?: string
  priceAdjustment: number | string
  calories?: number
  defaultSelected?: boolean
  required?: boolean
  minSelections?: number
  maxSelections?: number
}

export interface ModifierGroup {
  id: string
  name: string
  required: boolean
  min: number
  max: number
  modifiers: Modifier[]
}

export interface Modifier {
  id: string
  name: string
  price: number
  calories?: number
  default?: boolean
}

export interface MenuCategory {
  id: string
  name: string
  description?: string
  icon?: string
  mealPeriods?: string[]
  sortOrder?: number
}

export interface CartItem {
  id: string
  menuItem: MenuItem
  quantity: number
  modifiers: SelectedModifier[]
  specialInstructions?: string
}

export interface SelectedModifier {
  groupId: string
  modifierId: string
  name: string
  price: number
}

export interface DayHours {
  enabled?: boolean
  open?: string
  close?: string
  ranges?: Array<{
    open: string
    close: string
  }>
}

export interface StoreInfo {
  name: string
  tagline: string
  logoIcon?: string
  logoColor?: string
  address: string
  phone: string
  currencyCode: string
  locale: string
  timezone: string
  countryCode?: string
  hours: {
    monday?: string | DayHours
    tuesday?: string | DayHours
    wednesday?: string | DayHours
    thursday?: string | DayHours
    friday?: string | DayHours
    saturday?: string | DayHours
    sunday?: string | DayHours
  }
  deliveryEnabled?: boolean
  deliveryPostalCodes?: string[]
  deliveryFee: number
  deliveryMinimum: number
  pickupDiscount: number
  taxRate: number
  estimatedDelivery: string
  estimatedPickup: string
  heroHeadline?: string
  heroSubheadline?: string
  heroTagline?: string
  promoBanner?: string
  rating?: number
  reviewCount?: number
}

export interface StorefrontPaymentConfig {
  hasStripe: boolean
  hasPayPal: boolean
  hasCash: boolean
  stripePublishableKey: string | null
  paypalClientId: string | null
}
