# Handoff — vereda — updated 2026-10-25 15:00

## Goal
Build the design team's handoff into the platform. The current handoff is `design/vereda-v1.2/`;
`design/vereda-v1.1/` is kept for the record. Plan and phases: `docs/design-v1.1-plan.md`.
Decisions: ADR 0006 (design system; amended through 2026-10-24 for Phase 4, M4–M10, Phase 6, the
Confirmation screen, the Custom builder, the DS 07 widths, Phase 8 item 2 and, on 2026-10-25,
reduce motion, high contrast and the axe audit) and ADR 0007 (worker app).

## State
- **Phases 0, 1, 0b, 2, 3 and 5 are done; M1–M10 are complete with their surfaces; Phase 8 items
  2–4 are done**, the axe audit included. Commits are local on `vereda`; the owner pushes
  (`git log --oneline origin/vereda..vereda`).
- **This session (2026-10-25): reduce motion, high contrast and the axe audit**, owner-approved
  (`@axe-core/playwright` 4.13.0, dev only, exact pin; no migration):
  - `ota_display` gains `reduce-motion` and `high-contrast` (`5abe936`); copy en/es/fr
    (`ebd4b20`); the switch's off track darkens under high contrast (`f632888`); the storefront
    keys the modes on `<html data-motion data-contrast>` in `globals.css`, honours the system's
    `prefers-contrast: more` too, and the message thread's smooth scroll checks reduced motion
    (`d22c971`); e2e in `storefront-display.spec.ts` (`103c1f4`).
  - `e2e/accessibility.spec.ts` (`f1e1131`): axe with the WCAG 2.2 AA tags, plus unique ids, over
    every customer page (plain, and at 390 px with larger text, reduced motion and high contrast,
    with the menu open), the traveler account/trip/booking/builder, 26 desk pages and the desk
    sign-in. It found three problems, fixed: `Table`'s `scrollRegionLabel` (`4140c70`, used by
    content tables `b19a165`), per-instance ids for the menus' display switches (`2751838`), and
    labels on every package-form field (`13db4ef`).
- Earlier (2026-10-24): Phase 8 item 2 (rem type, larger text, low bandwidth, the PWA and the
  offline kit), the DS 07 widths and M10 (see Decisions).
- **Not built:** SMS/push, Phase 8 item 1 (T-Events sink); queued offline writes; the
  D-OfflineKit PDFs; A-Content's blog/FAQ/media/conditions tabs; guide specialities; M9's
  deferred items; M10's deferred room holds, event photos and "Keep building the trip"; manual
  keyboard/reading-order checks beyond what axe decides.
- **Placeholders:** M4 terms, card fee 0 %, legal texts, OFAC categories, pricing samples, the
  deposit's refundability and proof retention, the M5 sample terms, the builder rates, the M8
  crisis framework, the backup-power wording, the concierge fee and the events copy
  (`content.events`, en/es; the US note waits for counsel); dev seed as before plus two events.

## Verified (2026-10-25, dev stack stopped for the build)
- `pnpm lint` and `pnpm format:check` green.
- `TURBO_FORCE=true pnpm typecheck` **33/33**, 0 cached.
- `TURBO_FORCE=true pnpm test` **861 passed / 28 skipped**, 29/29 tasks, 0 cached (domain 318,
  api 314/27 skipped, schemas 66, config 36, ui 35, email 28, documents 22).
- `TURBO_FORCE=true pnpm build` **18/18**, 0 cached.
- `pnpm e2e` (`apps/*/.next` deleted first): **102 passed, 3 skipped** in 25.2 min, first run
  (adds the five axe audit tests and three display tests; the skips are the desk at
  320/375/414). Leftover servers stopped by PID.
- Live (`RUN_DB_INTEGRATION=1`, `REDIS_URL=redis://localhost:6379`) **27/27**, 11 files.
- Disproved: with the `data-motion`/`data-contrast` rules and `prefers-contrast` block broken,
  the three new display tests fail; before the fixes the axe spec failed on `/en/legal/privacy`
  (390 px, larger text), desk `/packages` and `/packages/[id]`.
- Browser (Playwright, 390/1024/1280): the menu drawer's four switches, Account › Preferences'
  Display card, high contrast on Travel info (muted `#4a433d`, border `#6e665e`), the privacy
  table as a keyboard-scrollable region with an inset ring; `scrollWidth − innerWidth` = 0.

## Assumptions & unknowns
- `PASSPORT_ENCRYPTION_KEY` is set in `apps/api/.env` (dev); back it up. A production key differs.
- **Deploys:** keep the orchestrator's kill grace period above `SHUTDOWN_TIMEOUT_MS`. Env from M9:
  `STAFF_SESSION_HOURS` (12), `MAGIC_LINK_EXPIRES_MINUTES` (10), `BACKOFFICE_PUBLIC_URL`.
- The settings cache is per process (60 s); a multi-instance deploy sees an applied change within
  a minute.
- **M10, for finance/counsel:** whether a regenerated invoice is enough when seats are added after
  the invoice, or a supplementary invoice is needed; the fall-through and refund wording; the US
  note on concerts.
- The dev database holds several Super Admins from old smoke tests; dev data, not M9's.
- The public `GET /catalog` still returns inventory `supplierId` (pre-existing).
- **For the owner:** the items under Next; the storefront's sample "Cuba right now" banner says
  every stay has backup power; `staff.allowedEmailDomains` should become the agency's domain.

## Traps
- **Accessibility batch (2026-10-25):** `AxeBuilder` needs a page from `browser.newContext()`
  (a bare `browser.newPage()` throws "Please use browser.newContext()"); Playwright's `page`
  fixture is fine. Computed colours read back as `color(srgb …)` (and as `oklab(…)` mid
  transition), so the display e2e normalises with `rgb()` and polls past the switch's 120 ms
  transition. Custom properties read back resolved (`#6e665e`), never `var(...)`. The header and
  the bottom bar each mount a `SiteMenu` whose closed `<dialog>` stays in the DOM, so anything
  inside it needs `useId()` ids and `getByText` there needs `.filter({ visible: true })`. A
  `Table` that may scroll with no controls inside takes `scrollRegionLabel`. Every new desk form
  field needs `htmlFor`/`id` (repeating rows: suffix the row index), or the axe spec fails.
  `ERR_NETWORK_IO_SUSPENDED` on a desk `goto` was transient once (memory at 20/23 GB); rerun.
- **Phase 8 item 2:** `public/sw.js` duplicates `offlineAssetPaths` (tested in @ota/domain) and
  the kit cache name `ota-kit-v1` (`lib/offline-kit.ts`); change them together and bump
  `SHELL_CACHE` when the worker's caching changes. The worker fetches the offline pages with a
  pinned `Accept-Language` and no cookies, or next-intl redirects `/offline` to the browser's
  locale. A page loaded after a normal-mode page replays the brand fonts from memory cache as
  zero-byte requests: assert "no font download" from a fresh context. A Playwright browser keeps
  the worker for its context only; the owner's own browser keeps it on localhost:3000 (harmless:
  it never answers while the network works). Long labels in nowrap buttons break 320 px at
  larger text: use `WRAPPING_BUTTON` (`lib/button.ts`); grid items still need `min-w-0`.
  The worker registers on `load` and precaches one locale's offline page on purpose: precaching
  all three during the first page made the checkout e2e's wire page miss its 3 s window (found
  and fixed, `7781028`). In the first full e2e of the day both Next dev servers grew to ~7 GB
  and exhausted memory around test 48, hanging later tests; kill leftovers by PID and rerun.
- **M10:** repricing (`TravelersService.writePrice`) keeps `EVENT_TICKET`/`CONCIERGE_FEE` lines
  and re-adds them to the total; any new code that rewrites price lines must do the same. A
  CONFIRMED request's booking link may turn null (SET NULL), so never assume it. Event nights and
  categories are updated by id, never replaced. `EventsService` now takes the operating settings
  (public `answerHours`), so app-level fakes need `operatingSettings.findFirst` (the RBAC matrix
  has it). The events e2e owns E2EEVT01, every event named "E2E Concierge…" and **all** event
  requests of `traveler@example.test` (and the custom requests the BUILD path derived). The
  storefront event pages are cached 60 s like the packages; the e2e uses the seeded jazz event.
  `tenant/messages` has en and es only; French falls back.
- **Tooling:** running `npx prettier --write src` from inside an app ignores the root
  `.prettierignore` and reformats the generated `cuba-provinces.ts`; run prettier from the repo
  root. A JSON round-trip of the catalogs is byte-identical once prettier runs from the root,
  but `tenant/` is prettier-ignored, so format tenant JSON through `--stdin-filepath`.
- **DS 07:** `pnpm e2e` now runs seven projects; run one with `--project=default` or
  `--project=ds07-320`. The fixed bottom nav covers content in full-page screenshots; that is
  the capture, not the page.
- **M9:** a service constructed by hand in a test needs `fakeOperatingSettings()`; an app-level
  test's fake Prisma needs `withNoSettingsVersion(...)`. A function used as a `.map` callback must
  not gain an optional parameter. Client components import `lib/desk-clock.ts`, never
  `lib/operating.ts`. The settings e2e owns `settings-e2e-*@example.test` and "E2E" versions.
- **Dispatch rules:** fakes for `DispatchService` need `availability.findMany` and a
  `dispatchOffer.findMany` filtering by `supplierId: { in }`; the dispatch e2e owns E2EDSP02.
- **M6 and follow-ups:** the M6 e2e owns its two suppliers, E2ESUP01, "E2E M6…" cases and the
  `e2e-m6-power-trail` package; a URL-driven checkbox needs click + wait for the URL.
- `ServiceItem` keeps its `supplierId` after DECLINED/TIMEOUT until re-dispatch.
- **Nest re-raises the signal after its shutdown sequence.** Never leave a
  `process.on('SIGTERM')` listener attached.
- The shell defaults to Node 20: run `nvm use` before every pnpm call (Nest is 12.0.3).
- The dev API runs under `node --watch`, so editing `apps/api/src` restarts it mid-session.
- The M8, M7 and earlier traps still apply (keyed forms after `router.refresh()`; two table rows
  per status-board booking; `/disruptions/alerts` before `/:id`; rebuild a workspace package
  before the dev servers see it; `.next` after a build; `getByLabel` needs `exact`; no
  `prisma format`; append-only affidavits; ICU spaces; `pgrep -f` matches the calling shell;
  filter Mailpit by booking code; to stop `pnpm dev`, signal `@turbo/linux-64/bin/turbo run dev`).
- **AGENTS.md §C lines proposed (owner edit)**, in addition to the earlier ones still pending
  (M7, SIGTERM, document downloads, M8, graceful shutdown, Nest 12, M6, log redaction):
  - "2026-10-24: M10 rides on migration 20261024111639_events_concierge (events, nights, seat
    categories, translations, event_requests; CHECKs on seats 1–8, dates and frozen prices).
    Confirmed seats become EVENT_TICKET/CONCIERGE_FEE price lines; once the price is locked they
    are a TICKETS instalment. Repricing keeps those lines. Desk writes are Operations/Super
    Admin; travelers request under /me/event-requests."
  - "2026-10-24: e2e runs a `default` project plus six `ds07-<width>` projects for
    `e2e/responsive.spec.ts`; run prettier from the repo root (an app-level run ignores
    `.prettierignore`)."
  - "2026-10-24: storefront display preferences (larger text, low-bandwidth) are a device cookie
    `ota_display` read by the layout, never account data. `public/sw.js` answers from a cache
    only when the network fails (the opt-in offline kit, else `/[locale]/offline`); signing out
    deletes the kit. Type sizes are rem, so a size written in px does not scale."
  - "2026-10-25: reduce motion and high contrast are the same device cookie (`reduce-motion`,
    `high-contrast` → `<html data-motion data-contrast>`); the system settings apply the same
    overrides. `e2e/accessibility.spec.ts` runs axe (WCAG 2.2 AA, `@axe-core/playwright`
    4.13.0) plus a unique-id check on customer and desk pages; a new page goes in its list."

## Next
1. Owner: choose the next batch — Phase 8 item 1 (T-Events: the consent-gated client can be built
   against a mock sink; the real sink is Q10), one of M9's deferred items (permission overrides,
   display currencies, runtime feature flags, recovery codes, a passkey policy) or M10's room
   holds/event photos (each needs a migration doc first), or a manual keyboard/screen-reader pass
   on the A-A11y desk rules (shortcuts, alert announcements) that axe cannot decide.
2. Owner, still open: the M4/M5/builder placeholders and the crisis framework, counsel's legal
   texts (now including the events copy and the M10 invoice question), OFAC categories, card
   surcharge, deposit refundability and proof retention, the passport-key backup, the
   backup-power wording, the staff email domain, raster app icons from Vereda, the AGENTS.md §C
   lines above. Then SMS once a provider is chosen.

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
