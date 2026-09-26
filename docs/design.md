# Design System — Vereda Expeditions

Default tenant visual identity for the white-label OTA platform (`tenant/agency.config.json`
→ `theme`). Every value below is a *default*; a fork overrides them without touching core code
(§10 of the spec).

## 0. Grounding

The brief explicitly positions this platform *against* the resort/all-inclusive tourism
aesthetic ("beyond traditional resort circuits"). That single line rules out the entire
postcard-Caribbean vocabulary: turquoise-gradient ocean, palm-tree silhouettes, cocktail
umbrellas, sunset-orange hero banners. Those signal a beach package, not a guide who will walk
you through a tobacco farm in Viñales or seat you at a family's dinner table in Trinidad.

Instead the palette, type, and imagery below are pulled from specific, real material culture:
oxidized ironwork on colonial balconies, the red earth of Viñales' tobacco fields, cured
tobacco leaf, limestone plaster, and the hand-painted shop signage found across Cuban towns.
Nothing here should read as "tropical vacation ad." It should read as *a specific place,
seen closely*.

The three surfaces (storefront, back-office, worker app) share one token system but use it
differently — the storefront is editorial and warm, the back-office is calm and legible under
pressure (dispatch, escalation), the worker app is stripped down for small screens and bad
connections.

## 1. Color

Six named hex values, each tied to something real rather than picked abstractly. Deliberately
*not* the cream-background-plus-terracotta-accent formula common in generated "warm artisan
brand" design — the hero here is the deep patina green, not a soft clay accent.

| Token (theming key) | Name | Hex | Reference |
|---|---|---|---|
| `color-primary` | Verdín | `#2C5F52` | Oxidized copper and wrought-iron balconies on colonial facades |
| `color-secondary` | Tierra Colorada | `#C1502E` | The red-clay soil of the Viñales tobacco valley |
| `color-accent` | Tabaco | `#C98A2C` | Cured, sun-dried tobacco leaf |
| `color-background` | Piedra | `#EDE7DA` | Weathered limestone plaster, not a designer cream |
| `color-surface` | Piedra Clara | `#F6F2E8` | Lighter panel/card tone, one step up from background |
| `color-ink` | Tinta | `#241E19` | Warm near-black text — old ink and dark hardwood, not `#0B0B0B` |

Semantic alert tokens — deliberately distinct hues so a dispatcher glancing at the escalation
board (§4.3) can tell them apart at a glance, and named to match the spec's own "Amber Alert /
Red Alert" language:

| Token | Hex | Usage |
|---|---|---|
| `color-success` | `#1F4D2C` (Palma Real — royal palm) | Confirmed bookings, VERIFIED suppliers, CSAT positive |
| `color-warning` | `#C98A2C` (Tabaco, reused) | Form validation, expiring credentials (§4.5) |
| `color-timeout` | `#DB7B2B` | The dispatch Amber Alert state (§4.3) — distinct from Warning, more orange |
| `color-error` | `#B23A3A` | The dispatch Red Alert state, failed payments, form errors |

Usage rules:
- Verdín carries primary actions and brand recognition (nav, primary buttons, the map's active
  province fill). It should never appear as a background wash — it's a mark, not a mood.
- Tierra Colorada is for secondary emphasis: category tags, the province hover state, highlighted
  prices. Used sparingly, it stays an accent rather than competing with Verdín.
- Tabaco doubles as the general accent (banners, badges) and the Warning token — thematically
  consistent, since both are "pay attention" signals.
- Never place Tierra Colorada and `color-timeout` adjacent at equal weight — both are
  orange-family and will blur together. If a screen needs both (e.g. a dispatch card showing a
  province tag next to a countdown), drop one to a neutral tone.
- Dark surfaces (the live `/ops` desk, meant to be readable at a glance) invert to Tinta as
  background with Piedra Clara text, not a cold `#000`/`#111`.

## 2. Typography

**Single family: Bricolage Grotesque** (variable, weights 200–800), for both display and body.

Reasoning: it's a genuinely distinct pick, not the Inter/Helvetica default most projects reach
for. It's a *grotesque with intentional irregularity* — designed to feel made by hand rather
than issued by a corporation, which matches "community-based, not a resort chain" directly. It's
a French-designed variable font (Ateliers Triay), a quiet nod to the platform's French-speaking
audience and Bayonne-based operator. And as one variable file rather than a serif+sans pairing,
it keeps payload small, which matters for the storefront's LCP < 1.8s target and the worker
app's offline-first, low-bandwidth design.

Type scale (1.25 ratio, rem):

| Role | Size | Weight | Line-height |
|---|---|---|---|
| Display | 3.052 | 700 | 1.1 |
| H1 | 2.441 | 700 | 1.15 |
| H2 | 1.953 | 600 | 1.2 |
| H3 | 1.563 | 600 | 1.3 |
| Body Large | 1.25 | 400 | 1.5 |
| Body | 1.0 | 400 | 1.6 |
| Body Small | 0.8 | 400 | 1.5 |
| Caption | 0.75 | 500 | 1.4 |

Rules:
- Body copy stays under 80 characters per line (storefront destination content, voucher text).
- No tracked-out all-caps labels, no single-word-in-italic headline accents, no eyebrow labels
  above every heading — these are the generic tells the design should specifically avoid.
- Headings use weight and size to carry emphasis, not color changes mid-sentence.
- es/en/fr all render from the same scale; Spanish and French running text tends to be ~15%
  longer than English, so headline containers should wrap gracefully, never truncate with an
  ellipsis.

## 3. Geometry

| Token | Value | Usage |
|---|---|---|
| `radius-sm` | 4px | Inputs, tags, small buttons |
| `radius-md` | 10px | Cards, modals |
| `radius-lg` | 20px | Hero panels, the package builder's step container |
| `space-unit` | 8px | Base spacing grid — all margins/padding are multiples of this |
| `button-padding` | 12px 20px | Standard button |

Elevation: two levels only, both a warm-tinted shadow (`rgba(36, 30, 25, 0.08)` and
`rgba(36, 30, 25, 0.16)`), never the flat grey `rgba(0,0,0,.1)` under every card at once — that
uniform-shadow-on-everything look is the single most obvious "generated SaaS" tell, and this
platform has real hierarchy to express: a booking card in ACTION_REQUIRED should visually
outrank a routine COMPLETED row, not share its shadow.

Not every card gets a border-radius-plus-shadow treatment by default. Reserve elevation for
things that are actually interactive or actually need to stand out (the dispatch alert card, a
modal); dense data (the analytics tables, the reservation pipeline list) stays flat with hairline
dividers instead — it reads faster and doesn't fight the escalation UI for attention.

## 4. Iconography & imagery

- **Photography over illustration**, and real photography over stock. The whole pitch is
  authenticity — a guide's own photo of their casa particular does more work than a polished
  stock image of a beach. If real photos aren't available yet for a given province/supplier,
  leave a plain, honest placeholder rather than a generic tropical stock substitute.
- No palm-tree, cocktail, or sunglasses iconography anywhere. If the interactive Cuba map (§3.2)
  needs province markers, use simple, geometric pins in Verdín — not postcard-style illustrated
  icons.
- Color grading on any imagery stays natural and warm, not artificially saturated
  "paradise-filter" teal-and-orange.
- Icons throughout (booking states, transport types, credential status) are simple single-weight
  line icons, not the filled-rounded-square app-icon style — they should read as diagrammatic,
  supporting dense operational screens like the back-office, not decorative.

## 5. Motion

Minimal, and reserved for state changes that need confirming: a dispatch card escalating from
Amber to Red, a booking transitioning on the pipeline board, a form submitting. No
scroll-triggered fade-and-slide-up on every section, no hover animation on every card — the
back-office in particular is a working tool used under time pressure (escalation timeouts), not
a marketing page, and gratuitous motion there actively slows a dispatcher down.

## 6. Voice & tone

The platform writes in three languages and three very different contexts — a traveler-facing
storefront, an internal ops tool, and legal documents (vouchers, work orders). One voice, three
registers:

- **Storefront**: plain, specific, active voice. Describe what a trip actually involves, not
  marketing adjectives. "Three nights in a family-run casa in Viñales" beats "an unforgettable
  authentic experience."
- **Back-office**: terse and functional. A dispatcher reading a Red Alert has no time for a
  friendly tone — state what happened and what to do. "Guide declined — reassign" not "Oh no,
  looks like your guide can't make it!"
- **Documents (vouchers, work orders, retention emails)**: formal but human, since these carry
  real legal weight (the MINTUR license number, emergency contacts). No jokes, no filler.

Buttons name the exact action and keep that name through the resulting state: "Confirm booking"
produces a status that says "Confirmed," not "Success!" Errors state what went wrong and the
fix, without apologizing or hedging — a failed dispatch timeout is an operational fact, not a
customer-facing apology moment.

## 7. Layout per surface

```
Storefront (traveler-facing)         Back-office (ops)              Worker app (mobile)
┌─────────────────────────┐          ┌───────────────────────┐      ┌───────────┐
│ hero: map or destination │          │ status board — dense,  │      │ status    │
│ content, generous space  │          │ scannable rows         │      │ banner    │
├─────────────────────────┤          ├───────────┬───────────┤      ├───────────┤
│ editorial content,       │          │ workbench │ live desk │      │ job offer │
│ left-aligned, <80ch      │          │ (detail)  │ (Socket)  │      │  ACCEPT / │
│                          │          │           │           │      │  DECLINE  │
└─────────────────────────┘          └───────────┴───────────┘      └───────────┘
```

- **Storefront**: left-aligned editorial layout, generous whitespace, hero content is the
  interactive province map or a real destination photo — never a generic stat-plus-gradient
  banner.
- **Back-office**: information-dense, flat cards, hairline dividers, the escalation timer colors
  doing the visual work rather than decoration. Optimized for a dispatcher scanning quickly, not
  for first impressions.
- **Worker app**: single-column, large tap targets, minimal chrome — every screen assumes 3G and
  a small screen. Status (Active / Under Audit / Expiring Soon) and the Accept/Decline actions
  get the most visual weight on any given screen; nothing else competes with them.

## 8. Accessibility & performance

- Contrast: Tinta on Piedra and Piedra Clara on Verdín both clear WCAG AA for body text; verify
  any new token pairing before shipping it.
- Visible keyboard focus states on every interactive element, back-office included — it's used
  daily and should be fully operable without a mouse.
- Respect `prefers-reduced-motion`; the Amber→Red escalation state change should still be
  perceivable through color and label alone, not motion alone.
- One variable font file (Bricolage Grotesque) keeps typography payload minimal, supporting the
  storefront's LCP < 1.8s / CLS < 0.1 targets and the worker app's low-bandwidth budget (§5.1).

## 9. White-labeling this file

This document describes the **default tenant** (Vereda Expeditions) values consumed by
`packages/theming`'s `THEME_TOKEN_KEYS`. A fork changes `tenant/agency.config.json`'s `theme`
block and swaps assets (§10.1) — it should not need to touch this file or core components. If a
fork's brand genuinely needs a different structural approach (not just different hex values —
e.g., a beach-resort-focused fork that *wants* the postcard aesthetic this file deliberately
avoids), that's a new design.md for that fork, not an override of this one.

## Quick reference — do / don't

| Do | Don't |
|---|---|
| Ground imagery and color in specific Cuban material references | Reach for generic tropical/resort visual cliché |
| One shadow reserved for things that need to stand out | A uniform soft-grey shadow under every card |
| Active-voice, specific copy | "Unforgettable," "authentic experience," marketing filler |
| Verdín as the primary mark, used sparingly | Verdín as a background wash |
| Simple line icons for operational states | Filled rounded-square app icons, palm/cocktail iconography |
