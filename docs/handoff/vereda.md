# Handoff — vereda — updated 2026-10-16 22:30

## Goal
Build the design team's handoff into the platform. The current handoff is `design/vereda-v1.2/`;
`design/vereda-v1.1/` is kept for the record. Plan and phases: `docs/design-v1.1-plan.md`.
Decisions: ADR 0006 (design system; amended for v1.2, change request 02 and Phases 3 & 5) and
ADR 0007 (worker app).

## State
- **Phases 0, 1, 0b, 2 and 3 are done; Phase 5's admin increments are done** (Dashboard
  `47ed5dd`, Bookings/Booking `fca9a4c`, Reports `af0aff0`, Suppliers `715d216`/`1790c68`,
  Payments `6a429e1`, Customers `435ecf3`, Packages editor `91a0dbb`). Commits are local on
  `vereda`; the owner pushes (check `git log --oneline origin/vereda..vereda`).
- **M1 (Package v2) is complete**, including the editor's **Photos** and **Translations** tabs
  (`d8b646b`): `components/package-editor-tabs.tsx`, `package-media-manager.tsx`,
  `package-translations.tsx`. `PackageDto` gained `sourceLocale`, `contentUpdatedAt` and media
  `hasConsent` (the consent reference stays internal); the editor's publish check now sees photos.
- **M2 (party and travelers) surfaces landed (2026-10-16)**, one commit each:
  - `37b5c6e` domain: `priceBooking` (price lines: base, tier, child per traveler, single
    supplement, extras, fees; each line rounded, total = sum), `isPriceLocked` (from
    PENDING_PAYMENT), `ageOn`, `departurePlacesLeft`; the passport cipher (AES-256-GCM, payload
    `v1.<iv>.<tag>.<ct>`, traveler id as AAD) as the **separate entry `@ota/domain/passport-cipher`**
    (package.json `exports`) so browser bundles never load `node:crypto`. Manifest
    `pricing.childBands`/`pricing.fees` (M1 D4; Vereda carries the Booking board's sample terms).
  - `da24767` schemas: party/traveler/room/extra/price-line/passport DTOs; no list carries the
    passport number (`hasPassport` only); PUT replaces the party, an omitted passport keeps the
    stored one, null clears it.
  - `482c7c7` API (`apps/api/src/travelers`): `GET/PUT /reservations/:id/travelers`,
    `POST/DELETE /reservations/:id/extras[/:extraId]`, `GET /reservations/:id/price-lines`,
    `GET /reservations/:id/travelers/:travelerId/passport` (ops+super, audited
    `traveler.passport_viewed`, `Cache-Control: no-store`). A package booking is repriced on every
    change and its total set from the lines; a custom trip keeps its hand-set total and refuses
    extras (409); a locked price refuses any change that moves it (409); a full departure is 409.
    No key → 503 on passport write/read only. All six routes in the authorization matrix.
  - `b392bbc` documents: the invoice prints each service's `travelerPrice` ("Included" when
    bundled) and the price breakdown; the custom builder stamps catalog prices per service and
    totals the trip as their sum.
  - `ae4ef0b` back-office: A-Booking **Travelers** (edit in place, rooming list, extras, "Show
    passport number") and **Price breakdown** sections; detail DTO gained `packageId`.
  - `36ffba1` retention: anonymization scrubs every `ReservationTraveler` on the traveler's
    bookings (kind/lead/room kept).
- `b8c6c0d` fixed a latent dev bug: Turbo 2 strict env mode dropped `RATE_LIMIT_*` (so e2e never
  raised the limits) and an env-supplied passport key; `turbo.json` dev now passes them through.
- **M3 drafted for review**: `docs/schema-m3-compliance.md` (D1–D6). No migration generated.

## Verified (2026-10-16, after `d8b646b`)
- lint, format:check, typecheck (33 tasks), build 18/18 green (dev stack stopped).
- `pnpm test`: **462 passed / 5 skipped** (domain 129, api 200/4 skipped, schemas 21,
  config 25, documents 10, and the rest).
- `pnpm e2e`: **48/48** with `apps/*/.next` deleted first (new: `travel-party.spec.ts`, and a
  photos + translation draft test in `packages-edit.spec.ts`).
- Live DB (`RUN_DB_INTEGRATION=1`): `test/retention.integration.test.ts` (now with the traveler scrub), `test/packages.integration.test.ts` (now with media `hasConsent` and the consent reference kept out of the DTO) and, with `REDIS_URL`, `test/dispatch.bullmq.integration.test.ts` — 1/1 each.
- Retention scrub mutation check: with the service change reverted the live test fails on
  `fullName`; with it, passes.
- Browser (repo Playwright, cached chromium; temporary spec, removed): A-Booking travel party at
  390/1024/1280 — no overflow (scrollWidth == viewport), section titles Fraunces 22/28/600,
  names Inter 14/20/500, totals IBM Plex Mono 14/20/600; total €1,216.00 matches hand
  arithmetic (2 × (240+120) + child 216 + horseback 105 + card 75 + fee 100). The server HTML
  never contains the passport; one reveal wrote one audit row holding only `travelerId`. The edit
  form at 390 has no overflow. Package editor Photos/Translations at 390/1024/1280: no overflow;
  selected tab Inter 16/600 with the primary underline; consent badge warning-toned when missing;
  an outdated FR translation shows its badge and the warning.
- `turbo.json` fix: before, none of `PASSPORT_ENCRYPTION_KEY`/`RATE_LIMIT_*` was in the API
  process environment under `pnpm dev`; after, all three are (names checked, values not printed).

## Assumptions & unknowns
- **Schema gates (Q9):** M1, M2 done. **M3 waits for the owner's answers to D1–D6** in
  `docs/schema-m3-compliance.md`; counsel questions are listed there and do not block the schema.
- `PASSPORT_ENCRYPTION_KEY` is **not** in `apps/api/.env` (I did not read or write it). Until the
  owner adds one (`openssl rand -base64 32`), passport writes/reads answer 503; the rest works.
  The browser check used a throwaway key passed on the command line; its fixture was deleted.
- Passport reveal is ops+super only (support sees status), the conservative reading.
- `pricing` terms in the Vereda manifest are the Booking board's samples (infants < 2 free,
  children ≤ 12 at 60 %, €25 tourist card pp, €100 service fee) — placeholder per tenant/README.
- A child's age is taken at the departure date when one is chosen, else the booking start.
  `singleRooms` = rooms with capacity 1.
- A locked booking priced before M2 (no lines) keeps its total; its party can still be entered.
- Not built: the storefront Booking form (5 steps), OFAC/consent (M3), deposit schedule (M4),
  proposal (M5), traveler document uploads, package versions, server-side publish checks (the
  publish gate still runs only in the editor — the API PATCH does not enforce it; flagged).
- ES/FR for the new back-office copy are agent-drafted.

## Traps
- **Turbo strict env:** a variable set on `pnpm dev` reaches the apps only if `turbo.json`'s dev
  task lists it in `passThroughEnv`. Values in `apps/api/.env` are unaffected (the API loads them).
- **Rebuild a changed workspace package** (`@ota/i18n`, `@ota/schemas`) before the dev server
  sees it: new copy rendered as raw keys until `pnpm --filter @ota/i18n run build`.
- **Fixtures predate new columns:** API tests build Prisma rows by hand; a new non-null field read
  in a mapper (`contentUpdatedAt`, `travelerPrice`, `priceLines`) 500s until the fixture has it.
- `getByLabel` substring/case: "Language" also matched "show this language…" — use `exact`.
- `@ota/domain` has an `exports` map now: deep imports other than `./passport-cipher` fail.
- Earlier traps still apply (ICU spaces, `next-server` survives `pkill -f 'next dev'`, delete
  `apps/*/.next` after a build, Playwright leaves 3000–3002 listening, tenant tokens on `<html>`,
  `cn()` sizes, Tailwind literal classes, no values from `'use client'` into server components,
  grid items need `min-w-0`, `TENANT_CONFIG` overrides in API tests).
- **AGENTS.md §C lines proposed (owner edit),** in addition to the earlier ones still pending:
  - "M2 party: `GET/PUT /reservations/:id/travelers`, `POST/DELETE /reservations/:id/extras`,
    `GET /reservations/:id/price-lines` (apps/api/src/travelers). Package bookings are repriced by
    the domain `priceBooking` and their lines frozen; from PENDING_PAYMENT a change that moves the
    price is 409 (`isPriceLocked`). Custom trips keep their hand-set total."
  - "Passport numbers: AES-256-GCM under `PASSPORT_ENCRYPTION_KEY` via `@ota/domain/passport-cipher`
    (a separate entry so browser bundles never load node:crypto). No list DTO carries the number;
    only `GET /reservations/:id/travelers/:travelerId/passport` (ops+super) returns it, audited as
    `traveler.passport_viewed`. Unset key → 503 on passport write/read only."
  - "Agency booking terms live in the manifest `pricing` block (`childBands`, `fees`); they are
    frozen onto price lines, so a change applies to bookings repriced after it."
  - "The invoice now itemises per-service `travelerPrice` (custom trips) and the frozen price
    lines" (replaces the 2026-09-21 line saying per-service traveler prices do not exist).
  - "`turbo.json` dev passes `PASSPORT_ENCRYPTION_KEY` and `RATE_LIMIT_*` through (Turbo 2 strict
    env mode drops undeclared variables)."
  - "The package editor is tabs: Details, Photos, Translations. `PackageDto` carries
    `sourceLocale`, `contentUpdatedAt` and media `hasConsent`."

## Next
1. Owner: answer M3 D1–D6 (`docs/schema-m3-compliance.md`); add `PASSPORT_ENCRYPTION_KEY` to
   `apps/api/.env`; confirm the placeholder `pricing` terms.
2. Build the storefront Booking form (5 steps) on the M2 party/price API (a traveler-scoped
   route), then M3's migration and surfaces once approved, then M4–M5.
3. Phase 5: Content/Disruption/Settings as their migrations land (M6–M9 asked for as they come up).

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
