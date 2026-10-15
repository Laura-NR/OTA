# Handoff — vereda — updated 2026-10-14 23:05

## Goal
Build the design team's handoff into the platform. The current handoff is `design/vereda-v1.2/`;
`design/vereda-v1.1/` is kept for the record. Plan and phases: `docs/design-v1.1-plan.md`.
Decisions: ADR 0006 (design system; amended for v1.2, change request 02 and Phases 3 & 5) and
ADR 0007 (worker app).

## State
- **Phases 0, 1, 0b, 2 and 3 are done** (committed locally on `vereda`; nothing is pushed).
- **Phase 4, M1 core (2026-10-15):** the owner approved D1–D4 and the migration was generated
  (`3a6f9ce`, `20261015000000_package_v2`): the M1 catalog model (tiers, departures, extras, days,
  media, per-locale translations, slug redirects, booking model, group/lead time, themes,
  policies, SEO) and `PackageStatus` replacing `active` (the existing package backfilled to
  PUBLISHED). `d93fe9c` adds package pricing v2 and the publish checks to `@ota/domain`;
  `3c64100` extends the package read model and draws tiers, departures, extras and the day texts
  on the storefront Package page; `86b76c4` adds the ops write path (`POST`/`PATCH` replace the
  tiers/departures/extras/days collections, `PUT /packages/:id/translations/:locale`, and a slug
  change leaves a redirect the public `getBySlug` follows). **Still to do:** the per-locale overlay
  applied when reading the public catalog, package media storage (upload + serve) and the
  storefront 308 from a retired slug.
- **Phase 5, no-migration part (admin)** — seven increments done:
  - `47ed5dd` **Dashboard** = A-Dashboard: month figures, aging buckets, alerts, the live dispatch
    matrix (`/ops` socket, Havana timers, re-dispatch drawer), desk tasks. `GET /dispatch/active`
    returns `DispatchBoardRowDto` rows.
  - `fca9a4c` **Bookings + Booking** = A-Bookings (saved views, state chips with counts,
    travel-date/province filters, urgency order, cards under 768 px, who-acts legend) and
    A-Booking (figures incl. supplier cost/margin, pipeline stepper, services with worker, timer,
    payout, dispatch controls, payments, duty of care, documents, audit log). List/detail DTOs
    gained `packageName`, `provinces`, `serviceItemsAccepted`, `paidAmount`.
  - `af0aff0` **Reports** = the analytics/regulatory/quality merge: one `/reports` page (period
    presets mtd/lastMonth/ytd/all, `?year=` still accepted; exports; anchors
    financial/regulatory/dispatch/quality/geography), `components/bar-list.tsx`,
    `/reports/regulatory` and `/reports/quality` deleted (redirect to `/reports#…`), nav tabs
    removed, `backoffice.reports` replaces `analytics`/`regulatory`/`quality` in en/es/fr. The
    dashboard revenue card uses `BarList` too.
  - `715d216` **Suppliers** = the A-Suppliers register list: header summary, the §4.5 expiry rule
    strip, category chips with counts, province and verification filters, and a table with each
    worker's credential state, reliability (`/quality/supplier-reliability`) and auto-dispatch
    state; the header links to `/suppliers/applications`. `suppliers-table.tsx` replaced by the
    server table; `backoffice.suppliers` rewritten in en/es/fr. The **detail** page is now the
    A-Suppliers inspector: the profile, the auto-dispatch state, the reliability score and the
    availability calendar; the credential document and availability are unchanged behind the new
    header.
  - `6a429e1` **Payments** = the A-Payments transaction ledger: a header with the paid total and
    the pending/refunded counts, status filter chips with counts, and a rail-labelled table that
    links each receipt to its booking, plus a note that the refund queue, payouts and rails health
    wait for M4. Read-only; confirming stays on the booking.
  - `435ecf3` **Customers** = A-Customers: a new ops-only read model (`GET /customers`,
    `GET /customers/:id`) plus `/customers` (trip count, last activity, retention state) and
    `/customers/[id]` (identity, trips, retention lifecycle). The Customers nav section links to
    both; the old `/customers` redirect is dropped; both routes are in the authorization matrix.
    OFAC, preferences, passport documents and communication wait for M2/M3.
  - `91a0dbb` **Packages editor v2** = A-Package-Edit: the edit form gains the M1 fields (slug,
    summary, booking model, group size, lead time) and inline editors for the tiers, departures,
    extras and day texts, saved in one PATCH through the M1 write path. Publishing runs the domain
    `packagePublishIssues` first and blocks with the reasons. Media and the locale overlays are not
    in the form yet.
- New pure rules in `@ota/domain`: `dispatch/aging.ts`, `analytics/booking-mix.ts`,
  `time/ops-calendar.ts` (Havana zone), `reservation/booking-views.ts`. All tested.

## Verified (2026-10-15, `91a0dbb`)
- lint, format:check, typecheck and build (18/18) are green.
- `pnpm test`: **419 passed / 5 skipped** (api 185/4 skipped — the live-DB integration tests are
  opt-in, domain 111 (+10 for M1 pricing and
  publish checks), ui 31, config 24,
  theming 14, schemas 14, reports 4, and the rest).
- `pnpm e2e`: **45/45** (the reports specs updated to the merged page; one new section-anchor
  test). The dev stack was already running, so e2e reused it.
- Browser (repo Playwright, cached chromium) on `/reports` at **390/1024/1280**: screenshots +
  computed styles; no horizontal overflow (scrollWidth == viewport). h1 Fraunces 24/32, section
  titles 22/28, overlines Inter 700 12/16 primary-600, body/surface Inter 14/20.
- Redirects confirmed: `/reports/regulatory` → `/reports#regulatory`, `/reports/quality` →
  `/reports#quality`, `/regulatory` and `/quality` likewise, `/analytics` → `/reports`; the
  section-nav anchors scroll to each section.
- Suppliers (`715d216`, detail `1790c68`): lint, format:check, typecheck, i18n parity test,
  `pnpm test` (29 tasks), build (18/18) and `pnpm e2e` **45/45** green. Browser on `/suppliers`
  and a supplier detail at 390/1024/1280: no overflow, h1 Fraunces 24/32, the list's expiry strip
  renders `warning-100`/`warning-700` with a `warning-500` border; the category chips and the
  province/verification filters update the URL and the row set.
- Payments (`6a429e1`): lint, format:check, typecheck, i18n parity test, `pnpm test` (29 tasks),
  build (18/18) and `pnpm e2e` **45/45** green. Browser on `/payments` at 390/1024/1280 with a
  receipt fixture: no overflow, the status chips and the rail-labelled ledger render.
- Customers (`435ecf3`): lint, format:check, typecheck, the authorization matrix (4 tests, the
  new `/customers` routes included), i18n parity test, `pnpm test` (29 tasks), build (18/18) and
  `pnpm e2e` **46/46** green (one new customers spec). Browser on `/customers` and a profile at
  390/1024/1280: no overflow; the account list, the trips and the retention card render.
- M1 (`3a6f9ce`, `d93fe9c`, `3c64100`): `prisma migrate status` reports the schema up to date;
  the dev package backfilled to PUBLISHED (`published_at` set). lint, format:check, typecheck,
  domain tests (111), the api packages/me tests, i18n parity, `pnpm test` (29 tasks), build
  (18/18) and `pnpm e2e` **46/46** green. Browser on the storefront
  `/en/packages/trinidad-heritage-trail` at 390/1024/1280: no overflow; Accommodation tiers
  (Standard included, Comfort +€120), Departures (13 Feb / 6 Mar, seats and price) and Optional
  extras render; the itinerary shows the seeded day texts.
- M1 write path (`86b76c4`): lint, format:check, typecheck, the api packages/me/authorization
  tests, `pnpm test` (29 tasks), build (18/18) and `pnpm e2e` **46/46** green. The live-Postgres
  integration test (`RUN_DB_INTEGRATION=1 … test/packages.integration.test.ts`) proves
  create-with-collections, a wholesale tier replace, the slug redirect and a translation upsert.
- Packages editor v2 (`91a0dbb`): lint, format:check, typecheck, i18n parity, `pnpm test`
  (29 tasks), build (18/18) and `pnpm e2e` **46/46** green (the packages-edit spec now asserts the
  M1 sections). Browser on the editor at 390/1024/1280: no overflow; the tiers, departures,
  extras and day-text editors render and a save through the form succeeds.

## Assumptions & unknowns
- **M1 (Q9) answered 2026-10-14:** approved as D1(a)–D4(a); the migration is the next Phase 4 job.
  No assumptions remain on the schema shape.
- "Merge the board" was read as: the pipeline board's status counts feed the Dashboard's Bookings
  figure, and its list became the A-Bookings table at `/bookings` (tab still "Pipeline").
- Not built (data or decision missing): payment windows, owner/My queue, OFAC, disruption, audio
  cue and mute, on-the-ground panel, search, CSV export, version locks, internal notes,
  travelers/itinerary on the booking, GBV-by-month chart, reinvestment ledger, NPS. A-Suppliers'
  **Power** and **Last job** columns await M6 (backup-power fields) and a job-history source; its
  **Add supplier** is the `/suppliers/applications` recruitment path, not a create form. The
  supplier inspector's backup-power, vehicle and payout fields await M6 and the payments module.
  A-Payments' refund queue, payout liabilities by province, next payout runs and rails health
  await M4 and a payouts source (the page says so). A-Customers' OFAC certification, preferences,
  passport documents and communication history await M2/M3 (the profile says so).
- ES/FR for `backoffice.dashboard`, `.bookings`, `.reservation`, `.reports` are agent-drafted.
- Earlier open items still stand (Cubacel 24/7 line, change notice, offer-SMS cost; placeholder
  tenant content).

## Traps
- **Hydration and ICU:** Node and Chromium format dates with different spaces (`formatRange`
  thin/narrow spaces), which broke hydration on the dashboard. Date helpers in
  `apps/backoffice/src/lib/ops-format.ts` normalise spaces; a ticking client clock starts from the
  server's `serverNow` prop, not `Date.now()`.
- **Run-1 e2e 500s:** if every Next page answers "Internal Server Error", stop all dev processes
  (`next-server` processes do not match `pkill -f 'next dev'`), delete `apps/*/.next`, start again.
  `pkill -f <pattern>` also kills your own shell when the pattern is in its command line (exit 144).
  Deleting `.next` under a running dev server makes it hang.
- Playwright leaves the dev servers it started on 3000–3002; kill them after `pnpm e2e`.
- **Charts:** one-hue `BarList`s named by labels — no token triplet passes the categorical palette
  check.
- **Strict-mode locators in the merged reports:** overlines and section descriptions share words
  ("Gross booking value", "Specialised ratio"), so those `getByText` need `{ exact: true }`.
  "Bookings" also matches "All bookings" (use `level: 1`); "Alerts right now" matches "No alerts
  right now." (use `exact: true`).
- `reservationServiceItemSchema` is shared with the traveler `/me` DTO: put ops-only fields on
  `reservationDeskItemSchema`, never on the shared one.
- Stale `.next/types` after deleting a route fails typecheck: `rm -rf apps/backoffice/.next`.
- Earlier traps still apply (tenant tokens on `<html>`, `cn()` sizes, `getPageContent` 404,
  `TENANT_CONFIG` overrides, rebuild a changed package, design notes are input).
- **AGENTS.md §C lines proposed (owner edit),** in addition to earlier ones:
  - "The admin Dashboard (A-Dashboard) merges escalation and dispatch: `GET /dispatch/active`
    returns `DispatchBoardRowDto` rows (ops-only; `waitingSince` is the first offer in the
    ledger). Ops clocks are Havana time (`OPS_TIME_ZONE`, `@ota/domain` `time/ops-calendar`)."
  - "Reports is one page (`/reports`, anchors per §4.9 section); `/reports/regulatory` and
    `/reports/quality` redirect there."
  - "The suppliers register (`/suppliers`) is the A-Suppliers list: category chips, province and
    verification filters, and credential/reliability/auto-dispatch columns. Reliability is the
    acceptance rate from `GET /quality/supplier-reliability`; auto-dispatch is the domain
    `canAutoDispatch`. Recruitment is `/suppliers/applications`."
  - "A-Customers is the ops-only read model `GET /customers` + `GET /customers/:id`
    (`customerSchema` / `customerDetailSchema`); the back-office `/customers` list and
    `/customers/[id]` profile join it to the GDPR retention state in
    `@ota/domain` `retention/retention`."
  - "M1 Package v2: `Package.status` (`PackageStatus`) replaces `active`; only PUBLISHED shows on
    `GET /catalog/packages`, and the read model carries `days`/`tiers`/`departures`/`extras`/`media`.
    Package pricing is `calculatePackagePrice` and the publish gate `packagePublishIssues` in
    `@ota/domain` `packages/`. Tenant-wide terms stay in the manifest; a package stores policy keys."

## Next
1. Finish M1: the per-locale overlay applied when reading the public catalog, package media storage
   (upload + serve) and the storefront 308 from a retired slug. Then M2–M5 (travelers, compliance,
   deposit schedule, proposal).
2. Phase 5: add the locale overlays and media to the package editor, then Content/Disruption/
   Settings as their migrations land (M6–M9 asked for as they come up).

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
- 2026-10-14 — Reports is one page (`/reports`, the §4.9 sections as anchors); `/analytics`,
  `/regulatory`, `/quality`, `/reports/regulatory` and `/reports/quality` redirect there (307).
- 2026-10-14 — M1 (Package v2) approved as D1(a)–D4(a): base text + one `PackageTranslation` overlay
  per locale; base price + tier delta + optional departure price; `status` replaces `active`
  (backfilled); agency-wide terms in the manifest with policy keys on the package. Migration not yet
  generated.
- 2026-10-14 — A-Suppliers is the register list; the detail page is the credential inspector.
  "Add supplier" is the `/suppliers/applications` recruitment path, not a create form. Reliability
  is the acceptance rate over the offer ledger; the board's Power and Last job columns wait for M6
  and a job-history source.
- 2026-10-14 — A-Payments stays read-only on today's data: the transaction ledger with status chips
  and rail labels. The refund queue, payout liabilities by province, next payout runs and rails
  health wait for M4 and a payouts source.
- 2026-10-14 — A-Customers adds an ops-only read model (`GET /customers`, `GET /customers/:id`);
  the list and profile show trips and the GDPR retention state. Passport, preferences, OFAC and the
  communication history wait for M2/M3. The old `/customers` → `/customers/retention` redirect is
  removed (the section home is `/customers`).
- 2026-10-15 — M1 generated and applied (`20261015000000_package_v2`): `Package.active` replaced by
  `status` (existing rows backfilled to PUBLISHED, `published_at` stamped) and the M1 catalog
  tables added. The package read model, the domain pricing/publish checks and the storefront
  tiers/departures/extras/day texts landed. The ops editor endpoints, the per-locale overlay,
  package media storage and slug redirects follow.
- 2026-10-15 — M1 write path: `POST`/`PATCH /packages` replace the tiers/departures/extras/days
  collections wholesale (same pattern as services); a slug change leaves a `PackageSlugRedirect`
  that the public `getBySlug` follows; `PUT /packages/:id/translations/:locale` upserts one locale.
  The editor UI, the public per-locale overlay, package media and the storefront 308 remain.
- 2026-10-15 — A-Package-Edit edits the M1 details and the tiers/departures/extras/day texts as
  inline lists saved in one PATCH; publishing runs the domain `packagePublishIssues` first. Media
  and the locale overlays are not in the form yet (they follow with media storage and the overlay
  read).
