# Decision log

The owner's and the build's decisions from the design rollout, the operations modules (M1–M10),
the deployment build and the worker app, 2026-10-12 to 2026-11-20, oldest first. Append new
decisions at the end; never rewrite one: a later entry supersedes it.

The larger decisions also live in the ADRs (`docs/adr/`, mainly the ADR 0006 and ADR 0007
amendments) and in each feature's `docs/schema-*.md` §7 or as-built section. This log was the
`vereda` branch's handoff Decisions section, moved here when the branch was merged into `main`.

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
- 2026-10-15 — M1 closed: the public catalog overlays a `?locale=` published translation (nested
  days/tiers/extras/media by stable keys) and strips raw rows; the storefront 308s a retired slug
  to the current one; package media lives behind `packages/storage` at `packages/<id>/<uuid>.<ext>`
  with upload/serve/delete. The editor's media and locale tabs remain.
- 2026-10-15 — M2 (party and travelers) drafted in `docs/schema-m2-travelers.md` for review per Q9;
  no migration generated.
- 2026-10-15 — M2 approved as D1(a)–D4(a) and generated (`20261015010000_travelers`): app-level
  AES-256-GCM passport encryption, traveler/room/price-line tables, `ReservationRoom` rooming list,
  and `ServiceItem.travelerPrice` alongside the price lines. The surfaces follow.
- 2026-10-16 — M2 surfaces: price lines are frozen per line (each rounded; total = sum), so an
  invoice adds up; this can differ by a cent from M1's `calculatePackagePrice`, which rounds per
  group. Fees and child bands come from the manifest (M1 D4).
- 2026-10-16 — the passport cipher lives in `@ota/domain` as a separate `exports` entry rather than
  the index, because client bundles import `@ota/domain` and must not pull `node:crypto`.
- 2026-10-16 — no list shows any part of a passport number (the board's "ending 4471" is not
  drawn); the vault route returns it for one traveler, ops+super only, audited before it leaves.
- 2026-10-16 — repricing applies to package bookings only; a custom trip keeps the desk's total and
  refuses extras until custom pricing (M5 proposal). From PENDING_PAYMENT the price is locked; a
  booking priced before M2 keeps its total.
- 2026-10-16 — the custom builder's total is now the sum of its per-service prices (repeats
  counted), so the invoice's amounts add up; before, a repeated item was counted once.
- 2026-10-16 — `DELETE /reservations/:id/extras/:extraId` was added beside the requested POST so
  the panel can undo an extra.
- 2026-10-16 — Turbo dev passes `PASSPORT_ENCRYPTION_KEY` and `RATE_LIMIT_*` through; the
  e2e webServer's raised limits had silently never applied.
- 2026-10-16 — M3 drafted (`docs/schema-m3-compliance.md`); no migration until approved.
- 2026-10-17 — the owner approved M3 D1–D6 as recommended. The trigger also allows the
  recording user's link to turn null (a fourth ON DELETE SET NULL the draft missed).
- 2026-10-17 — legal texts are tenant content (`content.legal`, English source with fallback);
  the API stamps their version and SHA-256 and refuses a stale version, so a record proves which
  words were shown.
- 2026-10-17 — the voucher hold issues the invoice alone and audits `documents.held`, rather than
  failing generation, so the fiscal document is never blocked by OFAC.
- 2026-10-17 — the public cookie-banner consent route is deferred to the banner (Phase 8): no
  unused public write endpoint ships.
- 2026-10-17 — the online certification lives on the account trip page until the Booking form
  exists; the booking's owner may sign for each US traveler with that traveler's own name
  (counsel question recorded).
- 2026-10-17 — the brief pasted at the start of the session was an earlier next-session prompt whose
  tasks were all done; the owner chose to run the current prompt instead (Booking form, server
  publish checks, M4 draft).
- 2026-10-17 — guest provisioning: the owner chose **sign in first** (the magic link before the
  form) over creating an account at submit or confirming the email at submit. No public route
  creates users or bookings.
- 2026-10-17 — the publish checks run on any save that leaves a package PUBLISHED, not only on the
  move to PUBLISHED, mirroring the editor, so a published package cannot be edited into failing
  them; unpublishing is never blocked.
- 2026-10-17 — the Booking form sends choices only. The server derives each kind from the date of
  birth (an infant takes no bed, so a client-chosen kind could dodge a supplement) and builds the
  rooms from SHARE/PRIVATE; a private room is charged the tier's supplement per room of one.
- 2026-10-17 — the booking, party, lines, certifications and consents are written in one
  transaction after every check has passed, so a refused booking leaves nothing behind; the
  client sends the total it showed and a moved price is refused (409 `PriceChanged`).
- 2026-10-17 — the Booking form's design resolutions are recorded in the ADR 0006 Phase 4
  amendment (no new token).
- 2026-10-17 — M4 drafted with recommendations D1(a)–D8(a); the card fee defaults to 0 pending
  counsel (PSD2), and the first payment window's expiry goes to the desk rather than auto-cancelling
  while bank transfer is the only live rail.
- 2026-10-17 — the owner approved M4 D1–D8 as recommended and will take the counsel questions
  later; the sample terms ship as manifest placeholders and the card fee is 0 %.
- 2026-10-17 — a refund's receipt link is ON DELETE NO ACTION (the draft said RESTRICT), so a
  booking's cascade removes both rows in one statement.
- 2026-10-17 — the cancellation scale keeps its share of what was paid (A-Payments' worked
  examples); a traveler-cancellation quote applies it to everything paid on the booking, less
  refunds already made, drawn from the chosen receipt as far as it goes.
- 2026-10-17 — expired windows and overdue balances are derived on read (`paymentAlert` over
  each booking's next instalment) instead of a scheduled scan; the scan lands with the Phase 6
  reminders that need it.
- 2026-10-17 — the proof upload is on the trip page behind sign-in, not on the public wire page
  (a capability URL); the wire page points to it.
- 2026-10-17 — no PAYMENT_TERMS consent on payment yet: its words (the deposit's refundability)
  are a counsel question.
- 2026-10-17 — the JSON body limit fix (`099e0c0`) is route-scoped (upload routes at 15 MB)
  rather than global, so ordinary routes keep the 100 KB limit.
- 2026-10-17 — Phase 6 emails are branded with the tenant manifest and written in the traveler's
  locale (en/es/fr); the E-Received email is sent best-effort after the booking transaction and
  never rolls a stored request back.
- 2026-10-17 — the E-OFAC reminder is sent per booking from A-Customers, only for a trip with
  missing US certifications, and audited as `ofac.reminder_sent`; no OFAC record changes.
- 2026-10-17 — balance reminders are 7, 3 and 1 UTC calendar days before a DUE instalment. The
  audit log (`payment.reminder_sent` with `metadata.days`) is the idempotency ledger, so no
  migration was needed; the repeatable scan runs daily at 07:00 and `POST /payments/reminders/scan`
  forces a pass. A missed day is skipped, not caught up.
- 2026-10-17 — M5 is a draft only: a separate `CustomRequest`, versioned `Proposal` and
  `ProposalPriceLine`, a sign-in-only proposal and acceptance that creates an
  `ITINERARY_SUBMITTED` request to book. The owner's answers in `docs/schema-m5-proposal.md` decide
  the migration.
- 2026-10-17 — Task 3 (the Confirmation screen) was not built this session; it stays first in
  `Next`.
- 2026-10-17 — M5 approved and implemented as recommended: acceptance creates an
  `ITINERARY_SUBMITTED` request to book; the proposal page is sign-in only; the planning fee is
  transparency copy and is not added to the amount due; validity is 21 days with expiry derived on
  read; price lines are normalised and the route/days/options narrative is a validated JSON
  document; retention keeps totals/dates and redacts names, free text and the PDF. Migration
  `20261017181739_custom_proposals` applied.
- 2026-10-17 — M5 service items are created from the request's chosen catalog items; custom price
  lines are price-only until the desk maps them to services. The full designed builder and
  structured stops/days/options editing are follow-ups; the D-Proposal PDF waits for Phase 6.
- 2026-10-17 — the Confirmation screen is a standalone page like the board (not inside the Account
  frame), reached only after money was received; the booking-ease CSAT is not drawn (it needs a
  field), and the trip Review shows only on COMPLETED trips (ADR 0006 Confirmation amendment).
- 2026-10-17 — the trip detail gained `trip` (localized package/tier names) and `travelers`
  (names only) additively, rather than a second endpoint.
- 2026-10-18 — the proposal PDF is attached to the proposal email (the account's own address);
  the proposal page stays sign-in only, and a render failure never blocks sending a version.
- 2026-10-18 — the renderer relaunches a lost Chromium (a real bug: one dead browser failed every
  later document until restart); reproduced, captured in `pdf.test.ts`, disproved live.
- 2026-10-18 — the 7/3/1 reminders cover balances only; deposits and full payments are windows
  and get the 24 h/2 h reminders, recorded per deadline so an extension is reminded again.
- 2026-10-18 — E-NPS is adapted to the Review model (1–5) because a 0–10 score needs a field;
  E-Reconfirm is reduced to what the platform holds; E-Advisory and E-Options wait for M7/M8.
- 2026-10-18 — Task 2(c), the full designed Custom builder, was not started: the brief asks to
  ask the owner first.
- 2026-10-18 — the owner took every recommendation: (1a) hide work orders from travelers and
  refuse their download; (2a) build the designed builder with no migration; (3a) provider
  tracking from the dispatch ledger; (4) draft M7 first.
- 2026-10-18 — the builder's styles and sample rates live in the manifest (`customBuilder`,
  placeholder), not in code; option words live in the core catalogs so a fork overrides them in
  `tenant/messages`. Province names for the desk come from a domain list of the 16 ISO codes.
- 2026-10-18 — the builder asks no name, email or phone (it is behind sign-in) and records no
  90-day consent (no purpose fits); the request stays sign-in only.
- 2026-10-18 — M7 is drafted as advisories only (D1a recommended); blog, FAQ, media and
  conditions stay tenant content until a CMS decision.
- 2026-10-18 — the owner approved M7 D1a–D8a as recommended (advisories only; superseding
  versions; province-code regions; approval table with two distinct approvers for critical;
  audit-log delivery ledger; per-locale translations; caution/critical emails within 60 days;
  critical acknowledgements). Migration to be generated next session.
- 2026-10-18 — the owner approved limiting document downloads to the booking's owner and the
  operations roles (closes the SERVICE_WORKER gap); not implemented this session.

- 2026-10-18 — M7 generated and built as approved; the build added `request-changes`, a public
  history and an acknowledgements read, a row lock on approvals, and the window-overlap rule for
  E-Advisory (`docs/schema-m7-advisories.md` §7; ADR 0006 M7 amendment).
- 2026-10-18 — a critical advisory's first approval may come before every translation; only the
  publishing approval checks them (D6 says a missing translation blocks *publishing*).
- 2026-10-18 — info/caution dismissal is a first-party cookie rather than localStorage, so the
  server leaves dismissed banners out and nothing flashes back; it holds advisory ids only.
- 2026-10-18 — the SIGTERM fix is the narrow one (Playwright's handlers off); Nest
  `enableShutdownHooks` was not added, because a hanging `onModuleDestroy` (BullMQ close) would
  bring the same symptom back. Graceful shutdown for deploys is a separate decision.
- 2026-10-18 — document downloads limited to the owner and the ops roles, as approved.
- 2026-10-18 — M8 drafted with recommendations D1(a)–D9(a): manifest playbooks, a case with
  attached bookings, desk-set severity, one option set per case with a deadline whose default is
  derived on read, choice behind sign-in, the desk executes choices with existing tools, a
  per-booking status board, an advisory link, the audit log as case log, compensation via M4.
- 2026-10-18 — the owner approved M8 D1a–D9a as recommended (manifest playbooks; cases with
  attached bookings; desk-set severity; one option set per case with a deadline and a default
  derived on read; choice behind sign-in; the desk executes choices; a per-booking status board;
  the advisory link; the audit log as case log; compensation via M4). Migration next session.
- 2026-10-18 — M8 generated and built as approved (`docs/schema-m8-disruptions.md` §7; ADR 0006
  M8 amendment). The build decided: the traveler answers once (changes go through the desk); the
  desk records phone answers at any time and confirms the default only after the deadline; the
  option set is fixed once sent; a re-send to an unanswered booking is a new offer; a case is not
  reopened; the case drafts its banner through `POST /disruptions/:id/advisory` (MINOR→INFO,
  MAJOR→CAUTION, EMERGENCY→CRITICAL, three days); writes are Operations/Super Admin only.
- 2026-10-18 — Graceful shutdown (Task 2) raised with the owner as a question with options; not
  built.
- 2026-10-18 — the owner chose to build graceful shutdown with a timeout (close BullMQ, Redis and
  the PDF browser; force-exit after about 10 s so a hung close cannot recreate the SIGTERM hang),
  over waiting for the deploy topology or keeping the immediate exit. Next session.
- 2026-10-19 — graceful shutdown built with Nest's hooks and a forced exit armed on the first
  signal, as decided. The PDF browser and Prisma close after the HTTP drain
  (`onApplicationShutdown`) so in-flight renders finish. The dispatch scheduler, never closed
  before, is closed on destroy.
- 2026-10-19 — M6 drafted with recommendations D1(a)–D9(a): one `supplier_resources` row per
  supplier with a single confirmation stamp; staleness, the last job and the console's resources
  derived on read; desk-only writes (ops+super); vehicle/guide details and the storefront filter
  deferred. No migration until approved.
- 2026-10-20 — the owner approved M6 D1a–D9a as recommended (one `supplier_resources` row with
  a confirmation stamp; 7-day staleness, last job and the console's resources derived on read;
  desk-only writes; vehicle/guide details and the storefront filter deferred; audit log as
  history; no retention change). Migration next session.
- 2026-10-20 — the owner approved redacting cookies, authorization and set-cookie from the API
  log (`nestjs-pino` `redact`). Next session.
- 2026-10-20 — support staff stay read-only: supplier resources (M6 D4) and the M8 status board
  are written by Operations Admin and Super Admin only.
- 2026-10-20 — M6 built as approved (§7 of `docs/schema-m6-suppliers.md`). The build decided: a
  driver without litres is None and fuel 0 is not backup; the backup filter keeps stale rows,
  greyed; a casa must state its generator and a casa without one gives no generator details;
  WORKER_APP is refused on the desk route; every confirmation replaces and restamps the row;
  "involved" counts OFFERED/ACCEPTED/FULFILLED items; the console lists verified, unexpired
  suppliers with power or fuel, fresh first, plus the manifest's emergency contacts.
- 2026-10-20 — the register and inspector DTOs extend `SupplierDto` (`SupplierRowDto`,
  `SupplierDetailDto`) rather than changing it, so the verification, credential and expiring
  routes keep their shape.
- 2026-10-20 — "Backup power only" follows the board's checkbox (not a chip); the board's
  "Expiring ≤ 30 d" checkbox is not built.
- 2026-10-20 — log redaction built as approved: the three headers, with a test that logs a real
  request through the API's options.
- 2026-10-23 — the owner asked for both M6 follow-ups and the M9 draft. D7(b): the vehicle lives
  in the existing `vehicle_details` JSON and its insurance date is informational (no dispatch
  effect). D6(b): the public claim rests only on a casa confirmation under 7 days old, a package
  qualifies only when every stay does, and the wording avoids "guaranteed".
- 2026-10-23 — the register's reliability footnote was reworded to what the system does (copy
  follows the system, 2026-10-14); enforcing an 85 % floor is left to the owner (M9 D2).
- 2026-10-23 — M9 drafted with recommendations D1(a)–D9(a); no migration until approved.
- 2026-10-23 — the owner approved M9 D1a–D9a as recommended. The reliability floor (D2 note)
  stays open: the owner asked what "dispatch never checks reliability" means.
- 2026-10-23 — the owner chose to enforce both: dispatch skips suppliers below 85 % acceptance
  (after 5 answered offers; assumed, as proposed) and suppliers who blocked any day of the
  service. The desk keeps a manual offer for below-floor suppliers (the board's rule); blocked
  days are never overridden. Scorecards count answered offers only.
- 2026-10-23 — M9 built as approved (§7). The build decided: defaults = code constants + the
  manifest's payment terms, merged by the API; promotion to Super Admin rides on the invite table
  (no pending-promotion store); the token is generated when an invite is sent and stored hashed;
  acceptance needs a fresh account or a staff member; nobody changes their own role or
  deactivates themselves; the session limit and link validity are env config; copy that states a
  threshold takes the value in force.
- 2026-10-24 — the owner chose the M10 (Concierge/Events) draft plus the Phase 8 DS 07 widths,
  then approved M10 D1a–D10a as recommended (`docs/schema-m10-events.md`): events in the
  database with a desk editor; the three paths with a derived M5 request; confirmed seats as
  price lines plus a TICKETS instalment once the price is locked (the invoice question goes to
  finance/counsel); sign-in first; the 48 h answer as an M9 threshold; no dispatch for tickets.
- 2026-10-24 — the owner chose Phase 8 item 2 next (PWA, low bandwidth, larger text), with the
  display preferences per device in a cookie rather than per account (no migration), and the
  axe audit not yet. Built: the rem type scale, the cookie modes, a network-first service worker
  with an opt-in offline kit deleted at sign-out, the offline page and pill (ADR 0006 amendment).
- 2026-10-25 — the owner chose the accessibility batch (reduce motion and high contrast plus the
  axe audit) and the `@axe-core/playwright` 4.13.0 pin (the newest release older than two weeks;
  the handoff had proposed 4.11.x). The build resolved high contrast from existing tokens (alias
  text and border steps darker, also under `prefers-contrast: more`) and worded Reduce motion's
  help "No animations or transitions" (nothing cross-fades at 0 ms); ADR 0006 amendment.
- 2026-10-25 — the owner chose Phase 8 item 1 (T-Events) next, against a mock sink behind a public
  API route that only logs, on the storefront funnel first. The build resolved: the taxonomy is
  enforced by the sink (unknown events/parameters refused), the funnel stage is derived
  server-side, the user id is an HMAC keyed by `AUTH_SECRET`, `consent_set` is essential, no
  marketing switch for a tenant without marketing words, and the banner is a non-modal region
  (ADR 0006 amendment).
- 2026-10-25 — the owner chose the T-Events follow-ups next, and for the desk chose operational
  events only (essential, `role` from the session, no session/user id, no device storage, no
  banner) over a desk cookie banner or legitimate-interest analytics. The build resolved: each
  event names its surface; the role is never taken from the client and only from a live staff
  session; board parameters the desk or storefront cannot know are left out (seats left, the
  draft locale, one-click re-dispatch, approval amounts); `payment_succeeded` and
  `gallery_opened` are not built (no gateway result, no gallery viewer); an event before the
  page is left is sent at once (ADR 0006 amendment).
- 2026-10-25 — the owner chose the server-side T-Events next (over the real sink, an M9/M10
  migration doc or the manual accessibility pass), and recorded Plausible CE as the preferred
  sink and the staff passkey policy as the preferred M9 item for later. The build resolved:
  `booking_state_changed` moves to the API for every transition and the desk stops sending it
  (one count per move); `actor` adds `worker`; `reason` is a trigger code; the board's hashed
  `worker_id` and `decline_reason` are left out (no worker id was promised to the owner, and the
  reason is free text); events are fire-and-forget after the write; e2e reads a mock-sink file
  rather than a new read route (ADR 0006 amendment "server-side T-Events").
- 2026-10-26 — the owner chose the staff passkey policy next (over the Plausible sink, M10's
  migration doc and the manual accessibility pass), and approved `docs/schema-m9-passkeys.md` as
  recommended: P1a (a two-Super-Admin switch in the thresholds, off by default), P2a (a
  migration: `session.signInMethod`, so the rule fails closed, over hooks that block link
  sign-in or a marker in Better Auth's verification table), P3a (a setup-only session, no grace
  period), P4a (passkey changes need a passkey session except the first; audited and emailed),
  P5a (a Super Admin reset; `STAFF_PASSKEYS_OVERRIDE=off` break-glass; recovery codes stay
  deferred), P6a (`PASSKEY_RP_ID`, the agency name, pinned origins, user verification
  required), and `@better-auth/passkey` as a back-office dependency. The build added the
  gateways' missing session checks, put "Your passkeys" on `/passkeys` (every staff role, not
  the Super-Admin-only Security tab), and resolved the screens with existing components (ADR
  0006 amendment of 2026-10-26).

- 2026-10-27 — the owner chose the real analytics sink next: a Plausible CE `TelemetrySink`
  adapter with plain `fetch`, tested against a fake, no new dependency and no new image; live
  hosting stays open (Q10). The build resolved: one `POST /api/event` per event to
  `TELEMETRY_PLAUSIBLE_ENDPOINT` with the site domain; `page_view` mapped to Plausible's
  `pageview`; synthetic event paths; context and params
  as custom props, lists comma-joined; no session id or HMAC user id (Plausible counts visitors
  itself); the visitor's IP forwarded as `X-Forwarded-For`; a failed or bot-dropped event logged
  and swallowed; the mock remains the default and the e2e's file sink; a bad setting falls back
  to the mock.

- 2026-10-28 — the owner chose the live Plausible hosting decision next (over an M9 deferred
  item, M10's room holds/photos and the manual accessibility pass). The session wrote
  `docs/plausible-hosting-plan.md` first, as the brief asks, and asks before any spend or
  topology choice. It recommends H1a (its own EU VPS), H4a (only analytics-consented events),
  H5 (forward the User-Agent), H6a (strip identifiers, no TTL) and H7 (a new placeholder
  words version).
- 2026-10-28 — the owner approved the hosting plan as recommended: H1a (CE on its own EU VPS,
  which the owner buys; no image in the repo), H4a (only events whose consent is not
  `essential` reach Plausible, over sending everything or every storefront event), H5
  (forward the User-Agent), H6a (strip `booking_code`/`request_id`/`from_path` and keep the
  data with no retention limit, over a ClickHouse TTL) and H7 (a new placeholder words
  version now, over waiting for counsel). The build routes in a sink wrapper rather than in
  the adapter, so `PlausibleTelemetrySink` stays a plain transport and the mock keeps its file.
- 2026-10-29 — the owner chose the manual keyboard/screen-reader pass on the desk next (over
  the deployment build, unanswered, another M9 item and M10's deferred items); Plausible CE
  is not installed. The build fixed what the pass found and resolved the board's gaps
  (an off switch for single-key shortcuts, the sticky column at every width, state filters
  kept as links, announcements from crossings only); it deferred the audio cue, `A` and the
  mute (acknowledgement semantics are the owner's call) and `/` (no desk search).
- 2026-10-29 — the owner chose the same manual pass on the storefront's DS 02–05 rules next
  (over the desk acknowledgement, another M9 item, M10's deferred items and the unanswered
  deployment build); Plausible CE is still not installed. The owner also decided what
  acknowledging a desk alert means, for when that batch is built: **per desk, audited** (one
  operator's acknowledgement silences it for everyone; acknowledgements and mutes go to the
  audit log; no migration). The build met DS 02's "on touch screens" with a
  `(pointer: coarse)` variant rather than a breakpoint (a tablet with a mouse keeps 40 px), kept
  stand-alone text links at their line height where WCAG 2.5.8 passes (tall rows only for
  footer/header/strip lists), kept the language links in the phone header (currency is M9 D7),
  and deferred the design changes (stacked table cards, room for the cookie banner, the
  custom date picker).
- 2026-10-29 — the owner chose the desk's alert acknowledgement with the audio cue and
  "Mute 15 min" next (over the storefront's deferred design changes, another M9 item and
  M10's deferred items; the deployment plan is unanswered and Plausible CE is not
  installed). The build kept the state in the audit log (no migration), acknowledged red
  alerts only (amber has no repeat), keyed an alert by item and offer, made the undo local
  with the record written after the toast, offered no per-device sound switch (only the
  logged mute or an acknowledgement silences the cue), left support read-only, and sounded
  the cue on the dashboard only.
- 2026-10-29 — the owner asked that `docs/next-session-prompt.md` hold only what starts a
  session (orient, tasks, standing rules, environment) and never repeat handoff content. The
  prompt went from about 300 lines to 54; the traps and open questions that lived only in it
  moved to this handoff (Traps, Next items 3–4, the live-test list under Verified).
- 2026-10-29 — the owner chose the storefront pass's deferred design changes next (over an
  M9 item, M10's deferred items and the deployment build; the deployment plan is
  unanswered and Plausible CE is not installed), without the custom date-range picker (the
  native fields stay). The build stacked tables below sm per DS-Responsive with one
  data-driven `ResponsiveTable` (pages are server components, so no context), divided the
  cards by the row rule rather than boxing them, kept the board's full banner from md, and
  on a phone put the purposes behind a disclosure instead of shrinking the copy.
- 2026-10-31 — the owner chose the desk idle lock next (over the new-device email, runtime
  flags and the cue on other desk pages; the deployment plan is unanswered and Plausible CE
  is not installed) and approved `docs/schema-m9-idle-lock.md` as recommended: L1(b) every
  staff session locks unless marked "own device" at sign-in, L2a a `session.lastActiveAt`
  column (one migration with `session.ownDevice`), L3a only real input counts, reported at
  most once a minute, L4a unlocking is a passkey sign-in in place, L5a a locked session is
  refused everywhere including Better Auth's routes and the sockets, L6a a two-Super-Admin
  threshold (default 30, 5–240, no off), L7a the A-States lock dialog keeping the page. The
  build accepted the own-device mark only within ten minutes of sign-in, left out the
  passkey rule from Better Auth's gate (setup needs those routes), had the 401 carry the
  limit so a page rendered locked can name it, showed both unlock paths when the page could
  not tell whether the person has a passkey, and put the lock's axe check in its own spec.
- 2026-10-31 — the owner chose runtime feature flags next (M9 D8b; over the new-device email,
  the cue on other desk pages and recovery codes; the deployment plan is unanswered and
  Plausible CE is not installed) and decided as recommended: two Super Admins per change
  (over a one-person kill switch), the API refuses what an off flag covers (over pages only),
  and `interactiveSvgMap` gates the map (over listing it as unused). The build put the flags
  in the thresholds document (no migration), gated the builder's older
  `POST /me/reservations` too, refused after body validation and a traveler's ownership
  check, kept a transfer already started payable by proof, and closed `/custom` before
  asking anyone to sign in.
- 2026-10-31 — the owner chose the desk's alerts on every page next, with the flag-off
  notices on Applications and Custom proposals (over recovery codes, the new-device email
  and the IP allowlist; the deployment plan is unanswered and Plausible CE is not
  installed). The build moved the alert state into the dashboard layout rather than
  duplicating it per page (one socket, one cue, and the cue's memory survives navigation),
  reused A-Dashboard's strip with a per-booking Acknowledge where no matrix row exists,
  kept the undo open across page changes, announced "Press R" only on the dashboard, and
  showed the notices to every staff role with a link to the thresholds tab.
- 2026-11-01 — the owner chose staff recovery codes next (over the new-device email,
  permission overrides and small fixes alone; the deployment plan is unanswered and
  Plausible CE is not installed), with `A` on a booking's services and the `/join` empty
  state alongside. The design turned out to describe a Super-Admin-issued one-time code,
  not self-service backup codes (the question's wording had said "without help"); the owner
  approved `docs/schema-m9-recovery-codes.md` as recommended after that was pointed out:
  R1a (the board's issued code), R2a (a `staff_recovery_codes` table over Better Auth's
  verification table), R3a (setup-only, and issuing removes the person's passkeys), R4a
  (12 Crockford characters, five wrong tries), R5a (any one Super Admin, never oneself).
  The build enforced the 15-minute session on the sign-in time rather than `expiresAt`,
  refused issuing for a deactivated account, put the issue action on the user's row with
  Security linking to it, and had `A` on a booking page acknowledge only that service.
- 2026-11-01 — the owner chose the new-device email next (over permission overrides, M10's
  room holds and event photos, and the IP allowlist; the deployment plan is unanswered and
  Plausible CE is not installed) and approved `docs/schema-m9-new-device-email.md` as
  recommended: N1a a device cookie, N2a a `staff_known_devices` table (forgotten after 180
  days), N3a every unknown device emails, the first included, N4a staff only, N5a a
  two-Super-Admin threshold on by default, N6a resets, recovery codes and deactivation forget
  devices. The build hashed the person's id with the cookie so a shared desk PC stays known to
  each person, kept the label language-neutral, wrote the email in UTC (no tenant time zone)
  as its own template, and put the switch on Thresholds rather than as a checkbox on Security.
- 2026-11-01 — the owner chose permission overrides next (over M10's room holds and event
  photos, display currencies and the IP allowlist; the deployment plan is unanswered and
  Plausible CE is not installed) and approved `docs/schema-m9-permission-overrides.md` as
  recommended: O1a one matrix row for one person for a limited time, O2a only rows the role
  views and never a Super Admin row (so only Support asks), O3a an override never approves,
  O4a any one Super Admin approves, O5a a two-Super-Admin threshold (default 24 h, 1–24) and
  early ends on a role change, deactivation and the resets, O6a a `permission_overrides`
  table, O7a routes tagged with their row and every change audited, O8a an email to every
  Super Admin. The build also kept refund rejects and advisory change requests with the role
  (they are votes), required the route to admit an Operations Admin, put the request on each
  view-only page instead of a blocked page and the lists on Permissions, and gave the booking
  page's cards their own rows.
- 2026-11-01 — the owner chose display currencies next (over the IP allowlist, M10's room holds
  and event photos; the deployment plan is unanswered and Plausible CE is not installed), with
  the small fix hiding Support's refused customer actions, and approved
  `docs/schema-m9-display-currencies.md` as recommended: C1a browsing converts, payable stays
  EUR with "≈", C2a USD/CAD/GBP on and CHF off with a browser-region default else EUR, C3a a
  mock provider with the ECB reader built but off, C4a a cookie plus a saved choice, C5a a
  daily `exchange_rates` table, 0.6 % spread, EUR only past 5 days, C6a the lock at the first
  payment as a threshold (DEPOSIT or INVOICE), C7a storefront, desk and invoice (emails
  deferred). The build let the traveler's payment link save the shown currency when none is
  saved, locked only on the first PAID receipt, worded the invoice line "at the rate locked
  on" (not "ECB rate"), kept payable line items and the price filter in EUR, put the controls
  on Thresholds, and seeded e2e with an EUR cookie.
- 2026-11-02 — the owner chose the IP allowlist next (over the display-currency email lines,
  M10's room holds and event photos, and answering the deployment plan; the plan is unanswered
  and Plausible CE is not installed) and approved `docs/schema-m9-ip-allowlist.md` as
  recommended: I1a judge the sign-in address, not each request's; I2a take it from Express's
  `req.ip` under `TRUST_PROXY` through a header the API writes; I3a refuse the session
  everywhere like the passkey rule; I4a refuse an apply that leaves out the applier, show
  "your sign-in address", break-glass by env; I5a two keys in the settings document (no
  migration); I6a Super Admins only; I7a off by default. The build showed an IPv6 address as its
  /64 (`ipAddressText`), audited the refusal at sign-in in the new-device hook, and ran the
  apply check whatever the break-glass says.
- 2026-11-04 — the owner chose the display-currency email lines next (C7b; over "Keep building
  the trip", M10's room holds and event photos, and answering the deployment plan; the plan is
  unanswered and Plausible CE is not installed). Built without a migration or new route. The
  build wrote "about" (the email boards' word, not the web's "≈"), put the guide beside each
  amount payable now in E-Invoice with one lock note, worded the lock as the code locks it,
  had the Booking form send and keep the shown currency (as the payment link does), and let a
  failed rate read drop the line rather than the email.
- 2026-11-06 — the C7b e2e exposed stale departure ids on the Booking page after a package save;
  fixed narrowly by reading the package uncached there (`0b76560`) rather than keeping
  departure ids stable across editor saves (an API persistence change, left for the owner).
- 2026-11-06 — the owner chose stable package ids next (over "Keep building the trip", M10's
  room holds and event photos, and answering the deployment plan; the plan is unanswered and
  Plausible CE is not installed), and chose to refuse a save that removes a row bookings use or
  cuts a departure below its booked seats (over retiring the row, or only warning). The build
  matched rows on their natural keys rather than sending ids (no request change, and a changed
  date is refused rather than moved), took row locks in the save, kept the fields the editor
  hides, added the departure status select the refusal's "Closed" advice needs, and filtered
  the package page to open departures. The uncached Booking page read `0b76560` stays.
- 2026-11-06 — the owner chose the departure seat race next (over "Keep building the trip", M10's
  room holds and event photos, and answering the deployment plan; the plan is unanswered and
  Plausible CE is not installed). A row lock on the departure in the writing transaction, over
  a seat counter (a migration) or SERIALIZABLE retries. The check moved there rather than being
  repeated, so one place decides. Moved the save's departure lock ahead of its tier lock rather
  than taking a tier lock on every booking. Fixed the desk's party edit too, as the same bug.
- 2026-11-07 — the owner chose "Keep building the trip" next (over the tier/extra 500, M10's room
  holds and photos, and answering the deployment plan; the plan is unanswered and Plausible CE
  is not installed), editable until a proposal is sent (over until the desk starts a draft, or
  any time it is open). Since a version is created and sent at once, that is OPEN + DRAFT. Chose
  a row lock on the proposal in both the edit and the send, plus the desk's `updatedAt` stamp,
  over a request version column (a migration); the edit history lives in audit rows. An edit
  that would strand event seats is refused rather than unlinking the event request.
- 2026-11-07 — the owner chose the tier/extra 500 next (over M10's room holds and photos, the
  desktop cookie banner, and answering the deployment plan; the plan is unanswered and
  Plausible CE is not installed). Chose `FOR SHARE` on the booking's tier and extras after
  the departure claim, over re-reading the whole package under locks or re-pricing there.
  Also refused an extra withdrawn in the window (the same check `plan()` makes) and fixed the
  desk's party edit tier, as the same bug.
- 2026-11-08 — the owner approved the deployment plan as recommended with every (approval)
  item, chose security patches as the next batch, kept supplier confirmations for the worker
  app (over the desk "confirmed by phone" action first; that stays the fallback), and asked for
  the pull request into `main`. Chose a merge commit over squash or rebase for that merge,
  because `main` is an ancestor of `vereda` and the history stays reviewable. The AI provider
  stays open: suggested Mistral (EU) if counsel flags US providers, else a trial of Mistral and
  Claude on anonymised desk messages.
- 2026-11-08 — security patches by in-range updates plus a same-major override of Next's
  postcss pin, over forcing majors: the two majors left (`deepmerge-ts`, `uuid`) are
  unreachable from a request and go to the owner. The public catalog drops `supplierId` with a
  separate DTO rather than changing the desk's. B7 checks the handshake's `Origin` as well as
  CORS, because CORS alone does not stop a cross-origin WebSocket. B8's flag is read per request
  so one image serves the trial and launch. B6 takes the links' scheme from `BETTER_AUTH_URL`
  rather than a new variable or `X-Forwarded-Proto`, since behind the proxy the API is reached
  over http.
- 2026-11-08 — the owner took the agent's recommendations: leave the two major-only audit fixes
  (`deepmerge-ts`, `uuid`) until Prisma and exceljs update them, and fix the storefront 404
  shell before B1/B2.
- 2026-11-08 — the 404 fix makes unknown paths unmatched (Next's `/_not-found` under a
  pass-through root layout) rather than wrapping pages in `<Suspense>`, because only the former
  keeps status 404; a page's own `notFound()` stays on Next's error document until the owner
  decides (Next 1). The API image is Node 22 slim plus Playwright's own Chromium install rather
  than the Playwright image, to keep Node 22 (the image ships 24) and drop two browsers. The
  images prune with a filtered `pnpm install --prod` (`pnpm deploy` would drop `dist/`), and
  `prisma` became a production dependency so the same image runs `migrate deploy`. The desk gets
  `X-Frame-Options: SAMEORIGIN` (it frames a credential from its own origin) where the plan said
  DENY. B4 split the settings into `deploy/.env` (Compose) and `deploy/api.env` (API only) so
  the API never holds the owner's password.
- 2026-11-08 — the owner chose to leave a page's own `notFound()` on Next's error document
  (status 404, the page after hydration) rather than a 200 soft 404 or a Next 16 upgrade;
  unmatched paths already get the server-rendered 404.
- 2026-11-08 — B9 is a command in the API image, not an HTTP route: nothing public can ever
  promote, and it reuses the image's Prisma client and the tenant manifest. It refuses on any
  Super Admin row, deactivated or not, and promotes all named addresses or none.
- 2026-11-08 — B11 runs in a container built on the database's own `postgres:16.15` image
  (matching `pg_dump`), so `age`/`rclone` are never installed on the host; only public keys
  live on the server. A live restore drops and re-creates the database (not `--clean`) so a
  failed migration's leftovers go too, restores with `--no-owner --no-privileges`, then
  re-runs the B4 role script. "Re-run anonymisation" is a command running the daily job's own
  pass, not a desk button (no UI change). The month's first good daily is its monthly.
- 2026-11-08 — B3 uses plain `docker login`/`docker build`/`docker push` in the workflow
  rather than Docker's build/push actions (no new third-party action), through one script
  (`deploy/build-images.sh`) that CI and a local rehearsal share. The release reruns `ci.yml`
  as its gate instead of trusting the tagged commit's earlier run. `deploy.sh` pulls before
  the pre-deploy dump (the plan listed the dump first) so a missing image changes nothing,
  requires the checkout at the tag so the compose file and Caddy settings match the images,
  and records `OTA_VERSION` only after every health check passes.
- 2026-11-09 — the owner chose A4 with the recommended default: the `aiAssistant` flag defaults
  on (dev and e2e unchanged) and production on the mock holds it off at the API, rather than a
  hand switch before launch or a default-off flag. The hold is a deployment fact removed from
  the flags in force, not a stored value, so no settings version or data changes and the
  Thresholds board still shows what the Super Admins set. The desk hides the draft button
  rather than disabling it with a reason, since nobody can switch it on from Messages.
- 2026-11-09 — the owner approved Expo and started Phase 7 rather than the desk "confirmed by
  phone" action, with W1 (a code by SMS or read out by the desk), W3 (bearer tokens for
  worker-code sessions only) and W7 (Expo's web target for screenshots and the e2e only). The
  build chose: codes in Better Auth's `verification` table (no migration); three screens in
  one state machine rather than `expo-router`; the system font; the SMS console only outside
  production; a desk code stands against SMS resends; the stock bearer plugin's response side
  left out; Expo's exact pinned versions, all at least two weeks old.
- 2026-11-09 — the owner deferred the two advisories Expo brought (`glob` 13 → 14, `minimatch`
  10 → 11, moderate), like deepmerge-ts and uuid: they run only in Expo's build-time CLI on our
  own files, and the fixes are new majors. The audit is re-run each session; take Expo's patch
  once it bumps them.
- 2026-11-10 — the owner chose the desk's worker sign-out over availability/W-Calendar and
  background resend. It ends only worker-code sessions rather than every session of the account
  (the staff "Sign out everywhere" shape), because the app's bearer can carry nothing else, and
  it also voids an open code so one read out or texted before the loss cannot sign the phone
  back in. The confirm button is primary, not destructive: a new code undoes it.
- 2026-11-11 — CI installs the Chromium headless shell (with its system packages) before Test,
  rather than skipping `shutdown.test.ts` where no browser exists: the test's point is that a
  real Chromium is closed on SIGTERM. The install uses `packages/documents`' playwright so the
  browser build matches.
- 2026-11-11 — the owner chose W-Calendar now on the existing tables, with a migration document
  for the rest, over a migration-first calendar or background resend. The build found the fuel
  declaration needs no migration (`supplier_resources` and the `WORKER_APP` channel exist), so
  only the block reasons wait. It chose: the range picked on the grid (no date-picker
  dependency), at most 62 days per change up to the end of the twelfth month ahead, job and
  offer days left as they are, the long block counted from today, the fuel written through the
  desk's resources path, and no offline queue for calendar changes.
- 2026-11-11 — the owner approved the block reasons as recommended (K1a–K6a), over W-Earnings
  or background resend. The build chose: the board's chips at the app's 48 dp rather than 36 px;
  a chip on a blocked day saves at once (no separate save); the range card's reason returns to
  "Otro" after each block; a freed day drops its reason whatever is sent (not a 400); a job or
  offer day hides a stored reason; the two chip groups named apart; `aria-checked` over
  `accessibilityState` so the web preview shows the picked chip.
- 2026-11-11 — the owner chose a read-only W-Earnings on the existing tables over W-Credentials,
  background resend and W-Job. The build chose: a job is finished by its end date (not
  `FULFILLED`, which nothing sets); the worker's reliability is the floor's reading (every
  offer) rather than the board's 12 months, so the number shown is the one that decides; the
  board's "a timely decline keeps the number high" is dropped as untrue of the rule; "Pagado"
  by the job's year until a paid date exists; no ratings (a review rates the booking); the
  desk gets the same payouts on the supplier page; recording payouts, method, receipts and
  the pay rule go to `docs/schema-w-earnings.md` for approval.
- 2026-11-13 — the owner approved `docs/schema-w-earnings.md` E1–E8 as recommended, over
  background resend, a W-Credentials doc and Ops Lite. The build chose: the office's sessions in
  the manifest's `workerPayouts` and the business days as a threshold (5); business days
  Monday to Friday without holidays; a failed payout paid by a new payment and left out of the
  next pay day; the paid day from the last job's end to today; a 409 and rollback when a job
  is paid meanwhile; receipts rendered on demand in Spanish and never stored, with a desk route
  beside the worker's (the office prints it to sign); the desk's method change as its own
  route; no undo; the app lists payments without the PDF until the owner picks how a phone
  opens it; the board's "salvo que haya una incidencia abierta" dropped as untrue.
- 2026-11-13 — the owner chose to open a payout receipt in the app with `expo-file-system` and
  `expo-sharing` (option (a)) over a signed link or no PDF in the app, and over W-Credentials'
  doc, background resend and Ops Lite. The build chose: a button per payment rather than the
  board's single "Recibos (PDF)" button (it does not say which receipt); Android's share sheet
  rather than an in-app viewer; the file in the cache, overwritten on reopening, not deleted
  after sharing (the receiving app may still read it); the web preview saving the file so the
  e2e can check it; no change to the API, whose worker route already scoped the receipt.
- 2026-11-14 — the owner chose Ops Lite (Phase 7 item 2) over background resend, W-Job with a
  migration doc and a W-Credentials doc. The build chose: `/lite` inside the back-office with
  the desk's checks and live alerts (ADR 0007) rather than a separate app; the alerts screen
  reuses the desk's feed, cue, acknowledgement and mute, so the phone and the desk share them;
  the channel as a `?channel=` query on the four dispatch writes (uniform, `DELETE` included)
  rather than body fields; refunds and payment extensions from Ops Lite audited as on the desk
  (no channel); an inbox without worker threads (no model) and without SMS; urgency as
  "awaiting a reply on an open case"; read state through the existing `messages.read_at` with a
  new ops-only route, set when a thread opens (on the desk too); no thread opening by itself;
  polling (30 s screens, 60 s unread count) rather than a new all-bookings socket room, which
  would change who may join `/conversations`; browser notifications only while the page is
  open (A5). The rest of the design resolutions are ADR 0006's amendment of the day.
- 2026-11-14 — the owner chose W-Credentials (a migration doc first) over background resend,
  W-Job and Ops Lite's follow-ups, then approved `docs/schema-w-credentials.md` V1–V8 as
  recommended: one row per uploaded version, six kinds with per-category required sets as a
  domain rule, the derived earliest expiry plus an approval gate (not a dispatch pause), every
  upload reviewed by Operations/Super Admin who types the number and dates, no identity-card
  photo, `expo-image-picker` 58.0.10, old files deleted and reads audited, the backfill. The
  build chose: one-pending-per-kind enforced in the service (Prisma 6 cannot declare a partial
  unique index); the desk's upload keeps `POST /suppliers/:id/credential` and adds `via`; the
  file hidden until "Show document (logged)"; "Reject" and "Request new upload" as one action;
  the identity card's own route; the review SMS without the desk's reason; an unsent photo not
  queued; `SuppliersService` no longer injects storage. Design resolutions are ADR 0006's
  amendment of the day.
- 2026-11-14 (evening) — the owner chose background resend over W-Job (a migration doc first),
  distribution and the W-Credentials/Ops Lite follow-ups, approving `expo-background-task`
  58.0.11 and `expo-task-manager` 58.0.12 (`unimodules-app-loader` 58.0.2 comes with them). The
  build chose: the task scheduled only while answers wait for a signed-in worker (an empty
  queue costs no wake-ups) and cancelled when the queue empties or the worker signs out, rather
  than one always registered while signed in; Android's 15-minute minimum interval; one flush at
  a time per JS runtime through `flushAnswers` itself rather than a lock only in `App.tsx`;
  scheduling calls queued the same way, so a sign-out's cancel cannot miss a schedule in
  flight; the background's sent and refused answers kept in the kv store and shown on the next
  sync (the "sent" tick, the existing refusal notice) rather than a notification, which would
  need `expo-notifications`; no copy change, as "se enviará solo cuando vuelva la señal"
  already promised it; a scheduling failure logged with `console.warn`, since the open app's
  resend still runs; no `expo-background-task` config plugin entry (it only edits iOS's
  Info.plist).
- 2026-11-15 — the owner chose W-Job (a migration doc first) after background resend and
  approved `docs/schema-w-job.md` J1–J9 as recommended: the brief as three text columns, the
  steps as four timestamps, the last step setting `FULFILLED` with pay and the booking's state
  unchanged, the desk and the traveler seeing the steps, reports in `incidents`, the SMS
  composer now (silent module later), `expo-location` 58.0.19 foreground only, the night's host
  with a Cuban phone, no worker messages yet. The build chose: two lists on the phone under one
  lock (reports, answers, steps) rather than one mixed list; `stepsOpen` and `jobStepsDue` so
  the app offers steps only on a paid booking from its day (the API enforces the booking
  state); the composer opening only when the report is still on the phone after the sync, with
  "Enviar también por SMS" otherwise; no undo on "I have it", which also refreshes the page
  behind; emergencies as one more red alert in `DeskAlerts` (own read, same cue and mute)
  rather than a separate feed; the board's "Ofertas" tab dropped; no worker name on the
  traveler's step line, timed as the row's dates are; all three brief fields purged, not only
  the notes; a host's own job without a night host; the work order's rendezvous naming the
  meeting point. Design resolutions are ADR 0006's amendment of the day.
- 2026-11-15 (later) — the owner approved the distribution plan's U1–U8 as recommended:
  `app.<domain>` outside the trial gate, a release folder with no table, `minVersionCode` and
  never during a job, the in-app installer, code-signed self-hosted updates checked daily,
  email + SMS on approval with a static QR, Android only, the three Expo modules. The build
  chose: the API (not Caddy) serves the files with `sendFile` ranges, so dev, e2e and
  production match; the release tool checks APKs with the SDK's `apksigner`/`aapt2` instead of
  a typed fingerprint; `runtimeVersion` is the app version, set literally; 204 for "no
  update"; the storefront page under `[locale]` in three languages (the worker-facing words
  are Spanish by default); an in-app download that restarts after a cut; the approval message
  in the tenant's primary locale.
- 2026-11-16 — the owner picked worker ↔ desk messages (J9b) over Ops Lite's small follow-ups,
  W-Credentials' follow-ups and the deferred items, and approved `docs/schema-w-messages.md`
  M1–M8 as recommended: their own table, one thread per worker with an optional job, one read
  time, the offline queue with the time of writing, live `/ops` plus the email copy for the
  desk and the next sync for the worker, the desk's three places, text only, purged with the
  traveler when it names their job. The build chose: the booking's card on its own route; a
  booking reply names the worker's first service on it, elsewhere none; the thread opens from
  W-Home and W-Job (not Perfil); no worker-side read mark; no audit rows and no capability, as
  traveler threads; messages emitted as `worker-message`, not `escalation`.
- 2026-11-18 — the owner picked the desktop cookie banner (over Ops Lite's refund nudge and
  withdraw, W-Credentials' vehicle follow-ups and the stale-price window) and deferred the new
  `picomatch` advisory (high, no patch; build and test tooling only) like the other four. The
  build chose: the phone's "Choose by purpose" at every width over a desktop-only layout with
  the rows shown; a one-row bar as wide as the page column from lg (stacked in the 720 px card
  between md and lg); Reject/Accept as equal grid columns rather than a flex row; opened, the
  banner stacks so the focus order follows the reading order.
- 2026-11-18 (later) — the owner picked the French header overflow (over the stale price
  window, Ops Lite's nudge and withdraw and W-Credentials' vehicle follow-ups). The build chose:
  Spanish and French take ADR 0006's larger-text header (drawer until xl, no specialist; Support
  carries it) over tightening the link and row gaps, which would change English's DS 07 spacing
  and still not fit French at 1024; a locale list read on the server over a `:lang()` selector;
  Spanish included because its row ate 37 of its 40 px gutter at 1024 and was 39 px over from
  1280 without scrolling; Home's search button wrapping below sm, found by the new test; the
  320 phone header's gutter (every locale, English included) left to the owner.
- 2026-11-18 (evening) — the owner picked the stale price window (over the 320 phone header,
  Ops Lite's refund nudge and withdraw and W-Credentials' vehicle follow-ups). The build chose:
  refuse with the existing 409 `PriceChanged` over booking at the new price (the traveler
  accepted the shown one) or at the old one (no longer offered); compare every line's amounts
  (`sameCharge`), not only the total, so offsetting changes are caught; ignore labels, so a
  rename is not a price change; treat a currency change as a price change; lock the package
  row last to match a save's order; leave the desk's party edit as is; leave the package's
  status (unpublished in the window) unchecked under the lock, as before.
- 2026-11-18 (night) — the owner picked the 320 phone header (over Ops Lite's refund Withdraw
  and W-Credentials' vehicle follow-ups). The build chose: the locale pills into the drawer
  below sm (DS-Mobile-Patterns: "language and currency in the drawer"), over a tighter row gap
  for every text size, which would change English's DS 07 spacing; sm as the breakpoint, since
  the row fits from 375 with the pills but the design keeps a phone header clean; the drawer's
  language as 48 px link rows in each language's own name (the nav rows' style, not radios: a
  locale is a page, not a setting), shown at every width below lg like the currency. This
  supersedes 2026-10-29's "kept the language links in the phone header" below sm. Also fixed
  the banner switch hidden under the sticky actions (found by the longer walk) with a measured
  scroll padding, over shortening the walk, which would have hidden it again.
- 2026-11-19 — the owner picked the refund card's Nudge and Withdraw (over W-Credentials'
  vehicle follow-ups, a `credential_document_url` drop doc and the M10 room holds doc). The
  build chose: email over push/SMS (neither exists); every eligible approver over one named
  person (the design's "Dayana"), as the override request asks every Super Admin; a 30-minute
  cooldown per refund, whoever nudges, kept in the audit log rather than a column (no
  migration); withdraw as taking back your own approval (deleting your `refund_approvals` row)
  over withdrawing the refund, which would need a status; the actions in the shared
  `RefundActions`, so the desk's queue and a booking's payments get them too; hiding a second
  vote from someone who already voted (the API refused it with 409); locking the refund row in
  vote as well, since a withdrawal racing the second approval reproduced a dual-limit refund
  approved on one vote; the recipients named up to three, counted beyond.
- 2026-11-20 — the owner asked for all four offered items "in the most logical order", kept 30
  minutes as the nudge cooldown, and took the `effect` override over deferring it. The order
  chosen: the override, the schedule's staff emails (no migration, small), then the three
  docs batched for one approval, then the column drop, the vehicle follow-ups and M10 (largest
  last). The owner approved all three docs as recommended (U1a/U2a, X1a–X3a, H1a–H3a/P1a/P2).
- 2026-11-20 — the schedule's staff emails are nulled in the owner-scoped read rather than a
  separate traveler DTO: both fields were already nullable, so neither the storefront nor the
  schema changes shape. The notes were left, as the owner asked about the emails only.
- 2026-11-20 — the vehicle request lives in `vehicle_details` beside the desk's fields (no
  migration), behind one reader/writer (`vehicle-json.ts`); the request, the decisions and the
  desk's own save all lock the profile row, since the JSON is read and written whole. A
  refusal is kept (`rejectedVehicle`) so the app can show the reason until the next request.
  Approval supersedes verified versions only. A non-driver gets 422 as the desk's save does.
  The app's vehicle line shows without a current insurance, so a driver whose documents were
  set aside still sees the car.
- 2026-11-20 — M10's photos copy the package photo pattern but add `PATCH` (alt text,
  people/consent, position) as P2 approved; the desk component is its own
  (`event-media-manager.tsx`) rather than a generalised package manager, so the package editor
  is untouched. The seed holds a room at a new placeholder "Casa Lis" (La Habana) and seeds no
  photo, since the seed cannot reach the API's object storage. The hold line's "Vedado" is the
  event's province; the casa name is not translated. The hold reminder is one dashboard task
  per hold.
