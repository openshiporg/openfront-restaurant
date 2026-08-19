import { list } from "@keystone-6/core";
import { denyAll } from "@keystone-6/core/access";
import {
  checkbox,
  integer,
  json,
  text,
  timestamp,
  relationship,
} from "@keystone-6/core/fields";
import { permissions } from "../access";
import { trackingFields } from "./trackingFields";

export const PaymentSession = list({
  access: {
    operation: {
      query: ({ session }) =>
        permissions.canManageOrders({ session }),
      create: () => false,
      update: () => false,
      delete: () => false,
    },
  },
  fields: {
    isSelected: checkbox({
      defaultValue: false,
    }),
    isInitiated: checkbox({
      defaultValue: false,
    }),
    amount: integer({
      validation: { isRequired: true },
    }),
    data: json({
      defaultValue: {},
    }),
    idempotencyKey: text({
      validation: { isRequired: true },
      isIndexed: "unique",
    }),
    paymentCollection: relationship({
      ref: "PaymentCollection.paymentSessions",
    }),
    paymentProvider: relationship({
      ref: "PaymentProvider.sessions",
      many: false,
    }),
    paymentAuthorizedAt: timestamp(),
    ...trackingFields,
  },
});
