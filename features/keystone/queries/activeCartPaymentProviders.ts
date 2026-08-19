import type { Context } from ".keystone/types";
import { isPaymentProviderConfigured } from "../utils/paymentProviderConfig";

export default async function activeCartPaymentProviders(
  root: any,
  _args: Record<string, never>,
  context: Context
) {
  const providers = await context.sudo().query.PaymentProvider.findMany({
    where: {
      isInstalled: { equals: true },
    },
    query: `
      id
      name
      code
      isInstalled
    `,
  });

  return providers.filter((provider: any) =>
    isPaymentProviderConfigured(provider.code || '')
  );
}
