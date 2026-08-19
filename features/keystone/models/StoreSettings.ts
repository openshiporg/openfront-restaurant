import { graphql, list } from "@keystone-6/core";
import { text, integer, decimal, json, checkbox, virtual } from "@keystone-6/core/fields";

import { permissions } from "../access";
import { trackingFields } from "./trackingFields";
import {
  DEFAULT_STORE_LOGO_COLOR,
  DEFAULT_STORE_LOGO_ICON,
  normalizeStoreLogoColor,
} from "../../lib/store-logo";
import { sanitizeStoreLogoSvg } from "../utils/storeLogo";
import { getPublicPaymentProviderConfig } from "../utils/paymentProviderConfig";

export const StoreSettings = list({
  access: {
    operation: {
      query: () => true, // Public read for storefront
      create: permissions.canManageSettings,
      update: permissions.canManageSettings,
      delete: permissions.canManageSettings,
    },
  },
  isSingleton: true,
  graphql: {
    plural: 'storeSettingsItems',
  },
  ui: {
    listView: {
      initialColumns: ["name", "tagline", "phone"],
    },
  },
  fields: {
    // Basic Info
    name: text({
      validation: { isRequired: true },
      ui: { description: "Restaurant name" },
    }),

    tagline: text({
      ui: { description: "Short tagline (e.g., 'Artisan Burgers & Craft Sides')" },
    }),

    logoIcon: text({
      defaultValue: DEFAULT_STORE_LOGO_ICON,
      ui: { description: "Sanitized SVG used by the storefront and marketplace" },
      hooks: {
        resolveInput: ({ resolvedData, fieldKey }) => {
          const value = resolvedData[fieldKey];
          if (value === undefined || value === null || value === '') return value;
          return typeof value === 'string' ? sanitizeStoreLogoSvg(value) : '';
        },
        validate: ({ inputData, resolvedData, fieldKey, addValidationError }) => {
          const submitted = inputData?.[fieldKey];
          if (typeof submitted === 'string' && submitted.trim() && !resolvedData?.[fieldKey]) {
            addValidationError('Logo must be a valid, safe SVG document');
          }
        },
      },
    }),

    logoColor: text({
      defaultValue: DEFAULT_STORE_LOGO_COLOR,
      ui: { description: "CSS hue rotation in degrees" },
      hooks: {
        resolveInput: ({ resolvedData, fieldKey }) => {
          const value = resolvedData[fieldKey];
          return value === undefined ? value : normalizeStoreLogoColor(value);
        },
      },
    }),

    paymentProviders: virtual({
      field: graphql.field({
        type: graphql.list(
          graphql.object<{ provider: string; publishableKey: string }>()({
            name: 'RestaurantPaymentProviderConfig',
            fields: {
              provider: graphql.field({ type: graphql.String }),
              publishableKey: graphql.field({ type: graphql.String }),
            },
          })
        ),
        resolve: async (_item, _args, context) => {
          const installedProviders = await context.sudo().query.PaymentProvider.findMany({
            where: { isInstalled: { equals: true } },
            query: 'code',
          });
          return installedProviders
            .map((provider: any) => getPublicPaymentProviderConfig(provider.code || ''))
            .filter((provider): provider is { provider: 'stripe' | 'paypal'; publishableKey: string } => Boolean(provider));
        },
      }),
      ui: { query: '{ provider publishableKey }' },
    }),

    // Contact
    address: text({
      ui: { description: "Full street address" },
    }),

    phone: text({
      ui: { description: "Phone number" },
    }),

    email: text({
      ui: { description: "Contact email" },
    }),

    // Localization
    currencyCode: text({
      defaultValue: "USD",
      ui: { description: "ISO 4217 currency code (e.g. USD, EUR, JPY)" },
    }),

    locale: text({
      defaultValue: "en-US",
      ui: { description: "Locale used for formatting numbers/dates (e.g. en-US)" },
    }),

    timezone: text({
      defaultValue: "America/New_York",
      ui: { description: "IANA timezone (e.g. America/New_York)" },
    }),

    countryCode: text({
      defaultValue: "US",
      ui: { description: "Primary storefront country code (ISO 3166-1 alpha-2)" },
    }),

    // Hours (stored as JSON for flexibility)
    hours: json({
      defaultValue: {
        monday: "11:00 AM - 10:00 PM",
        tuesday: "11:00 AM - 10:00 PM",
        wednesday: "11:00 AM - 10:00 PM",
        thursday: "11:00 AM - 10:00 PM",
        friday: "11:00 AM - 11:00 PM",
        saturday: "10:00 AM - 11:00 PM",
        sunday: "10:00 AM - 9:00 PM",
      },
      ui: { description: "Operating hours by day of week" },
    }),

    // Tax
    taxRate: decimal({
      precision: 5,
      scale: 2,
      defaultValue: "8.75",
      ui: { description: "Tax rate percentage (e.g. 8.75 for 8.75%)" },
    }),

    // Delivery/Pickup Settings
    deliveryEnabled: checkbox({
      defaultValue: true,
      ui: { description: "Allow customers to choose delivery at checkout" },
    }),

    deliveryPostalCodes: json({
      defaultValue: ["11201"],
      ui: { description: "Allowed delivery ZIP/postal codes" },
    }),

    deliveryFee: decimal({
      precision: 10,
      scale: 2,
      defaultValue: "4.99",
      ui: { description: "Delivery fee amount" },
    }),

    deliveryMinimum: decimal({
      precision: 10,
      scale: 2,
      defaultValue: "15.00",
      ui: { description: "Minimum order for delivery" },
    }),

    pickupDiscount: integer({
      defaultValue: 10,
      ui: { description: "Pickup discount percentage" },
    }),

    estimatedDelivery: text({
      defaultValue: "30-45 min",
      ui: { description: "Estimated delivery time" },
    }),

    estimatedPickup: text({
      defaultValue: "15-20 min",
      ui: { description: "Estimated pickup time" },
    }),

    // Hero/Branding
    heroHeadline: text({
      defaultValue: "Fresh meals for pickup and delivery.",
      ui: { description: "Main hero headline" },
    }),

    heroSubheadline: text({
      defaultValue: "A modern ordering storefront with house favorites, quick pickup, and a menu built to customize.",
      ui: { description: "Hero subheadline/description" },
    }),

    heroTagline: text({
      defaultValue: "Made fresh daily · Ready when you are",
      ui: { description: "Small tagline above headline" },
    }),

    // Promo Banner
    promoBanner: text({
      defaultValue: "Free pickup discount · 10% off all pickup orders",
      ui: { description: "Promotional banner text at top of page" },
    }),

    // Social/Reviews (optional display data)
    rating: decimal({
      precision: 2,
      scale: 1,
      defaultValue: "4.8",
      ui: { description: "Average rating to display" },
    }),

    reviewCount: integer({
      defaultValue: 0,
      ui: { description: "Number of reviews to display" },
    }),
    ...trackingFields,
  },
});
