import { test } from "node:test"
import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

// The storefront must scroll like a page: nothing pins, scrubs, snaps or cancels a wheel or touch move.
const dir = join(process.cwd(), "features", "storefront", "orbit")
const banned: Array<[RegExp, string]> = [
  [/ScrollTrigger|ScrollSmoother|Observer\.create/, "a GSAP scroll plugin"],
  [/addEventListener\(\s*["'`](wheel|touchmove|mousewheel|scroll)["'`]/, "a wheel, touchmove or scroll listener"],
  [/\bon(Wheel|TouchMove|Scroll)(Capture)?\s*=/, "a wheel, touchmove or scroll handler"],
  [/scroll-snap-type|overscroll-behavior:\s*none|position:\s*sticky[^;}]*;[^}]*height:\s*\d+vh/, "scroll snapping or a pinned stage"],
  [/touch-action:\s*none/, "touch-action: none"],
]

test("the Dish Orbit storefront never hijacks scrolling", () => {
  const files = readdirSync(dir).filter((name) => /\.(tsx?|css)$/.test(name))
  assert.ok(files.length > 5)
  for (const name of files) {
    const code = readFileSync(join(dir, name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
    for (const [pattern, what] of banned) assert.equal(pattern.test(code), false, `${name} has ${what}`)
  }
  const stage = readFileSync(join(dir, "orbit.css"), "utf8")
  assert.match(stage, /\.dsh-root \{[^}]*touch-action: pan-y/, "the hero stage must leave vertical swipes to the page")
})
