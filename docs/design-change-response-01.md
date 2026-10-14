# Response to change request 01 · Handoff v1.2 · 14 October 2026

**To:** the build team · **From:** Gabriel Pérez-García (design) · **Answers:** `design-change-request-01.md` of 13 Oct 2026
**Delivered with:** canvas version label **"Handoff v1.2"** (14 Oct 2026), repository commit of the same name, `vereda-handoff-v1.2.zip`.

All fifteen findings were verified against the files and hold. Section A answers the value questions; section B lists what was fixed in the package; section C is unchanged. Every change is logged on T-Signoff § 04 under 14 Oct 2026.

## A · Values

| # | Answer |
|---|---|
| A1 | **DS-Handoff values are the intended ones.** The exporter had kept the reduced-motion override. `tokens.css` now carries `--motion-fast: 120ms ease-out`, `--motion-base: 200ms cubic-bezier(.2,.8,.2,1)`, `--motion-slow: 320ms cubic-bezier(.2,.8,.2,1)` and, as a separate `@media (prefers-reduced-motion: reduce)` block, the three `0ms` overrides. `tokens.json` lists the override under `reducedMotion`. |
| A2 | **Added, not snapped.** The dark tones are deliberate: success-600 on success-100 measures 4.6:1, barely AA at pill size; the -700 tones the boards use measure 7:1 or better. Fourteen primitives are now on DS 06 and in the export: `success/warning/error/info-700` (text on the -100 surface), `success/warning/error/info-200` (alert and pill borders), `primary-50` (selected tier, payment card), `primary-200` (sidebar links, chip hover), `warning-500` (the amber pill border), `accent-50`, `accent-700`, `neutral-600`. T-Forms now names `error-600` for error text (see A3). Not tokens: `#B9CFD6 #E3B9A6 #DCC9B6 #D9C9A3 #E7C6B5` are the photo placeholder tints and disappear with the photography; `#F5B5B0`, `#A5D6A7`, `#EFEAE2` snap to `error-200`, `success-200`, `neutral-100`. |
| A3 | **Ratified where systematic, snapped where not.** 13 px is the pill the DS boards themselves define and 15 px is the primary nav link: `--text-label: 600 13px/16px` and `--text-nav: 500 15px/20px` are now tokens. The mobile and dense-panel headings are ratified as `--text-h1-compact: 600 28px/34px` and `--text-h2-compact: 600 22px/28px` (display face). Everything else snaps in the build: 26 → 28, 30 → 32, 36 → 40, 17 → 16, 19 → 20, 21 → 22. Error text is **14/20 error-600**, as DS 02 draws it; T-Forms said 13/18 error-700 and has been corrected. The snap table is recorded as a comment in the token block. |
| A4 | **Snap, as you proposed:** 10 → 8 on controls and 12 on containers (the 10 px boxes sit beside 12 px cards), 14 and 16 → 12, 6 → 8, 2 and 3 → 4 (the 2 px on the business-card boards is a print bleed artefact, 0 in production). Recorded in the token block. |
| A5 | **Exported.** `--bp-sm/md/lg/xl` (480 / 768 / 1024 / 1280) are now on DS 06 and in `tokens.css`; DS 07's `--container` is DS 06's `--container-max` (1280 px). Use them as the build's breakpoints. |
| A6 | **primary-600**, not primary-500. Every board and the A-A11y audit draw the ring in `#0B4F6C` (8.4:1 on cream); the token was the odd one out and now reads `--color-focus-ring: var(--color-primary-600)`. Ochre on dark surfaces, unchanged. |
| A7 | **Ratified** as `--color-text-on-primary: var(--color-neutral-0)`, with the rule in the comment: `neutral-900` when a tenant's primary is light. It is in the alias tier of the export. |
| A8 | **Isla Abierta only.** `ecoGreen (preset)` was a sample from the spec's multi-tenant theme model, not a defined palette; it is removed from the manifest select on A-Settings. A second preset would arrive as a change request with its primitive values; an unknown palette falls back to `islaAbierta`, as you built it. |

## B · Package defects

| # | Done |
|---|---|
| B1 | The two stray `\1` are removed and the destroyed row rebuilt: UX 13, Analytics and KPI framework → T-Events, A-Reports, A-Dashboard. The matrix has 51 rows. |
| B2 | T-Assets § 01 rewritten for logo C: `vereda-wordmark.svg` (-white, -mono), `vereda-logo-full.svg`, `vereda-logo-stacked.svg`, the monogram `vereda-mark.svg`; clear space one x-height; favicon and app icons as the monogram; **one email logo, `email-logo@2x.png` 360 × 122 shown at 180 × 61**, as on B-Signature and in `brand/README.md`. |
| B3 | Index title fixed; `screens.json` and `SCREENS.md` regenerated. |
| B4 | Row 11 is **Accepted, 11 Oct 2026** (the boards were accepted with the brand section; the record lagged). Concierge, M-Concierge, T-Events, T-Forms, DS 07, T-Assets, C-Spec and A-Assistant are baseline content. |
| B5 | `design-canvas/exports/` now holds 96 of 119 boards: pages 06 (all eight documents, A4, one page each in `pdf/06-Documents-PDF.pdf`), 07, 08 and 09 complete, rendered straight from the source since those boards are static. The five diagrams ship as **PDF and PNG**, not SVG: they are HTML cards with SVG arrows, so no single vector exists; T-Signoff § 06 is corrected. The 23 admin, worker and Ops Lite boards run on the canvas runtime (repeats, branches, handlers) and will follow from a page export of the editor. |
| B6 | **Alt texts added**: 79 rows of kind `alt`, keyed `<screen>.alt.<seq>.<slug>`, one per photo slot, so the inventory now has 9,520 strings. Translation: ES and FR are Vereda's, through the A-Content workflow; it is now an open item on T-Signoff § 03 with Vereda as owner. EN ships first; the worker app is already Spanish. |
| B7 | Agreed: Fontsource variable builds, Fraunces with the opsz axis, Plex Mono 400 and 500, Latin subset. Nothing to change. |

## C · Open inputs

Unchanged, on T-Signoff § 03 with owners: raster brand exports, the five custom icon glyphs, photography, every bracketed configuration value, and now the translation.

## How to raise the next one

Drop `design-change-request-02.md` at the repository root; the answer arrives as `design-change-response-02.md`, the canvas gets a new version label and T-Signoff § 04 an entry. Tokens and other frozen items change only this way (T-Signoff § 05).
