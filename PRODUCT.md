# Product

<!-- impeccable:product-schema 1 -->

> Inferred, 2026-10-25: written from the owner's brief (`~/Code/Euler/state/briefs/restaurant-storefront-redesign-2026-10-25.md`) and the repository. The owner ordered the work with no approval stage, so no interview was held. Every line below is inferred unless it quotes the brief.

## Platform

web

## Users

- **Guests ordering food** (primary, storefront): someone deciding what to eat tonight, usually on a phone, who wants to see the food, know the place is open, and get an order in for pickup or delivery quickly.
- **Restaurant operators** (dashboard, POS, KDS): staff and owners running service. Out of scope for storefront work.

## Product Purpose

Openfront Restaurant is an open-source restaurant platform: online ordering storefront, POS, kitchen display, tables, waitlist, menu engineering. The storefront turns a restaurant's live menu, hours and settings into a place guests order from directly. Success is a guest going from landing to a placed order in a couple of taps, and the page reading as that restaurant rather than as software.

## Positioning

The restaurant owns its ordering page and its data; the storefront is the restaurant's own front door, not a marketplace listing.

## Operating Context

- Multi-tenant by settings: store name, logo icon and hue, tagline, hero headline/subheadline/tagline, promo banner, address, phone, hours, timezone, pickup and delivery settings all come from `StoreSettings`. The design must hold for any restaurant that fills these in, not only the demo.
- Menu items, categories, modifiers, prices and photos come from the database. Seeded photos ship in `public/images/*` and are linked by `imagePath`; an uploaded image takes precedence.
- Live demo: craft-burgers.openship.org (seed store "Stack Kitchen", a Brooklyn burger and chicken counter). Pushing master auto-deploys it. The demo has paying-customer forks; the owner's rule is to push and let customers roll back.

## Capabilities and Constraints

- Routes, states and workflows must all survive: menu, item page with modifiers, cart, checkout (contact, delivery or pickup, payment, review), order confirmation and status, account (login, profile, addresses, orders).
- Storefront scope only (`features/storefront/**`, `app/(storefront)/**`). The shared dashboard shell is byte-identical to Openfront E-commerce and is checked by the parity script; platform pages are untouched.
- UI copy is labels, states and errors only (brief). Marketing copy comes from store settings.
- No database changes for the photo refresh.

## Brand Commitments

- Per-store name, logo SVG and logo hue are the brand. The storefront must carry them.
- "Phone first. Status dots on the title line." (brief)

## Evidence on Hand

- Real store data in settings (address, hours, phone, rating and review count when set). No testimonials, press or invented proof; none may be fabricated.
- 22 seeded menu photos in `public/images/` (being regenerated to one art direction, see `design/food-photos/PROMPTS.md`).

## Product Principles

1. The food leads: photos and dish names are the page.
2. Open, where, and how long, before anything else.
3. Two taps to an order: menu item to cart from the first screen.
4. The restaurant's voice comes from its settings; the interface speaks only in labels and states.
5. Every state works for a store with missing data (no photo, no hours, no rating, no delivery).
