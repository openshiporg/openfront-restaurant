import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { throttleClient, railwayEdgeClientIp } from "../features/keystone/utils/throttleClient";

const SECRET = "x".repeat(40);

function withRailway<T>(value: string | undefined, fn: () => T): T {
  const prev = process.env.RAILWAY_ENVIRONMENT;
  if (value === undefined) delete process.env.RAILWAY_ENVIRONMENT; else process.env.RAILWAY_ENVIRONMENT = value;
  try { return fn(); } finally {
    if (prev === undefined) delete process.env.RAILWAY_ENVIRONMENT; else process.env.RAILWAY_ENVIRONMENT = prev;
  }
}

test("on Railway, a single valid x-real-ip from a non-loopback peer is the client", () => {
  withRailway("production", () => {
    assert.equal(throttleClient({ socket: { remoteAddress: "10.0.0.5" }, headers: { "x-real-ip": "198.51.100.9" } }, SECRET), "198.51.100.9");
    assert.equal(railwayEdgeClientIp({ socket: { remoteAddress: "::ffff:10.0.0.5" }, headers: { "x-real-ip": "2001:DB8::1" } }), "2001:db8::1");
  });
});

test("an unsigned loopback caller cannot pick its bucket with x-real-ip", () => {
  withRailway("production", () => {
    for (const peer of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) {
      assert.equal(throttleClient({ socket: { remoteAddress: peer }, headers: { "x-real-ip": "198.51.100.9" } }, SECRET), peer);
    }
  });
});

test("a malformed, listed or oversized x-real-ip is ignored and the socket counts", () => {
  withRailway("production", () => {
    for (const value of ["not-an-ip", "198.51.100.9, 1.1.1.1", "", "1".repeat(80)]) {
      assert.equal(throttleClient({ socket: { remoteAddress: "10.0.0.5" }, headers: { "x-real-ip": value } }, SECRET), "10.0.0.5");
    }
  });
});

test("off Railway x-real-ip and x-forwarded-for are never trusted", () => {
  withRailway(undefined, () => {
    assert.equal(throttleClient({ socket: { remoteAddress: "10.0.0.5" }, headers: { "x-real-ip": "198.51.100.9", "x-forwarded-for": "1.1.1.1" } }, SECRET), "10.0.0.5");
  });
});

test("the storefront throttle refuses with a clear RATE_LIMITED GraphQLError, not a masked plain Error", () => {
  const source = readFileSync(new URL("../features/keystone/mutations/storefrontPublic.ts", import.meta.url), "utf8");
  assert.match(source, /if \(recent\.length >= limit\) throw rateLimited\(\);/);
  assert.match(source, /new GraphQLError\(RATE_LIMIT_MESSAGE, \{ extensions: \{ code: "RATE_LIMITED" \} \}\)/);
  assert.match(source, /error instanceof UserError \|\| isRateLimited\(error\)/);
});
