"use server"
import { gql } from "graphql-request"
import { openfrontClient } from "../config"
import { cache } from "react"
import type { StorefrontPaymentConfig } from "../store-data"

export const getStoreSettings = cache(async function () {
  const GET_STORE_SETTINGS_QUERY = gql`
    query GetStoreSettings {
      storeSettings {
        id
        name
        tagline
        logoIcon
        logoColor
        address
        phone
        email
        currencyCode
        locale
        timezone
        countryCode
        deliveryEnabled
        deliveryPostalCodes
        hours
        deliveryFee
        deliveryMinimum
        pickupDiscount
        taxRate
        estimatedDelivery
        estimatedPickup
        heroHeadline
        heroSubheadline
        heroTagline
        promoBanner
        rating
        reviewCount
      }
    }
  `;

  try {
    const data = await openfrontClient.request(GET_STORE_SETTINGS_QUERY);
    return data?.storeSettings || null;
  } catch (error) {
    console.error('Error fetching store settings:', error);
    return null;
  }
});

export const getMenuCategories = cache(async function () {
  const GET_MENU_CATEGORIES_QUERY = gql`
    query GetMenuCategories {
      menuCategories(orderBy: [{ sortOrder: asc }]) {
        id
        name
        description
        mealPeriods
        sortOrder
        icon
      }
    }
  `;

  try {
    const data = await openfrontClient.request(GET_MENU_CATEGORIES_QUERY);
    return data?.menuCategories || [];
  } catch (error) {
    console.error('Error fetching menu categories:', error);
    return [];
  }
});

export const getMenuItems = cache(async function (categoryId?: string) {
  const GET_MENU_ITEMS_QUERY = gql`
    query GetMenuItems($where: MenuItemWhereInput) {
      menuItems(
        where: $where
        orderBy: [{ name: asc }]
      ) {
        id
        name
        thumbnail
        description {
          document
        }
        price
        available
        featured
        popular
        calories
        prepTime
        kitchenStation
        allergens
        dietaryFlags
        mealPeriods
        category {
          id
          name
        }
        modifiers {
          id
          name
          modifierGroup
          modifierGroupLabel
          priceAdjustment
          calories
          defaultSelected
          required
          minSelections
          maxSelections
        }
      }
    }
  `;

  const where: any = { available: { equals: true } };
  if (categoryId && categoryId !== "all") {
    where.category = { id: { equals: categoryId } };
  }

  try {
    const data = await openfrontClient.request(GET_MENU_ITEMS_QUERY, { where });
    return data?.menuItems || [];
  } catch (error) {
    console.error('Error fetching menu items:', error);
    return [];
  }
});

export const getFeaturedMenuItems = cache(async function (take = 8) {
  const GET_FEATURED_ITEMS_QUERY = gql`
    query GetFeaturedItems($take: Int!) {
      menuItems(
        take: $take
        where: {
          available: { equals: true }
          featured: { equals: true }
        }
        orderBy: [{ name: asc }]
      ) {
        id
        name
        thumbnail
        description {
          document
        }
        price
        calories
        prepTime
        allergens
        dietaryFlags
        category {
          id
          name
        }
      }
    }
  `;

  try {
    const data = await openfrontClient.request(GET_FEATURED_ITEMS_QUERY, { take });
    return data?.menuItems || [];
  } catch (error) {
    console.error('Error fetching featured items:', error);
    return [];
  }
});

export const getMenuItem = cache(async function (id: string) {
  const GET_MENU_ITEM_QUERY = gql`
    query GetMenuItem($id: ID!) {
      menuItem(where: { id: $id }) {
        id
        name
        thumbnail
        description {
          document
        }
        price
        available
        featured
        popular
        calories
        prepTime
        kitchenStation
        allergens
        dietaryFlags
        mealPeriods
        category {
          id
          name
        }
        modifiers {
          id
          name
          modifierGroup
          modifierGroupLabel
          priceAdjustment
          calories
          defaultSelected
          required
          minSelections
          maxSelections
        }
      }
    }
  `;

  try {
    const data = await openfrontClient.request(GET_MENU_ITEM_QUERY, { id });
    return data?.menuItem || null;
  } catch (error) {
    console.error('Error fetching menu item:', error);
    return null;
  }
});

export const getStorefrontPaymentConfig = cache(async function (): Promise<StorefrontPaymentConfig> {
  const LIST_PAYMENT_PROVIDERS_QUERY = gql`
    query ListPaymentProviders {
      activeCartPaymentProviders {
        id
        name
        code
        isInstalled
      }
    }
  `

  const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_KEY || process.env.STRIPE_PUBLISHABLE_KEY || null
  const paypalClientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || null

  try {
    const data = await openfrontClient.request(LIST_PAYMENT_PROVIDERS_QUERY)
    const providers = data?.activeCartPaymentProviders || []

    const hasStripe = providers.some(
      (provider: any) => provider?.code?.startsWith('pp_stripe_')
    )

    const hasPayPal = providers.some(
      (provider: any) => provider?.code?.startsWith('pp_paypal')
    )

    const hasCash = providers.some(
      (provider: any) => provider?.code === 'pp_system_default'
    )

    return {
      hasStripe,
      hasPayPal,
      hasCash,
      stripePublishableKey: hasStripe ? stripePublishableKey : null,
      paypalClientId: hasPayPal ? paypalClientId : null,
    }
  } catch (error) {
    console.error('Error fetching storefront payment config:', error)

    return {
      hasStripe: !!stripePublishableKey,
      hasPayPal: !!paypalClientId,
      hasCash: true,
      stripePublishableKey,
      paypalClientId,
    }
  }
});
