import { list } from "@keystone-6/core";
import { integer, text, checkbox, json, timestamp, relationship } from "@keystone-6/core/fields";

import { isSignedIn, permissions } from "../access";
import { trackingFields } from "./trackingFields";

export const GiftCard = list({
  access: {
    operation: {
      query: permissions.canReadGiftCards,
      create: permissions.canManageGiftCards,
      update: () => false,
      delete: () => false,
    },
  },
  ui: {
    listView: {
      initialColumns: ["code", "value", "balance", "isDisabled"],
    },
  },
  fields: {
    code: text({
      validation: { isRequired: true },
      isIndexed: "unique",
    }),
    value: integer({
      validation: { isRequired: true },
    }),
    balance: integer({
      validation: { isRequired: true },
    }),
    isDisabled: checkbox(),
    endsAt: timestamp(),
    metadata: json(),
    ...trackingFields,
    order: relationship({
      ref: "RestaurantOrder.giftCards",
    }),
    giftCardTransactions: relationship({
      ref: "GiftCardTransaction.giftCard",
      many: true,
    }),
  },
});
