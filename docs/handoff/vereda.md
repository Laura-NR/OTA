# Handoff — vereda — updated 2026-10-14 22:10

## Goal
Build the design team's handoff into the platform. The current handoff is `design/vereda-v1.2/`;
`design/vereda-v1.1/` is kept for the record. Plan and phases: `docs/design-v1.1-plan.md`.
Decisions: ADR 0006 (design system; amended for v1.2, change request 02 and Phase 3) and ADR 0007
(worker app).

## State
- **Phases 0, 1, 0b, 2 and 3 are done** (committed locally on `vereda`; nothing is pushed).
- **Phase 4 gate:** `docs/schema-m1-package-v2.md` (`f102a66`) is the M1 (Package v2) schema
  diff for review: a validated draft of `schema.prisma` (`prisma validate` passes), decisions
  D1–D4 with options and recommendations. **No migration is generated. Waiting for the owner.**
- **Phase 5, no-migration part (admin):**
  - `47ed5dd` **Dashboard** = A-Dashboard: month figures (bookings mix, GBV by rail), pending
    confirmations in 4 aging buckets, alerts, the live dispatch matrix (`/ops` socket, Havana
    timers, re-dispatch drawer that offers to a chosen worker), desk tasks (start dispatch for
    submitted bookings, expiring licences, retention purges). Escalation and dispatch pages are
    gone; `/dashboard/dispatch` and `/dispatch` redirect. `GET /dispatch/active` returns board rows
    (`DispatchBoardRowDto`: traveler, dates, worker names, `waitingSince` = first offer).
  - `fca9a4c` **Bookings + Booking** = A-Bookings (saved views, state chips with counts,
    travel-date/province filters, urgency order, cards under 768 px, who-acts legend) and
    A-Booking (figures incl. supplier cost/margin, pipeline stepper, actions, services with worker,
    timer, payout, start dispatch and re-dispatch, payments, duty of care, documents, audit log).
    List/detail DTOs gained `packageName`, `provinces`, `serviceItemsAccepted`, `paidAmount`; the
    detail's items are the ops-only `ReservationDeskItemDto` (worker name, payout); `/me` unchanged.
  - **Reports (increment 3) is built but NOT committed** (working tree): one `/reports` page
    (period presets mtd/lastMonth/ytd/all, `?year=` still accepted; exports; anchors
    financial/regulatory/dispatch/quality/geography), `components/bar-list.tsx`, the
    `/reports/regulatory` and `/reports/quality` pages deleted (redirect to `/reports#…`), nav tabs
    removed, `backoffice.reports` replaces `analytics`/`regulatory`/`quality` in en/es/fr. The
    dashboard revenue card now uses `BarList` too. Typecheck, lint and the i18n parity test pass;
    **e2e specs not updated yet, no browser check yet.**
- New pure rules in `@ota/domain`: `dispatch/aging.ts`, `analytics/booking-mix.ts`,
  `time/ops-calendar.ts` (Havana zone, month range, calendar day), `reservation/booking-views.ts`
  (travel windows, arriving-soon, urgency order, pipeline position). All tested.

## Verified (2026-10-14)
- Task 1 on `60eb005`: lint, format:check, typecheck, `pnpm test` 382 passed / 4 skipped, build
  18/18 (turbo cache hit). First `pnpm e2e` run: every Next page answered "Internal Server Error"
  (both apps), so all back-office tests failed; **not reproduced**: the same procedure re-run gave
  44/44. Mechanism unknown (see Traps).
- On `fca9a4c`: lint, format:check, typecheck; domain 101, api 185 (+3 skipped), schemas 14,
  i18n 4 tests pass; e2e run per increment: dashboard specs 7/7 (admin-shell, escalation,
  dispatch), bookings specs 14/14 then 7/7 (reservations, intake, payments, regulatory, quality,
  messages). **The full `pnpm e2e` was not re-run after Task 1.**
- Browser checks at 390/1024/1280 (screenshots + computed styles) for /dashboard, /bookings and a
  booking page: no horizontal overflow; h1 Fraunces 24/32, section titles 22/28, overlines 700
  12/16 primary-600, red strip error-600, amber rows accent-50; no hydration errors after the fix
  below. Visual fixture bookings VISUAL01/02 were created for the shots and removed.

## Assumptions & unknowns
- **Open with the owner — M1 (Article 2, Q9):** approve the draft or pick options D1–D4 in
  `docs/schema-m1-package-v2.md` (recommended: base text + per-locale overlay row; base price +
  tier delta + departure price; `status` replaces `active` with a backfill; agency-wide terms in
  the manifest).
- "Merge the board" was read as: the pipeline board's status counts feed the Dashboard's Bookings
  figure, and its list became the A-Bookings table at `/bookings` (tab still "Pipeline").
- Not built (data or decision missing): payment windows, owner/My queue, OFAC, disruption, audio
  cue and mute, on-the-ground panel, search, CSV export, version locks, internal notes,
  travelers/itinerary on the booking, GBV-by-month chart, reinvestment ledger, NPS.
- ES/FR for `backoffice.dashboard`, `.bookings`, `.reservation`, `.reports` are agent-drafted.
- Earlier open items still stand (Cubacel 24/7 line, change notice, offer-SMS cost; placeholder
  tenant content).

## Traps
- **Hydration and ICU:** Node and Chromium format dates with different spaces (`formatRange`
  thin/narrow spaces), which broke hydration on the dashboard. Date helpers in
  `apps/backoffice/src/lib/ops-format.ts` normalise spaces; a ticking client clock starts from the
  server's `serverNow` prop, not `Date.now()`.
- **Run-1 e2e 500s (unexplained):** if every Next page answers "Internal Server Error", stop all
  dev processes (`next-server` processes do not match `pkill -f 'next dev'`), delete
  `apps/*/.next`, start again. `pkill -f <pattern>` also kills your own shell when the pattern is
  in its command line (exit 144). Deleting `.next` under a running dev server makes it hang.
- Playwright leaves the dev servers it started on 3000–3002; kill them after `pnpm e2e`.
  `DEBUG=pw:webserver` shows their output.
- **Charts:** the board's three rail colours fail the categorical palette check (teal too low in
  chroma, no token triplet passes), so charts are one-hue `BarList`s named by labels.
- `reservationServiceItemSchema` is shared with the traveler `/me` DTO: put ops-only fields on
  `reservationDeskItemSchema`, never on the shared one.
- Strict-mode locators: "Bookings" also matches "All bookings" (use `level: 1`); "Alerts right
  now" matches "No alerts right now." (use `exact: true`).
- Stale `.next/types` after deleting a route fails typecheck: `rm -rf apps/backoffice/.next`.
- Earlier traps still apply (tenant tokens on `<html>`, `cn()` sizes, `getPageContent` 404,
  `TENANT_CONFIG` overrides, rebuild a changed package, design notes are input).
- **AGENTS.md §C lines proposed (owner edit),** in addition to earlier ones:
  - "The admin Dashboard (A-Dashboard) merges escalation and dispatch: `GET /dispatch/active`
    returns `DispatchBoardRowDto` rows (ops-only; `waitingSince` is the first offer in the
    ledger). Ops clocks are Havana time (`OPS_TIME_ZONE`, `@ota/domain` `time/ops-calendar`)."
  - "Reports is one page (`/reports`, anchors per §4.9 section); `/reports/regulatory` and
    `/reports/quality` redirect there."

## Next
1. Finish Reports: update `e2e/analytics.spec.ts` (heading "Reports"; texts), `e2e/regulatory.spec.ts`
   (`/reports#regulatory`, heading "Regulatory & tax compliance") and `e2e/quality.spec.ts`
   (`/reports#quality`, "Service quality, experience & duty of care", "Worker reliability"); check
   that the `#` redirects work; screenshots at 390/1024/1280; commit (`feat(backoffice): merge
   analytics, regulatory and quality into Reports`).
2. Docs commit: ADR 0006 Phase 5 amendment (timer column second, Open under the timer, saved views
   as a row, total·paid column, one-hue bar charts, truthful who-acts legend), plan progress row.
3. Full verify: lint, format, typecheck, test, build (stack stopped), delete `.next`, `pnpm e2e`.
4. Ask the owner the M1 questions (D1–D4) if not answered; then Phase 5 continues (Suppliers…).

## Decisions (append-only)
- 2026-10-12 — the canvas ranks above the UI_UX research docs where they conflict (HANDOFF §1).
  This covers WhatsApp deep links only, EUR base, and passwordless sign-in.
- 2026-10-13 — the owner accepted the plan's recommendations (Q1–Q6, Q8–Q13). The canvas design
  replaces the 2026-09-26 design.
- 2026-10-13 — the motion tokens use the DS-Handoff values. The export's 0 ms values are the
  reduced-motion override (A1).
- 2026-10-13 — the four legacy presets are removed. The default preset was first named
  `islaAbierta`, after A-Settings.
- 2026-10-14 — the owner renamed the preset `vereda`: "Isla Abierta" was a placeholder name, and
  the agency is Vereda Expeditions. The design team is asked to follow (change request A8).
- 2026-10-13 — only the fonts' Latin subset is shipped: `next/font/local` cannot split one family
  by unicode-range, and Latin covers EN/ES/FR/DE/IT.
- 2026-10-13 — commits are made locally per increment on `vereda`, under the owner's approval of
  the plan. Nothing is pushed.
- 2026-10-14 — Q7: the worker app stays native (Expo, ADR 0001), Android first, sideloaded with
  a self-hosted update server. The PWA recommendation was withdrawn because the design's no-data
  features need native code (ADR 0007).
- 2026-10-14 — v1.2 adopted (ADR 0006 amendment). The dark tones are tokens rather than snaps.
  Field errors stay `error-600`. The palette key stays `vereda` despite the design's A8 answer
  (raised again in CR-02 A1).
- 2026-10-14 — the admin row tints are a `TableRow` `tone`, not app-level classes. The boards tint
  rows accent-50 (timer running low) and error-100 (expired).
- 2026-10-14 — Phase 2: no placeholder pages. A nav link renders only when its page exists;
  missing pages wait for the owner's order. The old admin pages keep working under their new
  section, with a tab row, until Phase 5 merges them. Redirects are 307 while the IA settles.
- 2026-10-14 — the storefront footer shows only live payment marks (SEPA, the wire rail) and
  contact lines set in the manifest. The card marks wait for the card gateway.
- 2026-10-14 — the owner took every recommendation:
  - pages in the order Support, Travel info, Blog, About;
  - only a draft Privacy notice among the legal texts;
  - Events after the policy and M10;
  - read-only admin Payments and Settings;
  - agency copy in `tenant/messages`.
  Placeholder or mock data is kept until real data is published, and each such page shows a
  sample-content notice.
- 2026-10-14 — the owner asked the build to resolve the design issues itself. Change request 02
  became a for-information notice, with the resolutions in the ADR 0006 and 0007 amendments.
  The offer SMS goes at T+0 by default.
- 2026-10-14 — "Talk to a specialist" shows from `xl` only, not as DS 07's `lg` text button,
  because the six links fill the `lg` header.
- 2026-10-14 — storefront path renames redirect with 307 until launch (as the back-office), then
  become 308. Only the 404 and 500 error pages are built; the other three wait for triggers.
- 2026-10-14 — Phase 3 built on today's data with no migration, one increment per commit. The
  boards' sample reviews and testimonials are not shown: real ones need consent. One copy set per
  route; the M-* boards' shortened strings are not used.
- 2026-10-14 — destination data is two tenant files (numbers and states) plus tenant content
  (words), so the data stays the same in every language. A destination links its packages by
  slug, not by province, because one province holds several destinations.
- 2026-10-14 — Packages filtering and Compare run client-side on the public list (no API
  change); the compare selection lives in session storage, a convenience only.
- 2026-10-14 — Join's agency copy is Spanish first (`tenant/messages/es.json`), as the board
  addresses Cuban partners; English is drafted.
- 2026-10-14 — copy that describes system behaviour follows the system, not the board: the
  sign-in link note does not promise 15 minutes (Better Auth expires it after 300 s).
- 2026-10-14 — Phase 5 Dashboard: the matrix's timer column sits right after the booking (the
  board puts it last) so the time left stays in view where the table scrolls; Open sits under
  the timer. Re-dispatch shows on amber, red and unassigned items only.
- 2026-10-14 — copy that describes behaviour follows the system: the who-acts legend says the
  desk starts dispatch (no auto-dispatch yet), a decline or timeout makes ACTION_REQUIRED, and
  there is no 48 h payment window, audio cue or 72 h SLA yet.
- 2026-10-14 — charts are one-hue bar lists named by text: no token triplet passes the
  categorical palette check (dataviz validator), so colour carries no identity.
