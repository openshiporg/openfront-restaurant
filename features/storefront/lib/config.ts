/**
 * GraphQL client for storefront
 * Uses dynamic endpoint resolution like the dashboard
 */

import { GraphQLClient, RequestDocument, Variables } from 'graphql-request';
import { getGraphQLEndpoint } from './getBaseUrl';

class OpenfrontClient {
  private clients = new Map<number, Promise<GraphQLClient>>();

  private async getClient(timeout = 10000): Promise<GraphQLClient> {
    if (!this.clients.has(timeout)) {
      this.clients.set(timeout, (async () => {
        const endpoint = await getGraphQLEndpoint();
        return new GraphQLClient(endpoint, {
          credentials: 'include',
          headers: {
            'Connection': 'keep-alive',
          },
          timeout,
        });
      })());
    }
    return this.clients.get(timeout)!;
  }

  /**
   * For calls that must not be abandoned midway, like recording an order after
   * the card has been charged: give the server time to finish.
   */
  async requestPatient<T = any, V extends Variables = Variables>(
    document: RequestDocument,
    variables?: V,
    requestHeaders?: HeadersInit
  ): Promise<T> {
    const client = await this.getClient(60000);
    return await client.request(document, variables, requestHeaders);
  }

  async request<T = any, V extends Variables = Variables>(
    document: RequestDocument,
    variables?: V,
    requestHeaders?: HeadersInit
  ): Promise<T> {
    const client = await this.getClient();
    return await client.request(document, variables, requestHeaders);
  }
}

export const openfrontClient = new OpenfrontClient();
