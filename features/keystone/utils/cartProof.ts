import { createHmac, timingSafeEqual } from "node:crypto";
import { getRuntimeConfig } from "../runtimeConfig";

const TTL = 7 * 24 * 60 * 60;
function signingSecret(explicit?: string) {
  const secret = explicit || getRuntimeConfig().sessionSecret;
  if (!secret || secret.length < 32) throw new Error("Cart proof requires SESSION_SECRET of at least 32 characters");
  return secret;
}
export function createCartProof(cartId: string, options: { secret?: string; expiresAt?: number } = {}) {
  if (!/^[a-zA-Z0-9_-]+$/.test(cartId)) throw new Error("Invalid cart ID");
  const payload = `v1.${cartId}.${options.expiresAt ?? Math.floor(Date.now() / 1000) + TTL}`;
  const signature = createHmac("sha256", signingSecret(options.secret)).update(`restaurant-cart\0${payload}`).digest("hex");
  return `${payload}.${signature}`;
}
export function cartIdFromProof(proof?: string) {
  const parts = proof?.split(".");
  return parts?.length === 4 && parts[0] === "v1" ? parts[1] : undefined;
}
export function verifyCartProof(proof: string | undefined, cartId: string, options: { secret?: string; now?: number } = {}) {
  if (!proof || !cartId) return false;
  const [version, id, expiry, signature, ...extra] = proof.split(".");
  if (extra.length || version !== "v1" || id !== cartId || !/^\d+$/.test(expiry || "") || !/^[a-f0-9]{64}$/.test(signature || "")) return false;
  const expiresAt = Number(expiry);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= (options.now ?? Math.floor(Date.now() / 1000))) return false;
  try {
    const expected = createCartProof(cartId, { secret: options.secret, expiresAt }).split(".")[3];
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
  } catch { return false; }
}
