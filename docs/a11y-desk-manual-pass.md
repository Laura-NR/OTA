# Manual accessibility pass: the desk (A-A11y), 2026-10-29

The owner's pick from the handoff's Next list. This is the keyboard and screen-reader pass on
the desk rules in `design/vereda-v1.2/project/A-A11y.dc.html` that axe cannot decide (axe has
run since 2026-10-25: `e2e/accessibility.spec.ts`). No migration, dependency or spend.

**How it was checked.** I walked 23 desk pages by keyboard in Chromium (Playwright, 1280 px).
For each Tab stop I recorded the element, its accessible name, whether a focus ring showed,
its size, and whether anything covered it. I read the dispatch matrix's accessibility tree,
traced focus in and out of each panel, and watched the live regions while an amber offer
turned red (a dev fixture). I checked rendering at 390, 1024 and 1280 px. No real screen
reader was run: NVDA, JAWS and VoiceOver are not available here. "What a screen reader
hears" below is Chromium's accessibility tree, so a pass with a real screen reader stays
open (see the end).

Verdicts: **pass** (already met), **fixed** (met after this batch), **resolved** (met another
way, recorded in the ADR 0006 amendment of 2026-10-29), **deferred** (not built, with the
reason).

## 01 · Red and amber alerts

| Rule | Verdict | Evidence |
|---|---|---|
| Strip says red/amber in words and colour; nothing blinks | pass | `ops-desk.tsx` strip and row tints; no animation |
| A new red alert is announced once (`role="alert"`), amber politely; timer ticks never | **fixed** | Before: the strip itself was the live region, appeared with its content (often not announced) and read counts. Now two always-mounted regions announce each crossing from `alertCrossings` (`packages/domain`, 4 unit tests): "Red alert. Booking E2EKBD01: Guide, …, timed out at 13:40. Press R to re-dispatch." e2e `desk-keyboard.spec.ts` |
| Audio cue, repeat every 60 s, "Mute 15 min" logged with the actor | **fixed** (2026-10-29, later) | Owner: per desk, audited. Two-note Web Audio cue after the first interaction (`alertCue`, `packages/domain`, unit tests); `dispatch.alerts_muted`/`_unmuted` audit rows; a newer red alert still sounds. e2e `desk-alerts.spec.ts` |
| Shortcuts in a "?" overlay; never inside a text field | **fixed** | `desk-shortcuts.tsx`; `resolveShortcut`/`isTypingTarget` (`packages/ui`, unit tests); e2e |
| `R` re-dispatch for the focused red/amber row | **fixed** | Matrix and a booking's services; red first, else amber; e2e |
| `A` acknowledge (undo 6 s) | **fixed** (2026-10-29, later) | `A` on a focused matrix row or its Acknowledge button; a 6 s undo toast, then `dispatch.alert_acknowledged` for the desk. Red alerts only (amber has no repeat). e2e `desk-alerts.spec.ts` |
| `/` jump to search | deferred | The desk has no search field yet |
| `G` then `D` / `B` / `P` | **fixed** | e2e |
| `Esc` closes the panel; focus returns to its trigger | pass | Native `<dialog>`; checked on the re-dispatch drawer and the shortcut list |
| `?` shows the list | **fixed** | Also the header's "Keyboard shortcuts" button |
| Single-key shortcuts can be turned off (WCAG 2.1.4, not on the board) | **resolved** | A switch in the list, per device |

## 02 · Dispatch matrix

| Rule | Verdict | Evidence |
|---|---|---|
| A real table; `scope="col"` | pass | Accessibility tree |
| The booking cell is the row header | **fixed** | Was a `<td>`; now `<th scope="row">` (also a booking's services: the service) |
| Each action is a real button or link; the row is not clickable | pass | |
| Actions say what they act on | **fixed** | Was "Re-dispatch" ×2 and "Open" per row; now "Re-dispatch Guide · E2EKBD01", "Open E2EKBD01"; Offer and Call name the worker |
| Timer bar labelled; percentage also in the pill | pass | `img "83 % of timer elapsed"`, pill "Offered · 1 h 40 m · 83 %" |
| Re-dispatch panel: focus on its heading, back to the button on close | **fixed** | Focus went to Close; `Drawer focusTitle`. Return was already native. If the offer removes the button, focus goes to the row's booking link |
| Sticky first column under 1024 px that never covers focus (2.4.11) | **fixed** | Was not sticky; now sticky at every width (the matrix already scrolls at 1024) with a matching `scroll-padding-inline-start`. At 390 px a focused button sat under the column before the padding, and is clear of it after |

## 04 · Forms, controls, structure

| Rule | Verdict | Evidence |
|---|---|---|
| Visible labels | pass | axe + walk |
| Choice cards are label + radio | pass | Disruption scenario/severity |
| State filters are buttons with `aria-pressed` | resolved | They are links with `aria-current`, because they change the URL (bookmarkable). Kept as links |
| Switches: `role="switch"` + `aria-checked` | pass | `@ota/ui` Switch |
| Disabled actions stay focusable (`aria-disabled`) with the reason beside them | **fixed** | 25 actions that waited on input or on a second approver (natively disabled, silent) now use `Button unavailableReason`. Busy states stay disabled. e2e on "Open case" |
| Targets 44 px; icon-only buttons labelled | **fixed** | Sidebar Passkeys/Sign out were 16 px high; bare 13 px checkboxes now 20 px with their labels. Table text links (17 px) fall under 2.5.8's inline exception |
| One `<h1>` per page; sidebar `<nav>` with `aria-current` | **fixed** | 22 shell pages pass; sign-in, invitation and passkeys had none (card `<h3>`) |
| Skip past the sidebar (2.4.1, not on the board) | **fixed** | "Skip to content", the first stop on every shell page |
| Tabs: `role="tab"`, arrows | pass | `@ota/ui` Tabs |
| `lang="es"` on Spanish quotes inside English screens | deferred | Messages carry no language, so the desk cannot tell |
| Accessible authentication (3.3.8) | pass | Email link or passkey |
| Empty link text | **fixed** | A customer with an empty name rendered an empty "Open" link |

## 05 · Worker app and Ops Lite

Not applicable: neither exists yet (ADR 0007).

## 06 · Charts and figures

| Rule | Verdict | Evidence |
|---|---|---|
| Bars carry their values in text; legends repeat numbers | pass | `BarList` prints label and value; the dashboard's aging bars are `aria-hidden` beside a list of counts |
| Funnel prints counts and percentages | pass | Reports |

## Still open

- **A real screen-reader pass** (NVDA + Firefox/Chrome, VoiceOver + Safari) on the dashboard,
  a booking, and the forms with unavailable actions. This needs a machine with those tools.
- ~~The audio cue, acknowledging and muting, plus `A` (see 01).~~ Built 2026-10-29 (later):
  ADR 0006 amendment "the desk's alert acknowledgement, audio cue and mute".
- **`/` jump to search**, once the desk has a search.
- **The storefront has no skip link** either (outside this desk pass).
