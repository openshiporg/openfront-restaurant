---
name: Openfront Restaurant Storefront
description: The restaurant's pass. Brushed steel under the heat lamps, thermal-ticket paper, one ink, and the store's own hue on the one action.
colors:
  # Per-tenant. Rendered as oklch(0.47 0.2 <brand-hue>), where
  # brand-hue = (260 + store logo hue) mod 360, resolved on .storefront-brand.
  # The value below is the default (logo hue 0, brand hue 260).
  primary: "oklch(0.47 0.2 260)"
  primary-foreground: "oklch(0.99 0.004 236)"
  lamp: "oklch(0.76 0.165 62)"
  steel: "oklch(0.872 0.009 236)"
  steel-shade: "oklch(0.835 0.011 236)"
  steel-deep: "oklch(0.7 0.013 238)"
  paper: "oklch(0.987 0.003 236)"
  ink: "oklch(0.2 0.014 252)"
  ink-soft: "oklch(0.39 0.016 248)"
  border: "oklch(0.86 0.009 236)"
  destructive: "oklch(0.53 0.2 27)"
typography:
  display:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(4rem, 19vw, 6rem)"
    fontWeight: 900
    lineHeight: 0.86
    letterSpacing: "-0.012em"
    fontVariation: "\"wdth\" 68"
  headline:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(3rem, 6vw, 4.5rem)"
    fontWeight: 900
    lineHeight: 0.9
    letterSpacing: "-0.012em"
    fontVariation: "\"wdth\" 68"
  title:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.012em"
    fontVariation: "\"wdth\" 68"
  body:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.625
    fontFeature: "\"tnum\""
  label:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 500
    lineHeight: 1.4
    fontFeature: "\"tnum\""
rounded:
  none: "0px"
  dot: "9999px"
spacing:
  shell-phone: "16px"
  shell-tablet: "24px"
  shell-desktop: "40px"
  row: "16px"
  section-phone: "40px"
  section-tablet: "64px"
  section-desktop: "80px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "0 24px"
    height: "48px"
  button-primary-disabled:
    backgroundColor: "{colors.steel-deep}"
    textColor: "{colors.paper}"
  ticket:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "10px 14px 11px"
  category-chip:
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    rounded: "{rounded.none}"
    padding: "8px 14px"
  category-chip-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  modifier-option:
    backgroundColor: "{colors.steel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "12px"
  modifier-option-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  nav-link:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "8px 12px"
  stepper:
    backgroundColor: "{colors.steel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    height: "48px"
---

# Design System: Openfront Restaurant Storefront

Scope: the guest storefront only (`features/storefront/**`, `app/(storefront)/**`). The dashboard and platform pages run on a separate shared shell (byte-identical with Openfront E-commerce) and are not documented here.

## Overview

**Creative North Star: "The Pass"**

The storefront is the restaurant's pass: the steel shelf under the heat lamps where finished food lands and waits for its ticket. Brushed, cool blue-grey steel is the ground of every food surface. Thermal-ticket paper holds anything a guest reads closely or acts on, set in one near-black ink. The heat lamp's amber appears only as the open-now lamp beside the store name, plus whatever warmth is already in the food photos. The store's own hue fills the one action.

Colour is laid down as flat registered blocks: steel, paper, ink, the store hue, the lamp. No tints, gradients or washes. The photo is one block and the type is the keyblock. Hierarchy comes from scale contrast inside one family. Archivo is condensed and heavy for names, prices and headings, and regular width for everything else. Corners are square, nothing has a shadow at rest, and tickets have a torn edge.

The density is a menu board. Dishes are rows of name and price, and the plate beside the list changes to the dish under the pointer. Facts each get one line in a fixed order (Today, Pickup, Delivery, Address, Rating). The interface speaks only in labels and states.

**Key Characteristics:**
- Steel ground, paper for reading and acting, one ink, the store hue for the one action, amber only for the lamp.
- One family (Archivo, variable `wdth`) used two ways: condensed (wdth 68) heavy for names and prices, regular width for text.
- Square corners everywhere. Circles appear only for state indicators: the lamp and the radio dot.
- No shadows at rest. Depth comes from the paper sitting on the steel.
- A torn thermal-ticket edge on the cart button, the hero plate tag, the item panel and the cart sheet.
- Tabular figures throughout, so prices line up.

## Colors

A cool, nearly achromatic steel-and-paper field (hue 236 to 252) carries two saturated notes: the per-store action hue and the amber lamp.

### Primary
- **Store Hue** (`oklch(0.47 0.2 <brand-hue>)`): a per-tenant token, not a fixed colour. `brand-hue = (260 + logo hue) mod 360`, where the logo hue is the store's `logoColor` setting. The layout passes both hues as `--store-page-logo-hue` / `--store-page-brand-hue`, and `.storefront-brand` resolves `--primary` and `--ring` from them. Lightness and chroma are fixed at 0.47 / 0.2 so every tenant's hue stays legible behind white text. The frontmatter value is the default (hue 260). It is used for the primary action fill, the focus ring, and the hero tag's "Order this" link. Hover mixes 12% black into it (`color-mix(in oklch, var(--primary) 88%, black)`).
- **Action Paper** (primary-foreground): the text colour on the store hue.

### Secondary
- **Heat-Lamp Amber** (lamp): only on the lit open-now lamp, where its glow shows the state. When the store is closed, the lamp falls back to steel-deep.

### Neutral
- **Brushed Steel** (steel): the ground of the nav, hero, category rail, menu sections and cart sheet. Also the fill behind steppers and unselected modifier options (often at 45%).
- **Steel Shade** (steel-shade): hover on nav links, chips and menu rows, and the empty frame behind photos while they load.
- **Steel Deep** (steel-deep): the unlit lamp, the disabled action, and the radio/checkbox rings.
- **Ticket Paper** (paper): tickets, the item panel, the active menu row on desktop, and cart totals.
- **Ink** (ink): all text on steel and paper. Also the active chip, the selected modifier, the promo banner and the footer ground (with paper text). Text selection is ink on paper.
- **Soft Ink** (ink-soft): fact labels, counts, metadata, unselected modifier prices.
- **Hairline** (border): the framework default border. It is rarely visible, because the storefront separates things with blocks of colour, not lines.

### Named Rules
**The One Hue Rule.** The store hue fills the one action on a screen (See the menu, Add to order, Checkout) and the focus ring. Nothing else is drawn in it except the single text link on the hero ticket.

**The Lamp Is State Rule.** Amber means the kitchen is taking orders. Never use it as an accent, a highlight or a warning colour.

**The Flat Block Rule.** Colours are flat blocks. Use no gradients, washes or tinted overlays. The only colour mixes are the action's hover and the lamp's glow.

## Typography

**Display Font:** Archivo at wdth 68 (`font-stretch: 68%`), with ui-sans-serif, system-ui fallback
**Body Font:** Archivo at default width, same fallback

**Character:** One grotesque family set two ways. The condensed heavy cut fits a long dish name on a phone line and gives prices weight. The regular width keeps every label calm. Every heading uses `font-serif`, which in this storefront is mapped to the condensed Archivo cut, not a serif.

### Hierarchy
- **Display** (900, length-aware clamp from `clamp(2.2rem, 9.5vw, 3.4rem)` for names over 26 characters up to `clamp(5.5rem, 7.6vw, 8.5rem)` at desktop for names of 10 characters or fewer, line-height 0.86): only the store name in the hero h1, with the lamp on its line. The footer's full-width store name uses the same voice, sized to fit (`clamp(3.5rem, …vw, 18rem)`, line-height 0.8).
- **Headline** (900, 3rem / 3.75rem / 4.5rem by breakpoint, line-height 0.9): category section titles, Popular, and the footer's "Hours & location".
- **Title** (800, 1.5rem to 1.875rem, line-height 1.05): dish names and prices in rows, modifier group names, the cart total, footer links, line items (1.25rem), the brand name in the nav (1.55rem to 1.6rem), and category chips (700, 1.125rem, line-height 1).
- **Body** (400, 1rem, line-height 1.625, descriptions capped at 56 to 60ch): dish descriptions, facts, and the headline sentence (1.125rem to 1.5rem, line-height snug, 30ch).
- **Label** (500 to 600, 0.95rem): nav links, metadata, modifier prices, the promo banner, and "Order this".

### Named Rules
**The Two Widths Rule.** Use the condensed cut for anything that names or prices, and the regular width for anything that explains. Never mix in a second family.

**The Tabular Price Rule.** Storefront roots set `font-variant-numeric: tabular-nums`. Prices sit right-aligned on the same baseline as the name.

## Layout

The container is `max-width: 90rem`, centred, with 16px / 24px / 40px gutters (phone / sm / lg). Desktop uses a 12-column grid. The hero plate fills about 58% of the width, cropped by three edges and bleeding off the left. The name and facts take columns 8 to 12. On a phone the plate is the top 38 to 50svh, with the name and facts below it.

Menu sections pair a 5-column sticky plate (`top: 11rem`, 24 to 38rem tall) with a 7-column list. The plate side alternates between sections. Below lg, the sticky plate is hidden and each row carries its own 96 to 112px square thumbnail. Sections are padded 40 / 64 / 80px vertically. Rows are padded 16 to 20px and bleed their hover fill into the gutter with negative margins. Facts use a fixed label column (5.5rem on phones, 7.5rem from sm). Popular is one non-scrolling row of four square frames, at every width.

The nav is sticky, 64px tall, on steel. Its section links appear from md up. On phones the bar keeps the brand, Account and the order ticket, and the category rail scrolls sideways below the hero.

## Elevation & Depth

The system is flat. Nothing has a shadow at rest. Depth is tonal: paper (L 0.987) sits on steel (L 0.872), ink closes the page, and the torn edge tells you a surface is a ticket. The only glow belongs to the lit lamp (`0 0 0.35em 0.06em` of lamp at 70%), and it shows the open state rather than height.

### Named Rules
**The Paper-on-Steel Rule.** To lift something, set it on paper over steel. Do not add a shadow.

## Shapes

All corners are square (`--radius: 0`). The storefront also forces `border-radius: 0` on framework buttons and on anything marked `rounded-full`. The world has two exceptions, both native to it: the lamp and the single-choice radio dot are true circles, because they are indicators, not surfaces. Checkboxes stay square.

The signature silhouette is the thermal ticket. A sawtooth tear with a 7px tooth is cut by a conic-gradient mask, on the bottom edge (`ticket`) or the top edge (`ticket-top`). Photos are cropped hard by their frames, with no rounding and no insets.

## Components

### Buttons
Flat, square and pressable.
- **Shape:** square (0px).
- **Primary (pass action):** a store-hue block, 48px tall, 24px horizontal padding, 16px semibold label in paper. On the item page it splits into label and running total (`justify-between`).
- **Hover / Focus / Active:** hover darkens the fill by mixing in 12% black, over 160ms. Active scales to 0.97 with `cubic-bezier(0.23, 1, 0.32, 1)`. Focus is a 2px outline in the store hue, offset 2px.
- **Disabled:** steel-deep fill, paper text, no press.
- **Text link (pass link):** ink, with an underline at 0.08em thickness, offset 0.22em, at 35% ink. The underline goes to full ink on hover.

### Chips (category rail)
- **Style:** condensed bold 1.125rem, no fill, ink text on steel, 8px × 14px.
- **State:** the active chip is an ink block with paper text, and an IntersectionObserver keeps it in step with scrolling. Hover is steel-shade. The rail scrolls sideways with no visible scrollbar and centres the active chip.

### Cards / Containers
There are no cards. Containers are tickets and frames.
- **Ticket:** paper, square, with a torn bottom or top edge. Used on the nav cart button, the hero plate tag, and the item panel. In the cart sheet, the line items sit on a `ticket-top` strip over steel, and the totals sit on plain paper below.
- **Photo frame:** a square or full-bleed crop on steel-shade, with no border. On hover the image scales to 1.03 or 1.04 over 300 to 500ms ease-out.

### Inputs / Fields
- **Style:** steel at 45% on paper, square, no border, no shadow, 16px text, soft-ink placeholder.
- **Focus:** a 2px ring in the store hue.
- **Modifier options:** full-width rows, 12px padding, steel at 45%. Selected rows invert to ink with paper text, and their price shows paper at 80%. A paper marker with a steel-deep ring is a circle for single choice and a square for multiple choice.
- **Stepper:** a steel block with − / + cells, 40px wide and 48px tall (40px square in line items). Hover on a cell is steel-shade. The count is set in tabular semibold.
- **Error:** 16px medium text in destructive red, announced with `role="alert"`.

### Navigation
- **Bar:** sticky, steel, 64px tall. The brand lockup is the store's SVG logo at 28px, hue-rotated by its logo hue, beside the condensed extrabold name. Links are 0.95rem medium ink with a steel-shade hover block. An optional promo banner runs above the bar in ink with paper text.
- **Footer:** ink ground and paper text. It carries the headline "Hours & location", underlined address and phone links, the weekly hours as tabular rows, condensed footer links, and the store name across the full width. It renders on every route.

### Order Ticket (signature)
The cart button is a paper ticket clipped to the nav: "Order" in condensed extrabold, then the item count, then the subtotal from sm up. When an item is added, the ticket's contents drop in once (`translateY(-10px)` to 0 over 260ms ease-out).

### Service Lamp (signature)
A dot sized in em (0.2em) on the hero title line. It re-reads the store's local clock every minute and is lit amber while the kitchen takes orders, steel-deep otherwise. Its label is "Open now" or "Closed".

### Motion
On load the hero plate shutter-opens once: an `inset` clip-path reveal over 1.1s on `cubic-bezier(0.32, 0.72, 0, 1)`, while the plate settles from 1.12 to 1 scale over 1.4s. Section titles and rows rise 22px into place on a scroll-driven `view()` timeline, only where the browser supports it. The menu plate crossfades over 300ms. Reduced motion drops all travel.

## Do's and Don'ts

### Do:
- **Do** set every food surface on steel and every read-or-act surface on paper, with ink text.
- **Do** derive the action colour from the store: `oklch(0.47 0.2 var(--store-brand-hue))`. Never hard-code a tenant's hue.
- **Do** use the condensed Archivo cut (wdth 68, weight 800 to 900) for names, prices and headings, and the regular width for text.
- **Do** keep corners square. The only circles are the lamp and the radio dot.
- **Do** give each store fact its own line, in a fixed order, with a fixed label column.
- **Do** design for missing data: no photo, no hours, no rating, no delivery, and any name length.

### Don't:
- **Don't** use amber for anything except the lit lamp.
- **Don't** add shadows, gradients or tinted washes. Lift a surface by setting it on paper over steel.
- **Don't** use rounded cards, icon badge rows, or a split hero repeated per category.
- **Don't** introduce a second typeface. Don't treat `font-serif` as a serif, because in this storefront it is the condensed Archivo cut.
- **Don't** put a second store-hue action on a screen that already has one.
