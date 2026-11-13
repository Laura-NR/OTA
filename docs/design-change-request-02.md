# Change notice 02 · Handoff v1.2 · from the build team

**To:** Gabriel Pérez-García (design, Vereda Expeditions)
**From:** the build team, 14 Oct 2026
**Against:** canvas version "Handoff v1.2" (14 Oct 2026), package `vereda-handoff-v1.2.zip`
**Status:** for information. Nothing here waits for an answer; we have resolved each item in the build
with the existing tokens and components. If you want the canvas to match, these are the changes to
carry over (T-Signoff §04).

Thank you for v1.2. It checks out on intake: all 120 files match `served_sizes.txt`, `tokens.css` and
`tokens.json` agree on all 106 tokens, and the copy inventory differs from v1.1 only by the 79 `alt`
rows. The build now uses the v1.2 tokens, including the `-700` and `-200` tones, `--text-label`,
`--text-nav`, the breakpoints and the primary-600 focus ring.

## A · Product decisions that change drawn screens

| # | Where | What we decided |
|---|---|---|
| A1 | DS 06, DS-Handoff, A-Settings, Main, T-Signoff | **The palette is "Vereda".** It is `vereda` in code and in the manifest. Your "Isla Abierta only" answered an earlier draft of our request 01, which asked about `ecoGreen`; the owner has since renamed the palette. We agree with removing `ecoGreen`. |
| A2 | S-Messages; C-Spec §01, §04 | **No SMS asks for a reply.** No network lets anyone reply to an alphanumeric sender, and Cuba is one-way. Each traveler SMS carries one signed link and the desk call remains the fallback: the check-in links to a page with "All good" and "I need help", the payment SMS to the pay page (which offers the one 24 h hold as a button), and the disruption SMS to the options page you drew (`/o/`). The acknowledgements become that page's confirmation, not an SMS. C-Spec §04's copy rules apply everywhere: one GSM-7 segment, no á í ó ú, and never the word "reply". |
| A3 | W-*; T-Signoff §03 "Native app shells" | **The worker app is a native Android app installed outside the stores**, updated from our own server. We are building, in the W-* style: a download page (version, size, certificate fingerprint, a 32-bit download for older phones, an "Android only" state for iPhones); illustrated install steps (Chrome's "unknown apps" setting, Play Protect); the approval SMS, email and QR card; an in-app update prompt (optional or required, never blocking an active job); and first-run permission prompts with their reasons. Store listings are dropped. The adaptive icon layers are still on your §03 list. |
| A4 | W-Job › Emergencia | **The emergency SMS goes to the desk's mobile line**, a separate configuration value: the `+53 7 …` number drawn elsewhere is a landline, which cannot receive SMS. The body is `VEREDA SOS {job code} {type} {lat},{lon} ±{m} m {hh:mm}`, in one GSM-7 segment. After sending, W-Job shows "sent, wait for the call" or "could not send: call 104 / 106 / 105 and the desk". |
| A5 | C-Spec §01, §05; W-Home, W-Offer; AL-* | **No push.** Google push is unreliable in Cuba, and we do not use Expo's US-hosted push service. An offer reaches the worker by SMS at T+0 (a short-notice offer lasts 30 minutes), plus an in-app notice whenever the app has data. Ops Lite alerts are browser notifications while the desk page is open. |

## B · Values we snap in the build

| # | Where | What we do |
|---|---|---|
| B1 | Product boards | We snap the 18 colours outside the tokens: `#A61E1E` → `error-700`; `#C98A00` → `accent-600`; the blue-white tints → `primary-50`; `#FFF8F7` → `neutral-50`; `#DCE6D5` → `success-100`; `#A89F94` → `neutral-500`. Map fills → `success-200`, `warning-100`, `neutral-300`; chart series → `primary-600/500/200/100`. The search-preview blue stays literal. |
| B2 | Product boards | We snap the sizes outside the scale: 10 and 11 px → 12 (including the bottom-nav labels), 38 → 40, 44 → 48, and 52, 72 and 96 → 56. 18 and 20 px radii → 12. |
| B3 | DS-Handoff | The text still says "ring primary-500" in two places; the token (primary-600) is what we build. |
| B4 | `tokens.css` notes | The `-700` tones measure 6.4:1 (warning) and 5.7:1 (error) on their `-100` surfaces. That is AA, but not the "7:1 or better" the note says. |
| B5 | DS 03 vs A-Bookings | We use the amber DS 03 "Action needed" everywhere, not the red drawn on A-Bookings. |
| B6 | `exports/` | We work from the `.dc.html` source for the 23 unrendered admin, worker and Ops Lite boards; renders are welcome, not awaited. The nested `exports.zip` in v1.2 is a stale copy of the v1.1 exports. |
| B7 | Copy inventory | We draft ES/FR for the screens we build and flag them for Vereda's translator. |
| B8 | DS-Mobile-Patterns, DS-Responsive, A-Dashboard | We use Home's six links as the nav, in the drawer too. "Talk to a specialist" appears from 1280 px only: at 1024 the six links leave no room for it. The admin wordmark keeps the "Ops" caption as A-Dashboard draws it. |

## C · Still open from T-Signoff §03 (unchanged)

These land as configuration values or asset slots, and a bracket never shows in production:
- raster brand exports;
- the five custom icon glyphs;
- photography (82 placeholders);
- the bracketed configuration values (212 strings in the inventory carry one), including the
  eight values of the event ticket policy;
- the ES/FR translation.
