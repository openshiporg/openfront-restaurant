import { list } from "@keystone-6/core";
import { text, checkbox, json, relationship } from "@keystone-6/core/fields";

import { isSignedIn, permissions } from "../access";
import { trackingFields } from "./trackingFields";

const canConfigureProvider = (args: any) => isSignedIn(args) && permissions.canManagePayments(args);

export const PaymentProvider = list({
  access: {
    operation: {
      query: ({ session }) =>
        permissions.canReadPayments({ session }) ||
        permissions.canManagePayments({ session }),
      create: canConfigureProvider,
      update: canConfigureProvider,
      delete: canConfigureProvider,
    },
  },
  ui: {
    listView: {
      initialColumns: ["name", "code", "isInstalled"],
    },
  },
  fields: {
    name: text({
      validation: { isRequired: true },
    }),
    code: text({
      isIndexed: "unique",
      validation: {
        isRequired: true,
        match: {
          regex: /^pp_[a-zA-Z0-9-_]+$/,
          explanation:
            'Payment provider code must start with "pp_" followed by alphanumeric characters, hyphens or underscores',
        },
      },
    }),
    isInstalled: checkbox({
      defaultValue: true,
    }),
    credentials: json({
      access: { read: () => false, create: canConfigureProvider, update: canConfigureProvider },
      defaultValue: {},
    }),
    metadata: json({
      defaultValue: {},
    }),
    createPaymentFunction: text({
      validation: { isRequired: true },
      ui: {
        description: "Name of the adapter function to create payments",
      },
    }),
    capturePaymentFunction: text({
      validation: { isRequired: true },
      ui: {
        description: "Name of the adapter function to capture payments",
      },
    }),
    refundPaymentFunction: text({
      validation: { isRequired: true },
      ui: {
        description: "Name of the adapter function to refund payments",
      },
    }),
    getPaymentStatusFunction: text({
      validation: { isRequired: true },
      ui: {
        description: "Name of the adapter function to check payment status",
      },
    }),
    generatePaymentLinkFunction: text({
      validation: { isRequired: true },
      ui: {
        description: "Name of the adapter function to generate payment dashboard links",
      },
    }),
    handleWebhookFunction: text({
      validation: { isRequired: true },
      ui: {
        description: "Name of the adapter function to handle provider webhooks",
      },
    }),
    sessions: relationship({
      ref: "PaymentSession.paymentProvider",
      many: true,
    }),
    ...trackingFields,
  },
});
