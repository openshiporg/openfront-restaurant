import { isIP } from "node:net";

/** Numeric addresses only: no hostnames, ports, brackets, zone IDs or DNS lookup. */
export function normalizeIp(value: unknown): string | undefined {
  if (typeof value !== "string" || value.includes("%") || !isIP(value)) return undefined;
  if (isIP(value) === 4) return value;
  // WHATWG URL serialization canonicalizes equivalent IPv6 spellings locally.
  const canonical = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(canonical);
  if (mapped) {
    const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16);
    return [high >>> 8, high & 255, low >>> 8, low & 255].join(".");
  }
  return canonical;
}

/** IP-restricted API keys use socket evidence, never caller-supplied headers. */
export function requestClientIp(request: any): string | undefined {
  return normalizeIp(request?.socket?.remoteAddress);
}
