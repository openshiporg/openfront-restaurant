import test from "node:test";
import assert from "node:assert/strict";
import { buildMenuVisibility, selectHeroMenuItems } from "../features/storefront/lib/menu-visibility";

test("featured items beyond the house-card limit remain in their category menu", () => {
  const category = { id: "main", name: "Mains" };
  const items = Array.from({ length: 8 }, (_, index) => ({ id: `item-${index + 1}`, name: `Item ${index + 1}`, featured: true, category: { id: category.id } }));
  const visible = buildMenuVisibility(items, [category]);
  assert.deepEqual(visible.houseItems.map((item) => item.id), ["item-1", "item-2", "item-3"]);
  assert.deepEqual(visible.categorySections[0].items.map((item) => item.id), ["item-4", "item-5", "item-6", "item-7", "item-8"]);
  assert.deepEqual([...visible.houseItems, ...visible.categorySections[0].items].map((item) => item.id).sort(), items.map((item) => item.id).sort());
});

test("uncategorized featured items omitted from the showcase still have a reachable menu section", () => {
  const items = [
    ...Array.from({ length: 3 }, (_, index) => ({ id: `house-${index}`, featured: true, category: null })),
    { id: "uncategorized-featured", featured: true, category: null },
    { id: "uncategorized-regular", featured: false, category: null },
  ];
  const visible = buildMenuVisibility(items, []);
  assert.deepEqual(visible.otherItems.map((item) => item.id), ["uncategorized-featured", "uncategorized-regular"]);
  assert.equal(new Set([...visible.houseItems, ...visible.otherItems].map((item) => item.id)).size, items.length);
});

test("hero selection honors featured ordering without hard-coded name exclusions", () => {
  const bacon = { id: "bacon", name: "Bacon Burger" };
  const popular = { id: "popular", name: "Popular Bowl" };
  const ordinary = { id: "ordinary", name: "Soup" };
  const hero = selectHeroMenuItems([bacon, popular, ordinary], [bacon], [popular]);
  assert.deepEqual(hero.map((item) => item.id), ["bacon", "popular", "ordinary"]);
});
