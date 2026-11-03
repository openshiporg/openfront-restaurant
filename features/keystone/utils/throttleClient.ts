import { verifiedInternalIdentity } from "../security/internalIdentity";

/**
 * Who a public throttle counts, in this order:
 *  1. the end user's signed identity (accepted only from a loopback socket with a fresh HMAC);
 *  2. on Railway, the edge-supplied x-real-ip (never the client-extendable first x-forwarded-for entry);
 *  3. the socket address.
 */
export function throttleClient(req: any, secret = String(process.env.SESSION_SECRET || ""), now = Date.now()): string {
  const headers = (req?.headers || {}) as Record<string, string | string[] | undefined>;
  const socket = req?.socket?.remoteAddress as string | undefined;
  const internal = verifiedInternalIdentity(headers, socket, secret, now);
  if (internal) return internal;
  if (process.env.RAILWAY_ENVIRONMENT) {
    const realIp = String(headers["x-real-ip"] || "").split(",")[0]?.trim();
    if (realIp) return realIp;
  }
  return socket || "unknown";
}
