# Vereda Expeditions · design handoff v1.1 · 12 October 2026

**Start here.** This repository is the complete UI/UX design of the Vereda Expeditions platform (a licensed Cuba travel agency: customer web and mobile, operations desk, worker app, Ops Lite, generated documents, notifications and the brand), ready to be built. The design lives on a canvas and, byte for byte, in `design-canvas/project/`. Nothing in this package is application code.

- Canvas (visual reference, every link live in Play mode): https://claude.ai/code/artifact/1ba05d10-d0c2-4d40-bf60-23fd30395fcf · version label **"Handoff v1.1"**
- Owner: Gabriel Pérez-García for Vereda Expeditions · design baseline v1.0 declared 10 Oct 2026, v1.1 on 11 Oct 2026 (brand added, logo C chosen)
- Scope: 119 artboards on 9 pages · 865 prototype links · 83 design tokens · 9,441 UI strings · EN / ES / FR · EUR

## 1 · Read in this order

1. **`design-canvas/project/T-Signoff.dc.html`** (canvas page 08). The record: baseline, what was accepted and when, the **open items (section 03)** with their owner and the single output each one blocks, the change procedure (05), what you receive (06). None of the open items blocks the start of the build.
2. **`design-canvas/handoff/SCREENS.md`** and `screens.json`. Every screen: file, page, kind, size, title, the screens it links to, its tweakable fields. This is the route map.
3. **`design-canvas/handoff/tokens.css`** and `tokens.json`. The design system as code (primitive, alias, component tiers), exported from DS 06. Use these names; do not invent colours or sizes.
4. **Page 01, the design system**: `Main.dc.html` (foundations), `DS-Actions-Forms`, `DS-Cards-Content`, `DS-Feedback-Nav`, `DS-Mobile-Patterns`, `DS-Handoff` (the token block), `DS-Responsive` (breakpoints, the tablet decision). Status vocabulary with the spec enums is on DS 03.
5. **Page 08, the specs**: `G-StateMachine` (booking states), `G-Dispatch`, `G-Disruption`, `G-Money`, `G-Sync` (flows), `T-Matrix` (every spec requirement → the screen that covers it), `T-Events` (analytics events and properties), `T-Forms` (fields, validation, error codes), `T-Assets` (asset manifest, who produces what), `T-Testing`, `C-Spec` (notification channels, timing, templates), `A-States` (edge states), `A-A11y` (accessibility audit).
6. **The screens**, pages 02 to 07: customer web (22), customer mobile (21), admin (17), worker and Ops Lite apps (10), documents (8), notifications and emails (12).
7. **`design-canvas/handoff/copy-inventory.csv` / `.json`**: every visible string on the 87 product screens, keyed for the i18n catalogue (EN as drawn; ES and FR to translate; worker-app strings are Spanish).
8. **`design-canvas/brand/`**: the logo files (SVG), favicon, app icons, link preview, card QRs, vCard, email signature. The logo is the wordmark "vereda." set once in Fraunces; **never retype it**, always use the files.
9. Research inputs, for context only: `OTA - Specifications Document (3).pdf` (the functional spec, 15 pages; `T-Matrix` maps it), `UI_UX/` (17 design docs), `Viability Studies/` (14 studies), `Vereda Expeditions.pdf` (Design System v1.0 foundations deck, 22 pages, superseded where the canvas differs).

## 2 · The package

```
HANDOFF.md                      this file
CLAUDE.md                       working rules for a coding agent (points here)
design-canvas/
  project/                      THE DESIGN · 119 artboards (.dc.html) + canvas.json (index: page, position, size, title per board)
  handoff/                      tokens.css · tokens.json · screens.json · SCREENS.md · copy-inventory.csv/.json · README.md
  brand/                        live logo files (logo C) · cards/ (QR per employee, vCard) · signature · README.md
  brand/option-a/, option-b/    previous logo directions, kept for the record · not for the build
  tools/                        design generators (brand, diagrams, map, the logo swap), fonts (SIL OFL), the province map SVG, served_sizes.txt, backup/ · not application code
OTA - Specifications Document (3).pdf · UI_UX/ · Viability Studies/ · Vereda Expeditions.pdf   research inputs
```

## 3 · How to read a board

Each `.dc.html` is one self-contained screen (one HTML file, no external assets; every icon, logo and map is inline SVG).

- `<helmet><style>` holds the page CSS; **inline styles hold the values** (spacing, colour, type) and are what the canvas's properties panel edits. Take them literally.
- `data-props` at the end declares the board's **tweaks** (editable fields such as an employee name on a card); `{{hole}}` in the markup is filled by `renderVals()`. `<sc-for>` repeats and `<sc-if>` branches read data arrays in the same script: that data is sample catalogue content (packages, provinces, bookings), not copy.
- `href="X.dc.html"` is **navigation to another screen**; `#…` anchors are in-page. `screens.json` lists them per board.
- Kinds and sizes: **page** boards are fluid, designed at 1280 px and working down to phone width (menus stack, tables scroll); **phone** boards are 390 × 844 (fold marker at 844, bottom nav at 780); **fixed** boards are print (A4, 794 × 1123), email (600 px wide), cards and sheets.
- The files need the canvas runtime (`./support.js`) to resolve tweaks, repeats and links; opened from disk they render as static HTML with the holes visible. Use the canvas for any visual check; read the source for values.
- Photography is a tinted placeholder with its intended alt text; the real photos are an open item (T-Assets 05). Map boards draw real province geometry from `tools/cuba-provinces-simplemaps.svg`.

## 4 · Settled decisions (frozen with the baseline; change only through T-Signoff 05)

- **Palette Isla Abierta**: teal `#0B4F6C` for actions, terracotta `#A83E24` and ochre `#F2B134` for warmth and the brand, warm neutrals (ground `#FBF8F3`, text `#1F1B17`, border `#E8E2D9`, muted `#6E665E`). Semantic colours and the amber `#B45309` for bars and warnings are in the tokens.
- **Type**: Fraunces (display), Inter (UI), IBM Plex Mono (codes, amounts, data). Google Fonts in the boards; the brand files carry outlined type.
- **Accessibility**: WCAG 2.2 AA as drawn. Focus ring 2 px teal on light surfaces, ochre on the dark sidebar. Every icon-only control has a label; every logo has an accessible name. Audit and contrast table on `A-A11y`.
- **Languages and money**: EN, ES, FR (DE and IT deferred); EUR base; worker app in Spanish; text expansion rules on DS 02.
- **Booking logic**: states on `G-StateMachine`; status vocabulary mapped to the spec enums on DS 03; timers 2 h / 30 min with amber at 75 % and red at 100 %; thresholds (refund approval € 500 / € 2,000 / Super Admin, discount > 10 %, margin ≥ 20 %, data retention 6 months + 30 days, credential pause 30 days, reliability floor 85) on `A-Settings`.
- **Navigation**: primary nav Destinations · Packages · Events · Travel info · Blog & guides · Support; About Vereda, Cookie settings and Accessibility in the footer (Legal page). One WhatsApp link everywhere, from configuration.
- **Tablet**: no tablet layouts; rules on DS 07 and `A-States` § 07.
- **Brand**: logo C, the name set once (B-Logo); header wordmark 28 px on web, 26 px on admin and mobile, nothing beside it; monogram "v." only where a word cannot go (favicon, app tile, push badge, QR centre). Business cards: `B-Card` (landscape), `B-Card-Portrait`.

## 5 · Placeholders are configuration

Every value in square brackets on a board is a **configuration value**, not copy: `[MINTUR-2026-XXXX]`, `[tax ID]`, `[registered address, Spain]`, `[Founder name]`, `[number]` (phones), the WhatsApp number, clinic / embassy / insurer numbers per province, the Res. 193/2026 thresholds, the event concierge policy (eight values), supplier names `[provider]`, legal clause text, bios and reviews. Each has an owner and a landing place on **T-Signoff 03**. Build them as one config value each, show the bracket nowhere in production, and keep the manifest on `A-Settings` as their admin surface. The copy inventory flags strings that contain one (`has_placeholder`).

## 6 · Not for the build

- Page 09 boards titled **"Record · not for the build"** (`B-Logo-B`, `B-Logo-C`, `B-Card-B`, `B-Card-C`, `B-Compare`): the logo decision, kept for the reasoning.
- `design-canvas/brand/option-a/` and `option-b/`: previous marks.
- `design-canvas/tools/`: the generators that produced parts of the design, Python, for the design side only.
- Raster versions of the logo (PNG / JPG) are made by Vereda from the SVGs (T-Assets 01, T-Signoff 03); the five custom icon glyphs (T-Assets 03) and the photography are open items.

## 7 · A build order that follows the design

1. Tokens (`tokens.css`) and the base components of page 01, with their states and the focus rules.
2. The shells: web header and footer (`Home`), mobile shell (`M-Home`), admin shell with the dark sidebar (`A-Dashboard`), worker app shell (`W-Home`), Ops Lite (`AL-Inbox`).
3. The customer flow: `Home` → `Destinations` → `Destination` → `Packages` → `Package` → `Booking` → `Payment` → `Confirmation`, with `Compare`, `Custom`, `Concierge` and the mobile twins; states from `A-States` and `Errors`.
4. Account and pre-trip (`Account`, `PreTrip`), content (`Blog`, `BlogPost`, `About`, `Legal`, `Support`, `Join`).
5. Admin (`A-*`), then the worker app (`W-*`, Spanish) and Ops Lite (`AL-*`).
6. Documents (`D-*`, A4, print rules on page 06), emails (`E-*`, 600 px, `C-Spec`), SMS and push (`S-Messages`), the brand email signature (`B-Signature`).
7. Analytics events (`T-Events`), form validation (`T-Forms`), the i18n catalogue from the copy inventory, the state machine and timers.

## 8 · Changing the design

The canvas is the single source of truth; the repository mirrors it (`design-canvas/tools/served_sizes.txt` records the served byte sizes to detect drift). A design change is made on the canvas or in `project/` and published, logged on T-Signoff 04, and re-exported where it touches tokens or strings. Questions and missing values go to the open-items table on T-Signoff 03, which names the owner.
