# Handoff — vereda — updated 2026-10-17 13:00

## Goal
Build the design team's handoff into the platform. The current handoff is `design/vereda-v1.2/`;
`design/vereda-v1.1/` is kept for the record. Plan and phases: `docs/design-v1.1-plan.md`.
Decisions: ADR 0006 (design system; amended for v1.2, change request 02 and Phases 3 & 5) and
ADR 0007 (worker app).

## State
- **Phases 0, 1, 0b, 2 and 3 are done; Phase 5's admin increments are done.** Commits are local
  on `vereda`; the owner pushes (check `git log --oneline origin/vereda..vereda`).
- **M1 (Package v2) and M2 (party/travelers) are complete** (M2 surfaces `37b5c6e`…`36ffba1`,
  editor tabs `d8b646b`). The storefront Booking form (5 steps) is the open M2/Phase 4 screen.
- **M3 (compliance) approved 2026-10-17 (D1–D6 as recommended) and landed**, one commit each:
  - `5f6cd29` migration `20261017075012_compliance`: `TravelerAffidavit`, `ConsentRecord`,
    enums, `ReservationTraveler.usPerson`, and a hand-written **append-only trigger** on
    `traveler_affidavits` (only the `ON DELETE SET NULL` of its four links may update a row).
  - `a4255b7` domain `compliance/`: `isUsPerson`, `signatureMatches` (accents/case folded),
    `affidavitRetainUntil` (trip end + 5 y), `ofacGate`, `currentConsents`, `needsConsent`.
  - `4354b7b` schemas: affidavit/consent DTOs (lists never carry signature, IP or user agent) and
    the tenant `content.legal` block (OFAC statement and consent words with version ids,
    placeholder from the boards, in `tenant/messages/en.json`).
  - `783040a` API `apps/api/src/compliance`: status (`/reservations/:id/ofac`,
    `/me/reservations/:id/ofac`), online signing by the booking's owner (name must match, the
    statement version must be current, IP/browser/statement hash kept, a new one supersedes),
    paper affidavit with scan (ops), audited record/scan (ops+super), Super Admin CSV export
    (formulas defused), `GET/POST /me/consents`, `GET /customers/:id/consents`. **Gate:** a
    payment link is 409 while a US person lacks an affidavit; document generation then issues
    the invoice only and audits `documents.held`. Shared helper `compliance/ofac-gate.ts`.
  - `cff508a` retention: the daily scan sweeps affidavits past `retainUntil` (with scans,
    `affidavitsDeleted` in the result); anonymization detaches the consent log.
  - `694e25f` back-office: OFAC section on the booking page, US-person override in the party
    form, `ofacMissing` on booking rows and customer trips → Dashboard alert, "Missing OFAC"
    view, customer OFAC column and consent log. Category names in a shared `ofac` namespace.
  - `3660290` storefront: the certification step on the account trip page (payment shows the
    locked notice until all US travelers sign) and Account › Preferences consent switches.

## Verified (2026-10-17, after `3660290`)
- lint, format:check, typecheck (33 tasks), build 18/18 green (dev stack stopped).
- `pnpm test`: **485 passed / 8 skipped** (domain 138, api 210/7 skipped, schemas 25, …).
- `pnpm e2e`: **50/50** with `apps/*/.next` deleted (new: `ofac.spec.ts`,
  `storefront-ofac.spec.ts`).
- Live DB (`RUN_DB_INTEGRATION=1`): `retention` 1/1 (now with the affidavit sweep, the kept affidavit
  and the detached consent), `packages` 1/1, `affidavits` 3/3 (trigger refuses a change; deleting
  booking, traveler or a superseded affidavit clears the link); with `REDIS_URL`, dispatch BullMQ 1/1.
- Browser (temporary spec, removed): booking OFAC section, customer profile and the storefront
  certification step and Preferences at 390/1024/1280 — no overflow (scrollWidth == viewport);
  back-office section titles Fraunces 22/28/600, storefront card title Inter 20/28/600 like the
  page's other cards; "View record" showed the IP and wrote one `affidavit.viewed` row.
- Passport flow under the owner's real key (2026-10-17, after the key was filled in
  `apps/api/.env` and the API restarted; the value was never printed): the key decodes to
  32 bytes; a passport saved through `PUT /reservations/:id/travelers` is stored as `v1.`
  ciphertext with no plaintext in the row; the vault route returns it (200) and writes one
  `traveler.passport_viewed` row. The throwaway fixture was deleted.

## Assumptions & unknowns
- `PASSPORT_ENCRYPTION_KEY` is set in `apps/api/.env` (dev). Back it up; a production key must be
  different and is a deploy secret.
- Legal texts (OFAC statement, consent words) and the category wording are placeholders for
  counsel; changing words needs a new version id. Who may sign for a companion or a minor is a
  counsel question: today the booking's owner can sign for any US traveler on it, with that
  traveler's own name as the signature.
- The public cookie-banner consent route waits for the banner (Phase 8); `ipCountry` stays null
  until a geo-IP source is approved (D5).
- Pricing samples in the manifest (child bands, fees) are still unconfirmed (asked 2026-10-16).
- Not built: storefront Booking form, M4 deposit schedule, M5 proposal, E-OFAC reminders,
  server-side package publish checks (the API PATCH does not enforce them; flagged earlier).

## Traps
- **`prisma format` rewrites the whole schema's alignment**: don't run it; hand-edit and run
  `prisma validate` (a formatted run had to be reverted).
- `traveler_affidavits` refuses UPDATE by trigger: fixtures and cleanups must DELETE rows (allowed)
  and must never update one. A new FK to this table needs the trigger's link list extended.
- Fakes in API tests must carry `reservationTraveler.findMany`/`travelerAffidavit.findMany` (the
  OFAC gate reads them in payments and documents) and new read-model includes.
- Turbo strict env, rebuild changed packages before the dev server, `getByLabel` substrings
  ("Not certified" vs "not certified yet" needs `exact`), fixtures missing new columns: see
  2026-10-16 traps, still true.
- Earlier traps still apply (ICU spaces, `next-server` survives `pkill -f 'next dev'`, delete
  `apps/*/.next` after a build, Playwright leaves 3000–3002 listening, tenant tokens on `<html>`,
  `cn()` sizes, Tailwind literal classes, no values from `'use client'` into server components,
  grid items need `min-w-0`, `TENANT_CONFIG` overrides in API tests).
- **AGENTS.md §C lines proposed (owner edit),** in addition to the 2026-10-16 ones:
  - "M3 OFAC: `TravelerAffidavit` is append-only (DB trigger; a correction is a superseding row)
    and outlives the traveler purge for 5 years after the trip; the daily retention scan deletes
    it at `retainUntil`. A US person (`usPerson` override, else nationality US) without an
    affidavit blocks payment links (409) and holds vouchers/work orders (`documents.held`)."
  - "Legal texts live in tenant content `content.legal` (OFAC statement, consent words by purpose,
    each with a version id); the API stamps the version and SHA-256 on every affidavit and
    consent and refuses a stale version (409)."
  - "Affidavit records, scans (ops+super) and the CSV export (Super Admin) are audited reads;
    lists never carry the signature, IP or user agent."

## Next
1. Owner: back up the dev passport key; counsel review of the legal texts and categories;
   confirm the pricing samples.
2. The storefront Booking form (5 steps, M2 party + M3 step 4 + consents at review), then
   M4 (deposit schedule) and M5 (proposal) — each migration asked for first.
3. Phase 6: the E-OFAC reminder and the other C-Spec emails; Phase 8: cookie banner + public
   consent route.

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
