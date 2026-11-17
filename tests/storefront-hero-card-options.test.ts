import { test } from "node:test"
import assert from "node:assert/strict"
import { cardGroups, groupsOf, toggleOption } from "../features/storefront/orbit/options"

const item = {
  modifiers: [
    { id: "a1", name: "Cheddar", modifierGroup: "addons", modifierGroupLabel: "Extra Toppings", required: false, minSelections: 0, maxSelections: 10, priceAdjustment: 75, defaultSelected: false },
    { id: "s1", name: "Single", modifierGroup: "size", modifierGroupLabel: "Patty Size", required: true, minSelections: 1, maxSelections: 1, priceAdjustment: 0, defaultSelected: true },
    { id: "s2", name: "Double", modifierGroup: "size", modifierGroupLabel: "Patty Size", required: true, minSelections: 1, maxSelections: 1, priceAdjustment: 350, defaultSelected: false },
    { id: "b1", name: "Brioche", modifierGroup: "bun", modifierGroupLabel: "Bun", required: false, minSelections: 0, maxSelections: 1, priceAdjustment: 0, defaultSelected: false },
  ],
} as never

test("the hero card shows required option groups first and at most two", () => {
  const groups = groupsOf(item)
  assert.deepEqual(groups.map((g) => g.id), ["addons", "size", "bun"])
  const shown = cardGroups(groups)
  assert.deepEqual(shown.map((g) => g.id), ["size", "addons"])
  assert.equal(groups.length - shown.length, 1, "one group left for the dish page")
})

test("a required single-choice group swaps and can't be emptied", () => {
  const size = groupsOf(item).find((g) => g.id === "size")!
  assert.deepEqual(toggleOption(["s1"], size, "s2"), ["s2"])
  assert.deepEqual(toggleOption(["s2"], size, "s2"), ["s2"])
})

test("options in a group read cheapest first", () => {
  const groups = groupsOf({ modifiers: [
    { id: "t", name: "Triple", modifierGroup: "size", priceAdjustment: 600 },
    { id: "s", name: "Single", modifierGroup: "size", priceAdjustment: 0 },
    { id: "d", name: "Double", modifierGroup: "size", priceAdjustment: 350 },
  ] } as never)
  assert.deepEqual(groups[0].options.map((o) => o.id), ["s", "d", "t"])
})
