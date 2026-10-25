---
version: 1
slug: "app-storefront-main-page-tsx"
primary_target: "app/(storefront)/(main)/page.tsx"
related_targets: ["features/storefront"]
---

# Storefront (guest ordering)

Scope: `features/storefront/**`, `app/(storefront)/**`: home menu, item page, cart, checkout, order status, account. Mode: Persuade on the home and item pages, Operate in cart, checkout and account (same world, quieter). Phone first.

Audience and job: someone deciding dinner tonight, usually on a phone, ordering pickup or delivery from an independent restaurant. Action: two taps from the first screen to an item in the cart. Proof is the food itself and real store facts (open now, address, pickup time, hours). Constraints: multi-tenant by StoreSettings, so any name length, any hue and missing data must hold. UI copy is labels, states and errors only. No invented proof.

## Direction contract

THESIS: The storefront is the restaurant's pass, the steel shelf under the heat lamps where finished food lands and waits for its ticket. It refuses the category's ordering-app default of a split hero, an icon badge row, and identical rounded cards repeated per category.

OWN-WORLD: A brushed-steel field (cool blue-grey) is the ground of every food surface. Thermal-ticket white is for anything you read or act on, with near-black ink. The heat-lamp amber exists only as the open-now lamp and the warm pool in the photos. The store's own hue fills the one action. Faces come from one family set two ways: a condensed heavy cut for names and prices, the regular width for text. Corners are square and nothing is shadowed at rest. Tickets have a torn edge.

STORY: The visitor sees tonight's best plate set down large, sees that the lamp is on (open, closing at 10, pickup 15 to 20 minutes), and reads the menu as a list of names and prices with the plate changing beside it. They tap a dish, add it, and watch the ticket clip onto the rail.

FIRST VIEWPORT: The plain bar holds the logo and name, then Menu and Visit, and the ticket-rail cart on the right. The hero plate (the first featured item's photo) fills about 60% of the screen at desktop and the top 50% on a phone, cropped by three edges, sitting on the steel field. Beside it on desktop (below it on a phone) the store name is the h1, with the lamp dot on its line, then the headline sentence and the facts as short lines. The primary action, Order, sits under the facts. On a phone, the category rail starts at the fold.

FORM: Candidate 7 of 7 (the pass). SEED REFERENCE seed:785c6107f636a252. Composition from tasteskill `hero-object` (seed 122433806): object cropped by edges, sticky photograph with an active list for each category, a small-frame rail for popular items, a visit card on a photograph, and a footer that is half photograph and half menu.
Raises: from the Dong Ho shell-ground woodblock, colour printed as flat registered blocks, with no tints, gradients or washes; the photo is one block and the type is the keyblock. From the sukeban dress code, every customisation is written on the ticket as a measured line ("+ Bacon", "No onion"). From the night-flight six-pack, each fact owns one line in a fixed order (open, pickup, delivery, address) and is cross-checked at a glance. From the variable-font specimen, hierarchy comes from scale contrast inside one family. From the Miura sheet, one action propagates: Add puts a ticket on the rail and the cart total updates. From the sleeping-city fold, the restaurant's local clock drives the lamp: on when open, "Opens 11:00 AM" when it is off.
Signature interaction: adding an item clips a ticket onto the rail (the cart button), and the ticket drops in once. Motion grammar: ease-out entrances under 300ms, the hero plate shutter-opens once on load, the menu photo crossfades, and reduced motion drops all travel.

ADJUSTED (cited, after the finish review): The phone bar keeps the brand, Account and the order ticket. Menu and hours are on the first screen in the hero facts and the category rail, so the bar links appear from md up. The hero action reads "See the menu" because the nav ticket already says "Order". The action is hidden on phones, where the category rail sits directly below the facts. A Delivery fact line renders only when the store has delivery configured; the demo store has delivery off. The contact blueprint (a visit card on a photograph of the place) is dropped: there is no honest photo of each tenant's room, and a stock interior would misrepresent every store. Hours and location live in the hero facts and the footer instead. The footer is an ink close rather than half photograph and half menu. It renders on every route (item, checkout, account, order) from layout store settings only, and fetching a menu item on every page for a decorative plate costs a request per page. The full-width name follows tasteskill's footer rule. Popular is a strip of four small square frames on steel. On phones it is one non-scrolling row of four small frames. Menu plates sit on one fixed side, and each section's height follows its rows.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
