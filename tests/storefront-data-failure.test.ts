import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getMenuCategories, getMenuItems, getStoreSettings } from "../features/storefront/lib/data/menu";
import { StorefrontDataUnavailableError } from "../features/storefront/lib/data/errors";
import { openfrontClient } from "../features/storefront/lib/config";
import { StorefrontUnavailable } from "../features/storefront/components/StorefrontUnavailable";

test("strict storefront home reads distinguish fetch failures from empty data while legacy readers keep their fallback contract", async () => {
  const client = openfrontClient as any;
  const originalRequest = client.request;
  const originalConsoleError = console.error;
  client.request = async () => { throw new Error("synthetic network failure"); };
  console.error = () => {};
  try {
    assert.equal(await getStoreSettings(), null);
    assert.deepEqual(await getMenuCategories(), []);
    assert.deepEqual(await getMenuItems(), []);
    await assert.rejects(() => getStoreSettings(true), StorefrontDataUnavailableError);
    await assert.rejects(() => getMenuCategories(true), /Menu categories could not be loaded/);
    await assert.rejects(() => getMenuItems(undefined, true), /Menu items could not be loaded/);
  } finally {
    client.request = originalRequest;
    console.error = originalConsoleError;
  }
});

test("storefront unavailable state is explicit, accessible, and offers a retry", () => {
  const html = renderToStaticMarkup(createElement(StorefrontUnavailable, {
    title: "Menu unavailable",
    message: "Please try again later.",
  }));
  assert.match(html, /role="alert"/);
  assert.match(html, /Menu unavailable/);
  assert.match(html, /Please try again later/);
  assert.match(html, /Try again/);
});
