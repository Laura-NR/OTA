# Handoff — vereda — updated 2026-10-17 16:10

## Goal
Build the design team's handoff into the platform. The current handoff is `design/vereda-v1.2/`;
`design/vereda-v1.1/` is kept for the record. Plan and phases: `docs/design-v1.1-plan.md`.
Decisions: ADR 0006 (design system; amended for v1.2, change request 02, Phases 3 & 5 and the
Phase 4 Booking form) and ADR 0007 (worker app).

## State
- **Phases 0, 1, 0b, 2 and 3 are done; Phase 5's admin increments are done.** Commits are local
  on `vereda`; the owner pushes (check `git log --oneline origin/vereda..vereda`).
- **M1, M2 and M3 are complete**, including their surfaces (see the Decisions log and the plan's
  Progress table for the commits).
- **The storefront Booking form landed 2026-10-17, sign-in first (owner decision)**, one commit
  per increment:
  - `2671aa6` / `c310070` domain: `planRooms` (SHARE two to a room, an odd party's last room a
    triple; PRIVATE a room of one each; infants in the first adult's room) and `travelerKindOn`
    (infant under 2, adult from 18, read on the departure day).
  - `4749858` schemas: `bookPackageSchema` (choices only: no kind, no price; the four booking
    consents required; certifications by traveler index with the statement version).
  - `c531266` API: `POST /me/reservations/package-booking` (`apps/api/src/me/package-booking.service.ts`).
    `plan()` checks everything with no writes (departure open with places, tier, extras, lead is
    an adult, `expectedTotal` vs the server price → 409 `PriceChanged`, consent and statement
    versions, signatures, passport key); `write()` runs inside `MeService.createSubmission`'s
    transaction through its new `within` hook. Pricing is shared with the desk's party panel via
    `apps/api/src/travelers/package-pricing.ts`; `AffidavitsService.createOnline` and
    `ConsentsService.requireText` are shared with the existing routes.
  - `e7afb49` storefront: `/packages/[slug]/book` (`components/booking/booking-flow.tsx`), five
    steps plus "Request received"; the sticky summary prices with the same domain rules. The
    Package page sidebar now links into it; its old date form and strings are gone.
- **`03a7f39`**: `POST`/`PATCH /packages` refuse a package that is PUBLISHED after the save and
  fails `packagePublishIssues` (409 `PackageNotPublishable`, `issues[]`); unpublishing is never
  blocked. Policy keys count as known (no manifest list yet; M4 D2 adds it).
- **M4 (payment schedule) is drafted** in `docs/schema-m4-payment-schedule.md` (`d82b96f`): D1–D8
  with recommendations, the Prisma diff and the manifest terms. **No migration until approved.**

## Verified (2026-10-17, after `d82b96f`; dev stack stopped for the build)
- `pnpm lint`, `pnpm format:check` green; `TURBO_FORCE=true pnpm typecheck` 33/33 (0 cached);
  `TURBO_FORCE=true pnpm test` **513 passed / 10 skipped** (domain 144, api 226/9 skipped,
  schemas 31, …); `TURBO_FORCE=true pnpm build` 18/18.
- `pnpm e2e` **50/50** with `apps/*/.next` deleted; `storefront-packages.spec.ts` now books two
  adults and a child through all five steps (US lead certifies; a wrong signature is held) and
  checks the frozen lines, party, affidavit and consents in the DB, then deletes the booking and
  restores the traveler's nationality and phone.
- Live (`RUN_DB_INTEGRATION=1`, `REDIS_URL`): retention 1/1, packages 1/1, affidavits 3/3, the
  new `package-booking.integration.test.ts` 2/2 (one transaction stores booking, rooms, travelers
  with passport ciphertext that decrypts, extras, lines, affidavit, consents; a refused booking
  writes nothing), dispatch BullMQ 1/1, compliance BullMQ 1/1. No fixture rows left.
- The three new API tests in `packages.e2e.test.ts` fail against the old service (checked by
  swapping it back), and the 13 Booking API tests cover price, kinds, rooms, passport never
  returned or audited, certification, consents, stale versions, places, price moved, under-age
  lead, retired extra, 401, and 503 without a key.
- Browser (temporary spec, removed): every step at 390/1024/1280 has scrollWidth == viewport
  after the fix to the step-5 submit label at 390 (it was 394). Titles Fraunces 32/40/600
  (22/28 at 390), panels 12 px radius and 28 px padding (20 at 390), summary 360 px sticky at
  top 96 from `lg`. All 435 new `booking.*` messages parse in en/es/fr.

## Assumptions & unknowns
- `PASSPORT_ENCRYPTION_KEY` is set in `apps/api/.env` (dev); back it up. A production key differs.
- Legal texts, the OFAC categories' wording and the pricing samples (child bands, fees) are still
  placeholders for counsel and the owner. M4 adds counsel questions (the card surcharge under PSD2
  art. 62(4), the cancellation scale and € 60 fee, the deposit's refundability) and owner
  questions (deposit 20 %, 60 and 30 days, 48 h window, the band ranges, refund thresholds).
- The booking's owner signs for every US traveler with that traveler's name (counsel question).
- Places are checked, then booked, without a lock: two simultaneous bookings on the last places
  could oversell (same as the desk's party panel). Fine for request-to-book; revisit with
  instant booking.
- Not built: the Payment page's deposit/balance (M4), the Confirmation screen with CSAT, M5
  proposal, E-OFAC and the other C-Spec emails (Phase 6), the cookie banner (Phase 8).

## Traps
- **The pasted session brief can be stale**: on 2026-10-17 it repeated work already in the log.
  Compare it with `docs/next-session-prompt.md` and `git log main..vereda` before starting.
- **Turbo replays cached results**: a fully cached `pnpm test` or `typecheck` is a replay, not a
  run. For evidence after changes elsewhere, use `TURBO_FORCE=true`.
- **`pkill -f '<pattern>'` from a Bash tool call can kill its own shell** (exit 144), because the
  call's command line contains the pattern. Kill by PID from `ss -ltnp` instead.
- A regex of no-break spaces written through a heredoc landed as literal characters and failed
  `no-irregular-whitespace`; keep `   ` as escapes (`apps/storefront/src/lib/format.ts`).
- Storefront client components must not format with `Intl` on both sides: pass server-formatted
  strings (`formatDay`, `countryOptions`) or wrap with `plainSpaces(formatMoney(...))`.
- Booking stamps the lead's nationality and phone on the user: e2e fixtures using
  `traveler@example.test` must restore them.
- Earlier traps still apply: never run `prisma format`; `traveler_affidavits` rows can be deleted
  but never updated; API fakes need every column a mapper reads; rebuild changed workspace
  packages before the dev server or a single live test sees them; delete `apps/*/.next` after a
  build; Playwright leaves 3000–3002 listening; `getByLabel` matches substrings.
- **AGENTS.md §C lines proposed (owner edit)**, in addition to the earlier ones:
  - "2026-10-17: the storefront Booking form posts `POST /me/reservations/package-booking`. The
    server derives traveler kinds from the date of birth (`travelerKindOn`), builds rooms from the
    SHARE/PRIVATE choice (`planRooms`), prices with `apps/api/src/travelers/package-pricing.ts`
    (shared with the desk's party panel), refuses a moved `expectedTotal` (409 `PriceChanged`),
    and writes the party, lines, affidavits and consents through `createSubmission`'s `within`
    hook, in one transaction."
  - "2026-10-17: `POST`/`PATCH /packages` refuse a package that is PUBLISHED after the save and
    fails `packagePublishIssues` (409 `PackageNotPublishable`, `issues[]`); unpublishing is never
    blocked."

## Next
1. Owner: review the M4 draft (`docs/schema-m4-payment-schedule.md`, D1–D8, the sample terms and
   thresholds); counsel questions; back up the passport key; confirm the pricing samples.
2. After M4 is approved: the migration, then the Payment page (deposit or full, wire with the
   proof upload), the schedule on A-Booking, the proofs and refund queues on A-Payments, the
   window and balance alerts. The manifest `policies` then give the publish checks real keys.
3. Then the Confirmation screen (with CSAT), the M5 proposal draft, Phase 6 emails, Phase 8 cookie
   banner.

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
