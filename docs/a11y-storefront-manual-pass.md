# Manual accessibility pass: the storefront (DS 02–05), 2026-10-29

The owner's pick from the handoff's Next list, the storefront twin of
`docs/a11y-desk-manual-pass.md`. It checks the keyboard, focus, target and screen-reader rules
on the four design-system boards that axe cannot decide: `DS-Actions-Forms` (DS 02),
`DS-Cards-Content` (DS 03), `DS-Feedback-Nav` (DS 04) and `DS-Mobile-Patterns` (DS 05) in
`design/vereda-v1.2/project/`. axe has run since 2026-10-25 (`e2e/accessibility.spec.ts`). No
migration, dependency or spend.

**How it was checked.** I walked 20 public pages and 5 signed-in traveler pages by keyboard
in Chromium (Playwright) at 1280 px and at 390 px with touch emulation (`pointer: coarse`).
For each Tab stop I recorded the element, its accessible name and role (Chromium's
accessibility tree), whether a focus ring showed, its size, and whether anything covered it.
I also walked back up each page with Shift+Tab, measured WCAG 2.5.8 target spacing on every
page, opened the menu drawer, the filter sheet, the FAQ, the package tabs and the cookie
banner by keyboard, and checked rendering at 390, 1024 and 1280 px. No real screen reader was
run: NVDA, JAWS and VoiceOver are not available here.

Verdicts: **pass** (already met), **fixed** (met after this batch), **resolved** (met another
way, recorded in the ADR 0006 amendment of 2026-10-29), **deferred** (not built, with the
reason).

## Every page (shell)

| Rule | Verdict | Evidence |
|---|---|---|
| Skip past the strips and the header (2.4.1, not on the boards) | **fixed** | There was none; the first stop was the conditions strip or the logo. "Skip to content" is now the first stop and moves focus to `<main id="main">`. e2e `storefront-keyboard.spec.ts` |
| Focus is never hidden under the sticky header (2.4.11) | **fixed** | Shift+Tab left links fully under the header ("How much cash should I bring?", the breadcrumb on a destination). The root scroller now keeps the header's height clear (`scroll-padding-top`, plus the destination's "On this page" row). Sections' `scroll-mt-*` were reduced by the same amount, so anchors land where they did. e2e |
| … nor under the phone's bottom bar or the compare tray (2.4.11) | **fixed** | At 390 px Tab put the home search field and button, FAQ answers and footer links under the fixed bottom bar. `scroll-padding-bottom` is 4 rem below md, plus the compare tray's measured height while it shows. e2e on a touch phone |
| One `<h1>`; images have alt text; no duplicate ids | pass | Every walked page |
| Every page has its own title | **fixed** | A trip, a proposal, the custom builder, the mock checkout and the 404 showed the site's default title. They now say "Your trip", "Your custom proposal", "Build your itinerary", "Payment (mock)" and "Page not found" (en/es/fr). e2e |
| No nameless keyboard stops | **fixed** | Chromium makes a scrolling box with nothing focusable inside it a Tab stop. A trip's itinerary table on a phone was one, with no name. The trip's, the proposal's and the destination's tables now scroll in a named region ("Itinerary · table") |

## DS 02 · Actions & form controls

| Rule | Verdict | Evidence |
|---|---|---|
| Real elements; visible labels; 2 px ring, 2 px offset (ochre on dark) | pass | No stop without a ring. A date field's calendar button shows Chromium's own focus box |
| Loading is `aria-busy` and keeps its label | pass | `Button loading` (unit test) |
| On touch screens md grows to 44 px | **fixed** | md buttons and text fields were 40 px on a phone. A `pointer-coarse:` variant (`@media (pointer: coarse)`, in the preset) gives md buttons, `Input`, `Select` and the wrapping button 44 px. A mouse keeps 40 px. Unit tests, e2e |
| Icon buttons 44 × 44, named | **fixed** | The event strip's chevron link was 20 × 20 on a phone; now 44 × 44 without making the strip taller |
| Destructive actions sit behind a confirmation | **fixed** | "Decline" (a proposal) and "Withdraw" (an event request) acted on one click and are final. Each now opens a dialog that states the consequence: "Keep the …" or the destructive confirm. Focus returns to the trigger. e2e (keep path) |
| Errors are `role="alert"` and say what to do | pass | `Field` (unit test) |
| Disabled: label kept, reason beside it | **fixed** | The booking flow's first and last steps, the event request's two steps, a full compare selection and a full custom route used silent native `disabled`. They are now `aria-disabled`, keep their focus and give their reason (`Button unavailableReason`, or `aria-describedby` to the shown note). Bounds of a counter stay disabled. e2e on the booking flow |
| Date range picker (arrow keys, 44 px days, sold-out days announced) | resolved | The storefront uses native date fields, whose keyboard and announcements come from the browser. The board's custom picker is not built |
| Currency switcher | deferred | Display currencies are M9 D7 (deferred); prices show in EUR |

## DS 03 · Cards, content & commerce

| Rule | Verdict | Evidence |
|---|---|---|
| Header nav, language, sign in; footer columns | pass / **fixed** | Language links are now named in their own language ("Español", which contains the visible "es"), with `lang`/`hreflang` and `aria-current` on the current one |
| Footer links on a phone | **fixed** | 20 px lines 28 px apart; on a touch screen each is now a 44 px row |
| Cards: one link per action; total and model before the click | pass | Title link and "View trip" |
| Reviews: rating in text | pass | Sample copy |
| Cookies: Accept and Reject equal; no pre-ticked boxes | pass | Both secondary, the same size. 44 px on touch now |
| Focus behind the cookie banner | deferred | Until a choice is made, the banner covers about 60 % of a 390 px screen, so focus can move behind it (2.4.11). It comes right after the skip link and the strips, so a keyboard user meets it first. Reserving room for it, or making it smaller on a phone, is a design decision |
| Support channel picker, 15-minute reply | pass | Support page |

## DS 04 · Status, feedback & navigation

| Rule | Verdict | Evidence |
|---|---|---|
| Status in words, not only colour | pass | `TravelerStatusBadge` |
| A critical crisis banner is acknowledged, never closed with ✕ | pass | `CrisisBanner` (unit tests) |
| Toasts: 6 s, pause on hover, never the only copy of an error | not applicable | The storefront shows no toasts |
| Stepper: phone variant, steps tappable only when done | pass | `Stepper` (unit tests); a booking step's change moves focus to its heading |
| Breadcrumb; tabs with arrows; accordion with `aria-expanded` | pass | Tabs move with the arrows (walked); FAQ buttons carry `aria-expanded`/`aria-controls` |
| Pagination: current page not a link | not applicable | Lists show every result (few packages) |
| Modal: focus trapped, Esc closes, focus returns | pass | Native `<dialog>`: the menu drawer and the filter sheet move focus in and back on Esc |

## DS 05 · Mobile, offline & responsive

| Rule | Verdict | Evidence |
|---|---|---|
| Bottom bar: 5 items, labels shown, 64 px | pass | |
| Drawer: focus trapped, close top right, 48 px rows | pass | Rows measured 48 px |
| Drawer holds language and currency, so the header stays clean | resolved | The phone header keeps the three language links: on a touch screen each is 44 px tall (the hit area grows around the pill) at the width the header has room for. Currency waits for M9 D7 |
| Targets 48 px, 8 px apart; 44 px minimum | resolved | Controls meet 44 px on touch (see DS 02). Every page passes WCAG 2.5.8 (24 px or spacing) at 390 and 1280 px. Stand-alone text links that are not controls (a back link, "Download PDF", a phone number) keep their line height, as the desk's table links do |
| Data tables become stacked cards on a phone | deferred | The trip's itinerary table scrolls sideways in a named region instead. Stacked cards are a layout change for a later batch |
| Offline, text-only mode, stale-data chip | pass | Phase 8 item 2 (`storefront-offline.spec.ts`, `storefront-display.spec.ts`) |

## Still open

- **A real screen-reader pass** (NVDA + Firefox/Chrome, VoiceOver + Safari/iOS) on the
  home page, the package booking flow and a trip, as for the desk.
- **The cookie banner on a phone** (focus can go behind it) and **stacked table cards**
  (DS 05) are design changes, recorded above.
