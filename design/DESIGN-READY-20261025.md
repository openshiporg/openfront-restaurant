# Restaurant storefront redesign: ready report (2026-10-25)

Brief: `~/Code/Euler/state/briefs/restaurant-storefront-redesign-2026-10-25.md`. Live: https://craft-burgers.openship.org. The owner set no approval stage, so the impeccable interview was skipped and PRODUCT.md was inferred from the brief, with every inferred line labelled as such.

## Status

| Item | State |
|---|---|
| Storefront redesign | **Live.** Commits `7f093d0` and `0bc2ed9`, pushed to master and auto-deployed. The live HTML shows the new build about 280 s after the push. |
| Food photo prompts | **Done.** `design/food-photos/PROMPTS.md` has one art direction and 22 prompts, keyed to the exact seed filenames. |
| New food photos | **Waiting on Euler.** `design/food-photos/generated/` did not exist at the time of writing. Installation is scripted (see below) and runs as soon as all 22 files are present. |
| Gates | `tsc --noEmit` exits 0. Unit tests: 214/214 (`test:offline`) and 22/22 (`*.test.cjs`). Parity: drift 0, missing 0, sidebar branding and structure OK. `next build` compiles. tasteskill lint: 0 FAIL. tasteskill inspect: 0 FAIL. `impeccable detect`: no findings before DESIGN.md existed, advisories only after. |

## The direction: "the pass"

The storefront is built on the pass: the brushed-steel shelf under the heat lamps where a finished order lands and waits for its ticket.
- **Ground:** steel for every food surface.
- **Tickets:** thermal-ticket paper, with a torn edge, for anything you read or act on.
- **Ink:** one near-black.
- **The one action:** filled in the store's own hue, which is still derived per store from its logo colour.
- **Lamp:** amber, used only for the open-now dot on the title line. The restaurant's own clock lights it.
- **Type:** one family, Archivo, in two widths: condensed heavy for names and prices, regular for text.

The phone first viewport now shows the plate, the name with the lamp, open until / pickup time / address / rating, and the category rail, all before any scrolling. Two taps reach an order: a menu row, then "Add to order". The hero's dish ticket is the same two taps.

## Skills used

| Skill | How it was used |
|---|---|
| **impeccable** | <ul><li>Ran `context`, then wrote PRODUCT.md (init, inferred).</li><li>Ran a `concept-seed` direction roll (seed `seed:785c6107f636a252`). It assigned candidate 7 of my seven grounded candidates, "the pass". All six dealt challengers were declined; each one's discipline was written into the contract as a raise.</li><li>Recorded the direction contract in `.impeccable/surfaces/app-storefront-main-page-tsx.md`, with an ADJUSTED block for cited deviations.</li><li>Read the craft floor before editing.</li><li>Ran `detect`.</li><li>The shipped **finish reviewer** ran three rounds: recapture, then fix, then a verdict pass with 6 of 8 resolved and 2 partial. Both partials were then fixed or cited.</li><li>The shipped **documenter** wrote `DESIGN.md` and `.impeccable/design.json`.</li></ul> |
| **design-taste-frontend** | <ul><li>Dealt three directions and chose `hero-object` (seed 122433806), with palette and type kept from the impeccable world.</li><li>Sections came from its blueprints: object cropped by edges, sticky photograph with active list, small frames, footer close.</li><li>House rules were enforced with `lint.mjs` (0 FAIL) and `inspect.mjs` at 1440, 768 and 390 (0 FAIL).</li><li>Remaining warnings and why they stand: <ul><li>No video: there is no honest clip of the restaurant.</li><li>The phone category rail scrolls sideways: it is the standard ordering pattern, and it auto-scrolls to the active chip.</li><li>10 font sizes.</li></ul></li></ul> |
| **frontend-design** | Its calibration list ruled out cream, terracotta and editorial hairlines. Its copy rules shaped "Open until 9:00 PM", where the old version used dot-joined meta strings. There are no eyebrows. |
| **emil-design-eng** | <ul><li>Custom ease-out and drawer curves.</li><li>`scale(0.97)` on press.</li><li>No animation on frequent actions.</li><li>The ticket drops in about 260 ms when an item is added, as feedback.</li><li>Motion uses transform and opacity only, with reduced-motion fallbacks.</li></ul> |
| **high-end-visual-design** | Read. Most of its recipe (double-bezel cards, eyebrow pills, glass nav, entrance on every element) is banned by impeccable and tasteskill, which take precedence. What carried over: custom cubic-bezier motion, `min-h` in dvh/svh units, blur only where it is fixed, and GPU-safe animation. |
| **creative-director** | Its brief-first framing was the frame for the direction round: define "good" for this audience, inventory the subject, then commit. |
| **brandkit** | Read. It is an image-generation skill and no image tool was available here. Its "one core metaphor per brand" discipline is the pass. |
| **color-expert** | <ul><li>The palette is OKLCH throughout: steel at L 0.872 C 0.009 h 236, paper 0.987, ink 0.2, soft ink 0.39, lamp 0.76 0.165 62.</li><li>Warm food sits against cool steel, as complements.</li><li>Contrast: ink on steel and soft ink on paper both pass 4.5:1.</li><li>The brand primary dropped from L 0.55 to 0.47 so that white on it passes.</li></ul> |

## What changed (storefront only)

- **Home** (`HeroBanner`, `CategoryNav`, `MenuSection`, `HomePage`):
  - The plate is cropped by three edges, with the dish ticket on it.
  - The h1 is the store name, with the live lamp (`ServiceLamp`), then the facts lines.
  - Sticky category rail with scroll-spy.
  - Popular is four small frames.
  - Each category is a menu board (names and prices, with the plate crossfading to the dish in view). On phone, each row has its own thumbnail.
  - Filler copy is removed ("The items customers order most often…", "Prepared fresh and ready to customize").
- **Item page:**
  - The plate, plus a ticket with name, price, facts (ready in, calories, dietary, served, contains), the options as filled rows, and the chosen options written as ticket lines before "Add to order · price".
  - Sold-out state.
  - New add-failure message: ordering rules are shown as written, anything else is a plain retry.
  - The kitchen-internal "Station" field is no longer shown to guests.
- **Cart:**
  - The nav cart is an order ticket that shows count and subtotal, and drops in when an item is added.
  - The sheet is the ticket.
  - The line item reads "1 × Classic Burger / + Single Patty".
- **Checkout, account and order:**
  - Steel ground and paper surfaces.
  - Removed: eyebrow labels, outline boxes, divider rules, 10–13 px uppercase tracked labels, the glass bar, a violet status colour, and the "unlock" copy.
  - The privacy panel moved below the account content.
  - The zero radius now applies to the whole radius scale.
- **Fonts:** loaded once in `app/(storefront)/layout.tsx`, so checkout gets them too. Before, checkout fell back to system fonts.
- **New:**
  - `getServiceStatus` in `store-hours-display.ts`. Tests cover open, later today, tomorrow, overnight Friday into Saturday, next weekday, DST, and no hours.
  - `features/storefront/lib/fonts.ts`.
- **Bug fixed:** the shared checkout `Radio` always reported `aria-checked="true"`.
- **Deleted (unused after the redesign):** `MenuItemCard.tsx` and `StoreInfoBar.tsx`.

Every route, state and workflow is kept: menu, item and modifiers, cart, checkout, order confirmation and status, and account. On the live site, the add → cart sheet → checkout → account flow ran headless on desktop and phone with no page errors (`design/screens/after-cart-*`, `after-checkout-*`, `after-account-*`). That run added one guest cart to the demo; no order was placed.

## Food photos

1. **Prompts:** `design/food-photos/PROMPTS.md` gives one art direction for all 22. Every dish is set down on the same brushed-steel pass under a warm heat lamp, three-quarter view, on plain deli paper or in paper boats, with no text or props. The steel tone is matched to the page ground so plates bleed into the hero. Then one prompt per file, using the exact seed filenames.
2. **Install, when Euler drops the renders into `design/food-photos/generated/`:** each image is centre-cropped square and written over `public/images/<same name>`. JPEG at 1200 px for `.jpg`, PNG at 1024 px for `.png`. Names, extensions and database rows are unchanged. The exact prompt is embedded in each file for provenance.
3. **Live data check:** I queried the live demo's GraphQL for all 24 menu items.
   - All 23 seeded items resolve their thumbnail from `menuItemImages.imagePath` (`/images/…`). **No uploaded images** exist on any menu item, so replacing the files updates the live menu directly.
   - The 24th item, `beer`, was added on the demo and has no image at all. It renders without a placeholder.

## Screenshots (`design/screens/`)

- Before (live, prior build): `before-home-desktop(.png|-full.png)`, `before-home-phone(.png|-full.png)`
- After (live, this build):
  - `after-home-desktop(.png|-full.png)`, `after-home-phone(.png|-full.png)`
  - `after-menu-<id>-desktop|phone(-full).png` (item page with modifiers)
  - `after-cart-desktop|phone.png`, `after-checkout-desktop|phone.png`, `after-account-desktop|phone.png`

Full-page captures were taken with reduced motion on. The scroll-driven entrance holds content below the fold at opacity 0 for a full-page grab; in a real scroll it shows normally, as checked with motion on at 390 px.

## Commits

- `7f093d0`: Redesign the storefront as the pass: steel, tickets and the heat lamp (Junaid)
- `0bc2ed9`: Set storefront page headings in the condensed cut (Junaid)
- Note: `75c196a` (README: list every Openfront with its repository and demo) was committed in this working copy by another session during this run. It went out with my push. It is README-only.

## Not done, or worth knowing

- **Photos:** pending Euler's renders. Until they land, the hero crop is very tight, because the current photos are extreme close-ups.
- **Existing bug, not changed:**
  - The cart sheet estimates tax at a hard-coded 8.75% instead of the store's `taxRate`.
  - Checkout computes its own figures, so the order total itself is not affected.
- **Stripe payment element:** still sets `fontFamily` to Outfit/Inter inside its iframe. I left it alone rather than change payment appearance in this pass.
- **Demo data quirks**, shown as they are:
  - Prices are in INR (₹).
  - Menu descriptions are empty.
  - Tuesday opens at "12:04 AM".
  - There is a `beer` item described as "bb".
- **Paying customers:** pushing master redeploys forks that track this repo. Per the owner's rule, the push went ahead and customers can roll back.
- **Dark mode:** the storefront's `.dark` palette is the old warm one. The storefront never sets `.dark`, so nothing renders with it.
