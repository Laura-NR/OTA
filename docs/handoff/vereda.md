# Handoff — vereda — updated 2026-10-17 18:30

## Goal
Build the design team's handoff into the platform. The current handoff is `design/vereda-v1.2/`;
`design/vereda-v1.1/` is kept for the record. Plan and phases: `docs/design-v1.1-plan.md`.
Decisions: ADR 0006 (design system; amended for v1.2, change request 02, Phases 3 & 5, the
Phase 4 Booking form and M4 payments) and ADR 0007 (worker app).

## State
- **Phases 0, 1, 0b, 2 and 3 are done; Phase 5's admin increments are done.** Commits are local
  on `vereda`; the owner pushes (check `git log --oneline origin/vereda..vereda`).
- **M1, M2, M3 and M4 are complete**, with their surfaces; the storefront Booking form (sign-in
  first) landed earlier today (`2671aa6`…`e7afb49`), and the API enforces the publish checks.
- **M4 (payment schedule) approved D1–D8 as recommended and landed 2026-10-17**, one commit each:
  - `4fa9bf7` migration `20261017144721_payment_schedule`: `PaymentInstalment`, `PaymentProof`,
    `Refund`, `RefundApproval`, five enums, `PaymentReceipt.feeAmount`/`instalmentId`.
  - `75d3520` manifest `policies` (deposit plans, cancellation scales by key) and payment terms
    (`windowHours`, `cardFeePercent` 0, `refundApproval`) as placeholders; domain rules
    (`buildSchedule`, `depositEligible`, `cardFee`, `addBusinessDays`, `cancellationRefund`,
    `refundDecision`); the seeded package names the `standard` policies. `ac7b395` the publish
    checks read the manifest's keys (`knownPolicyKeys`).
  - `75befdd`/`49191dd` API (`apps/api/src/payments`): links pay instalments (the first fixes the
    plan and moves to PENDING_PAYMENT; the first PAID confirms; a balance only marks its
    instalment), schedule reads (`/reservations/:id/schedule`, `/me/...`), extend, proofs (owner
    upload, queue, audited file, accept extends a business day, reject with note), refunds
    (quote, request, votes by limits, gateway refund with idempotency key or bank reference,
    queue); booking rows carry `nextInstalment`. `2e77ef9` optional `PaymentProvider.refund`.
  - `1149aeb` storefront trip page payment section; `940723f` desk (A-Booking panel, A-Payments
    queues, dashboard alerts, "Payment due" view); `b90feaa` `paymentAlert`; `fbc172f` refunds in
    finance (net revenue) and the fiscal CSV (fee and kind columns, REFUND rows).
- **`099e0c0` fixes a pre-existing bug**: `express.json()` kept its 100 KB default, so every
  base64 upload over ~73 KB (photos, credentials, scans, imports) got 413. Upload routes now take
  15 MB (`apps/api/src/common/json-body.ts`).

## Verified (2026-10-17, after `7b1afdf`; dev stack stopped for the build)
- lint, format:check green; `TURBO_FORCE=true` typecheck 33/33, test **555 passed / 12 skipped**
  (domain 158, api 247/11 skipped, schemas 35, …), build 18/18 — all 0 cached.
- `pnpm e2e` **51/51** (`.next` deleted first): new `payment-schedule.spec.ts` (deposit link,
  expired window on the dashboard and the view, proof accepted on A-Payments, deposit confirms,
  balance, refund approved and sent); `storefront-checkout` now chooses the plan and uploads a
  proof; `storefront-ofac` and `payments` follow M4. A first run failed on the OFAC spec's old
  button name; fixed (`7b1afdf`).
- Live (`RUN_DB_INTEGRATION=1`, `REDIS_URL`) 11/11: retention, packages, affidavits 3,
  package-booking 2, **payment-schedule 2** (deposit → proof → balance → dual-approved refund on
  real FKs; deleting a booking removes its refunds while a refunded receipt cannot be deleted
  alone), dispatch and compliance BullMQ.
- The upload fix: the new `json-body.test.ts` fails on the old parser; the dev API refused a
  200 KB upload body with 413 before and lets it reach the guard (401) after.
- Browser (temporary spec, removed): trip payment section (choice, schedule, proof), A-Booking
  panel and A-Payments at 390/1024/1280 — scrollWidth == viewport everywhere.

## Assumptions & unknowns
- `PASSPORT_ENCRYPTION_KEY` is set in `apps/api/.env` (dev); back it up. A production key differs.
- **Placeholders awaiting the owner/counsel**: the M4 terms (20 % deposit, 60/30 days, 48 h
  window, the cancellation bands beyond 45–31 10 % and 30–15 25 %, the € 60 fee, the € 500 /
  € 2,000 limits), the card fee (0 % pending PSD2 advice), whether a deposit is refundable, how
  long proofs are kept; the legal texts and OFAC wording; the pricing samples.
- The cancellation scale keeps a share of **what was paid** (A-Payments' worked examples), not
  of the total (the Booking board's summary); confirm with the owner.
- Places are checked, then booked, without a lock (same as the desk's party panel).
- Proof files of the e2e fixtures are not removed from object storage (rows are).
- Not built: the PAYMENT_TERMS consent on payment, the override "confirm on proof", statement
  import, payouts, rails health, travel credit, the Confirmation screen, M5, Phase 6 emails
  (incl. balance reminders), Phase 8 cookie banner.

## Traps
- **Stage only the increment's files**: a `git rm` staged earlier rides along with the next
  commit. On 2026-10-17 it landed in an API commit and was moved by a soft reset of two
  unpushed commits.
- **`json.dump` reformats a whole JSON file** (the manifest): insert keys as text and check the
  diff only adds lines. Catalog JSON round-trips cleanly through Prettier; the manifest does not.
- `ops-format` already has `calendarDate` (UTC); a balance due date must use it, not `opsDate`
  (Havana shows the previous evening).
- A client form that seeds `useState` from props keeps a stale first value when the list grows
  after a refresh (the refund form's receipt); derive the selection from props.
- React-controlled `<select>`s: wait for hydration (`__react*` keys on the node) before
  `selectOption`, or the choice is reset (`e2e/payment-schedule.spec.ts` `hydrated()`).
- The payments spec and the global setup must clear `E2E0001`'s instalments: once a schedule
  exists, a second run gets "Nothing is due".
- Earlier traps still apply (stale briefs, Turbo replays, `pkill -f` kills the calling shell,
  no `prisma format`, append-only affidavits, ICU spaces, `.next` after a build, Playwright
  leaves 3000–3002 listening, `getByText` substrings need `exact`).
- **AGENTS.md §C lines proposed (owner edit)**, in addition to the earlier ones:
  - "2026-10-17: M4 payments: a payment link pays the next `PaymentInstalment`; the first link
    fixes the plan (FULL, or DEPOSIT + BALANCE from the package's `depositPolicy` in the
    manifest `policies`); the first PAID receipt confirms the booking, a balance only marks its
    instalment. Expired windows and overdue balances are read with `paymentAlert` from the
    booking's `nextInstalment`; nothing auto-cancels (M4 D4)."
  - "2026-10-17: refunds need approvals by the manifest's `payments.refundApproval` limits
    (`refundDecision`); a card refund calls `PaymentProvider.refund` with the refund id as the
    idempotency key, a transfer refund is recorded with the bank reference. A refund's receipt
    FK is NO ACTION."
  - "2026-10-17: base64 upload routes are listed in `apps/api/src/common/json-body.ts`
    (15 MB); every other route keeps the 100 KB JSON limit. Add a new upload route there."

## Next
1. Owner: confirm or change the M4 placeholder terms and the share-of-paid reading; counsel on
   the card surcharge, the cancellation scale, the deposit's refundability and proof retention;
   back up the passport key.
2. Phase 6 notifications without a migration: the booking-received email, the E-OFAC reminder
   and the balance reminders (7, 3, 1 days) from the instalments' due dates.
3. Draft M5 (proposal) for review; the Confirmation screen; Phase 8 cookie banner.

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
