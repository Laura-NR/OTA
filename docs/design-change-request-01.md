# Change request 01 · Handoff v1.1 · from the build team

**To:** Gabriel Pérez-García (design, Vereda Expeditions)
**From:** the build team, 13 Oct 2026
**Against:** canvas version "Handoff v1.1" (11 Oct 2026), package `vereda-handoff-v1.1` (12 Oct 2026)
**Procedure:** T-Signoff §05. Each item below names the artboard or file, what we found and what we need back.

The package checks out on intake: every board matches `served_sizes.txt`, `tokens.css` and
`tokens.json` agree, and the province map and the spec are identical to our copies. The build has
started from it. The items below block nothing today, but each changes values we are about to write
into code, so we need answers before those values freeze.

## A · Blocking a value in code (please answer first)

| # | Where | Finding | What we need |
|---|---|---|---|
| A1 | `handoff/tokens.css`, `tokens.json` | **The motion tokens are exported as `0ms`.** DS-Handoff defines `--motion-fast: 120ms ease-out`, `--motion-base: 200ms cubic-bezier(.2,.8,.2,1)` and `--motion-slow: 320ms cubic-bezier(.2,.8,.2,1)`, then sets all three to `0ms` inside `@media (prefers-reduced-motion: reduce)`. The export kept the reduced-motion values. | Confirm the DS-Handoff values are intended and re-export. We build with the DS-Handoff values and the reduced-motion override. |
| A2 | Product boards vs `tokens.css` | **The boards use values the tokens do not have.** The main ones are the dark semantic text tones: `#1B5E20` (297 uses), `#92400E` (182), `#0D47A1` (88) and `#B71C1C` (84). They appear on every status pill, alert and error hover. T-Forms names `error-700`, which is not a token. The alerts also draw `-200` borders (`#FDE68A`, `#BBDEFB`, `#C8E6C9`, `#F5C6C2`), and the destructive button hovers to `#B71C1C`. Others include `#C9DDE6` (chip hover and the sidebar link colour), `#F1F6F8` (selected tier / payment card; DS-Handoff calls it "primary-50", which is not a token), and `#F59E0B` (the amber pill border). | Either add these as primitives (we suggest `success-700`, `warning-700`, `error-700`, `info-700`, the four `-200` border tones, `primary-50`, `primary-200`, `warning-500`) or confirm the nearest token. Until then we use the `-600` tone, which passes AA on every `-100` surface per your Foundations contrast table. |
| A3 | Product boards vs type scale | **Off-scale sizes.** 13 px appears 226 times (status pills, tab labels, error text: T-Forms says "13/18 error-700", while DS 02 draws errors at 14/20 error-600). There are also 15 px (92), 22 px (54), 28 px (35) and 26/30/36 px. | Add the sizes you want to keep, or confirm we may snap them: 13→12 for pills, 13→14 for error text, 15→16, 22→24, 28→32. We are snapping in the meantime. |
| A4 | Product boards vs radii | **A 10 px radius** (110 uses), plus 2, 6, 14 and 16 px. | Same question. We snap 10→8 and 14/16→12. |
| A5 | DS 07 | **The breakpoints are not exported.** `--bp-sm/md/lg/xl` (480 / 768 / 1024 / 1280) are defined on DS 07 but are missing from the export. | Add them to the export. We use them as the build's breakpoints now. |
| A6 | DS 02 vs DS 06 | **The focus colour disagrees.** The DS 02/03 board CSS draws the focus ring in `#0B4F6C` (primary-600); DS 06 and `--color-focus-ring` say primary-500. | Confirm primary-500 (the token). |
| A7 | DS 06 tenant model | **The build adds one alias.** A tenant may override the primitives, so a light brand colour would put white text on it. We added `--color-text-on-primary` (default `neutral-0`; `neutral-900` when the tenant's primary is light). It binds existing primitives only and adds no colour. | Ratify it or propose a name. |
| A8 | A-Settings › Manifest, DS 06 | **The palette name.** The canvas calls the palette "Isla Abierta", a placeholder; the agency is Vereda, and the build names the palette `vereda`. The A-Settings select also lists `ecoGreen (preset)`, but the tokens define only one palette. | Rename the palette to Vereda on A-Settings and DS 06. Should there be a second preset? If so, send its primitive values. Until then the build ships `vereda` only, and an unknown palette falls back to it. |

## B · Defects in the package

| # | Where | Finding | What we need |
|---|---|---|---|
| B1 | `T-Matrix.dc.html` | **Three traceability rows are corrupted** into literal regex backreferences (`\1`, `\1\2 … \3 … \5`): the rows after §10.2, after UX 9 and after VS 13. | Restore the three rows. |
| B2 | `T-Assets.dc.html` §01 | **Logo option A survives.** The board names `vereda-logo-horizontal.svg` (no such file), "clear space = one sun diameter" and "cream trail, ochre sun" app icons. It gives email-logo sizes of 140×40 / 280×80, while `brand/README.md` says `email-logo@2x.png` at 360×122. | Update §01 to logo C and one email-logo size. |
| B3 | `canvas.json` / `SCREENS.md` | **Stale index title.** The B-Logo entry is still titled "Logo · the trail and the sun"; the board's own title is logo C. | Fix the index title and re-export `screens.json`. |
| B4 | T-Signoff §02 row 11 | **Some boards are still "In review":** T-Events, T-Forms, DS 07, T-Assets, C-Spec, Concierge, M-Concierge, A-Assistant. | Accept, or list what is still moving. We will not build Concierge or the analytics taxonomy until then. |
| B5 | T-Signoff §06 | **Promised exports are missing:** page 06 as PDF (one page per document) and the five diagrams as SVG. Only pages 01–03 have PDFs; 50 of 119 boards are rendered. | Page 06 PDFs at minimum. They are our reference for the generated documents. |
| B6 | `copy-inventory` | **The inventory is incomplete.** ES is filled only for the worker app (471 strings) and FR is empty. The README lists an `alt` kind, but there are no `alt` rows; photo alt texts are only on the boards. | Who translates, and when? Please also add the alt texts to the inventory. |
| B7 | Fonts | **Fonts:** Inter and Fraunces ship only under `tools/fonts/`, and IBM Plex Mono is not supplied. | No action; FYI. We self-host all three from the Fontsource 5.3.0 builds (SIL OFL): Inter and Fraunces as variable fonts (Fraunces with the opsz axis), Plex Mono 400 and 500, Latin subset. |

## C · Still open from T-Signoff §03 (unchanged, listed so nothing is lost)

Raster brand exports (favicons 32/180/192/512, app icons, og JPG, email logo); the five custom icon
glyphs (casa, paladar, tourist-card, exchange, colectivo); photography (82 placeholders); and every
bracketed configuration value. Each lands as a configuration value or an asset slot in the build,
and the bracket never shows in production.
