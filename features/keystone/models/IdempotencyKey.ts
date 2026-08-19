import { list } from "@keystone-6/core";
import { integer, json, text, timestamp } from "@keystone-6/core/fields";
import { trackingFields } from "./trackingFields";

export const IdempotencyKey = list({
  access: {
    operation: {
      query: () => false,
      create: () => false,
      update: () => false,
      delete: () => false,
    },
  },
  ui: { isHidden: true },
  fields: {
    idempotencyKey: text({
      isIndexed: "unique",
      validation: { isRequired: true },
    }),
    requestMethod: text({ validation: { isRequired: true } }),
    requestParams: json(),
    requestPath: text({ validation: { isRequired: true } }),
    responseCode: integer(),
    responseBody: json(),
    recoveryPoint: text({
      defaultValue: "started",
      validation: { isRequired: true },
    }),
    lockedAt: timestamp(),
    ...trackingFields,
  },
});
