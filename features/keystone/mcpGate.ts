import { keystoneContext } from '@/features/keystone/context';

/**
 * MCP transport gate (E-commerce pattern): every call must run as a signed-in
 * Keystone user. The transport forwards only the caller's cookie, so an
 * anonymous call could never do more than an anonymous GraphQL request, but it
 * still ran schema introspection and listed tools for anyone. Refuse it first.
 */
export async function requireMcpSession(request: Request, body: any): Promise<Response | null> {
  const cookie = request.headers.get('cookie') || '';
  let signedIn = false;
  if (cookie) {
    try {
      const context = await keystoneContext.withRequest({ headers: { cookie }, method: 'POST', url: new URL(request.url).pathname } as any);
      signedIn = Boolean(context.session?.itemId);
    } catch {
      signedIn = false;
    }
  }
  if (signedIn) return null;
  const id = body && typeof body === 'object' && 'id' in body ? body.id : null;
  return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32001, message: 'Sign in required' } }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
