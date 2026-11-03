import { isIP } from "node:net";
import { verifiedInternalIdentity } from "../security/internalIdentity";

/**
 * Railway's HTTP edge overwrites X-Real-IP with the connecting client, while the socket peer is one of
 * several edge addresses. So only on Railway (RAILWAY_ENVIRONMENT), and only from a non-loopback peer, a
 * single valid X-Real-IP is the client. Loopback callers are this app's own server: they use the signed
 * identity instead. (Same rule as hotel/airline/gym.)
 */
export function railwayEdgeClientIp(req: any): string | null {
  if (!process.env.RAILWAY_ENVIRONMENT) return null;
  const peer = String(req?.socket?.remoteAddress || "").trim().replace(/^::ffff:/, "");
  if (!peer || /^(?:127\.|::1$)/.test(peer)) return null;
  const raw = req?.headers?.["x-real-ip"];
  const value = String(Array.isArray(raw) ? raw[0] ?? "" : raw ?? "").trim().replace(/^::ffff:/, "");
  if (!value || value.length > 64 || value.includes(",") || isIP(value) === 0) return null;
  return value.toLowerCase();
}

/**
 * Who a public throttle counts, in this order:
 *  1. the end user's signed identity (accepted only from a loopback socket with a fresh HMAC);
 *  2. on Railway, the edge-supplied x-real-ip from a non-loopback peer (never x-forwarded-for);
 *  3. the socket address.
 */
export function throttleClient(req: any, secret = String(process.env.SESSION_SECRET || ""), now = Date.now()): string {
  const headers = (req?.headers || {}) as Record<string, string | string[] | undefined>;
  const socket = req?.socket?.remoteAddress as string | undefined;
  const internal = verifiedInternalIdentity(headers, socket, secret, now);
  if (internal) return internal;
  const edge = railwayEdgeClientIp(req);
  if (edge) return edge;
  return socket || "unknown";
}
