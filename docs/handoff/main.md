# Handoff — main — updated 2026-09-24 08:15

## Goal
Build the Cuban inbound-tourism OTA platform. Plan: `docs/development-plan.md`;
stack: `docs/adr/0001-stack.md`. Wave 1 (the back-office ERP, ADR 0002 increments
A–E) is done. In Wave 2a the payments mock, storefront map, traveler auth +
dashboard, package builder, recruitment portal, and storefront i18n (es/en/fr)
are all done. What remains of Wave 2a is the checkout page, which is gated by
ADR 0003 (no public mark-paid route until a real signed-webhook provider).
Phase 3 has started with the analytics/BI overview and statutory regulatory
reporting (§4.9.2). Curated packages (Phase 4), the AI assistant abstraction +
mock, and the traveler mock checkout now ship too, so all four 2026-09-23
decisions are implemented. The only remaining AI decision is which real LLM
vendor to wire (a separate Article 2 call); checkout stays link-only until a
signed-webhook provider exists. While those two decisions are pending, the
back-office quality/duty-of-care desk (§4.9.4) was added, including traveler
CSAT reviews and incident severity in the analytics quality KPIs.

## State
- Monorepo: pnpm + Turborepo, TS 6.0.3, ESLint/Prettier, Vitest, GitHub Actions;
  **18 workspace projects** (3 apps, 15 packages).
- Apps: `api` (NestJS, CommonJS), `backoffice`, `storefront` (Next.js 15).
- Packages: domain, schemas, db, auth, config, documents, email, i18n, imports,
  payments, storage, theming, ui.
- Back-office (ADR 0002):
  - **A — reservation pipeline:** list/detail/audit + ops intake (`POST
    /reservations` → DRAFT) and board → workbench.
  - **B — escalation + messaging:** live `/ops` desk + `/conversations` inbox;
    `GET /dispatch/active` + `workerPhone`.
  - **C — compliance:** `packages/storage` backs `POST|GET
    /suppliers/:id/credential`; inspector at `/suppliers/[id]`; expiring endpoint
    + daily BullMQ scan.
  - **D — document depth:** voucher rendezvous + emergency directory, work-order
    emergency protocol, itemised invoice; `emergencyContacts` in the manifest.
  - **E — inventory CMS:** full CRUD. `DELETE /inventory/:id`
    hard-deletes (pricing rules + media cascade, storage objects removed
    best-effort, audited); pricing rules have PATCH/DELETE at
    `/inventory/:id/pricing-rules/:ruleId`; `active=false` stays soft-disable.
    Media is a gallery in the new `inventory_media` table (migration
    `20260922070932_inventory_media`): upload/list/delete at
    `/inventory/:id/media` and `/inventory/media/:mediaId` (ops).
    `InventoryItemDto` gained a `media` array. Availability is supplier-scoped at
    `GET|PUT /suppliers/:id/availability` with a per-day calendar on the supplier
    inspector. Public `GET /catalog` accepts `type`/`province` filters and carries
    media; `GET /catalog/media/:mediaId` is public but refuses inactive items.
    Storefront `/catalog` is dynamic per filter and renders images.
- Wave 2a — **payments mock:** `packages/payments` (`PaymentProvider` +
  `MockPaymentProvider`, no new dependency; ADR 0003). `POST
  /reservations/:id/payments` creates a link and moves `SECURED_AND_INVOICED →
  PENDING_PAYMENT`; `POST .../payments/:paymentId/confirm` (ops/super) marks the
  receipt `PAID` and transitions `PENDING_PAYMENT → CONFIRMED` (documents issue);
  `GET` lists receipts. A `PaymentPanel` on the reservation workbench drives it.
  No public webhook route until a real provider with signature verification.
- Wave 2a — **storefront Cuba map:** `cuba-map.tsx` renders the 16 provinces as
  tokenized buttons (available provinces highlighted, tenant primary on select)
  and filters `/catalog?province=…`; the path data is generated from
  `resources/index.html` by `tools/extract-cuba-map.mjs` into an ignored
  `cuba-provinces.ts` (historical "Ciudad de la Habana" aliased to "La Habana").
- Wave 2a — **traveler auth + dashboard:** API `GET /me`, `GET /me/reservations`,
  `GET /me/reservations/:id` (any authenticated role, scoped to the caller;
  traveler documents omit `storageKey`). Storefront `/login` (magic link),
  `/account` trips list, `/account/reservations/[id]` itinerary + document vault;
  `better-auth` reused as the browser client; the header reads the session so
  storefront pages are dynamic.
- Wave 2a — **dynamic package builder:** `/build` is a five-step wizard
  (dates → stays → transport → experiences → review); `POST /me/reservations`
  creates an ITINERARY_SUBMITTED booking for the caller with service items
  derived from catalog items. `/login?next=` returns the traveler to where they
  started. The booking-code generator is shared at
  `apps/api/src/common/booking-code.ts`.
- Wave 2a — **recruitment:** new `supplier_applications` table (migration
  `20260922122512_supplier_applications`); `POST /supplier-applications` is public
  and only stages; ops approve/reject, and approval creates the `SERVICE_WORKER`
  user + `PENDING_AUDIT` profile. Storefront `/join-our-network`; back-office
  `/applications`.
- Wave 2a — **storefront i18n:** `next-intl` + shared `packages/i18n` catalogs
  (es/en/fr); routes under `app/[locale]` with `localePrefix: 'as-needed'` (default
  `es` unprefixed, `/en` and `/fr` prefixed) and a header locale switcher. Locale
  is detected from `Accept-Language`. `[locale]` routes are dynamic (the shell
  reads the session), so the header and `/account` reflect the live session.
- Phase 3 — **analytics/BI:** pure KPI maths in `packages/domain/src/analytics`
  (`calculateFinance/Operations/Quality/Geography`); `GET
  /analytics/overview?from&to` (ops roles) reduces raw rows into finance (GBV,
  payouts, net revenue, take rate, AOV, by rail), operations (acceptance/timeout,
  avg response, funnel), quality, and geography. Back-office `/analytics`.
- Phase 3 — **regulatory reporting (§4.9.2):** migration
  `20260923063425_regulatory_reporting` adds `User.nationality` (ISO alpha-2) and
  `Reservation.tourismCategory` (enum, default `GENERAL`); both are additive.
  Pure `calculateRegulatory` in `packages/domain/src/analytics/regulatory.ts`
  reduces bookings into bookings/travelers/bed-nights/specialised ratio, the
  category and nationality breakdowns, and geographic circuits. API (ops roles):
  `GET /analytics/regulatory?from&to` and
  `GET /analytics/regulatory/fiscal-export?from&to` (Paid ledger CSV). Capture:
  the ops intake form and the storefront builder accept a nationality, and
  `PATCH /reservations/:id/tourism-category` (audited `reservation.classified`)
  classifies a booking from the workbench control. Back-office `/regulatory`.
- Phase 4 — **curated packages (§3.3):** migration
  `20260923091856_curated_packages` adds `Package` + `PackageService` (services
  FK catalog items) and `Reservation.packageId`. Ops CRUD at `/packages`
  (read: ops roles, write: ops+super; a `services` array replaces the
  itinerary); public `GET /catalog/packages` and `/catalog/packages/:slug`
  (active only). Storefront `/packages` list + `/packages/[slug]` detail with a
  booking form that posts `POST /me/reservations/from-package`; the server
  expands the package into service items and lands `ITINERARY_SUBMITTED`.
  Back-office `/packages` creates/lists/toggles/deletes, and `/packages/[id]`
  edits the details and itinerary (the services array replaces it wholesale).
  Finance KPIs now split revenue/net/take-rate by package type (PACKAGE vs
  CUSTOM) using `Reservation.packageId`. Accommodation-tier selection and
  package media still need a migration (Article 2).
- Phase 3 — **AI assistant (§4.8):** new `packages/ai` (`LlmProvider` +
  deterministic `MockLlmProvider` + `createLlmProvider`, no third-party
  dependency; mirrors the `packages/payments` pattern). Ops-only API:
  `POST /assistant/draft-reply`, `GET /assistant/ops-summary`,
  `POST /assistant/translate`, injected behind `LLM_PROVIDER`. Back-office: a
  "Draft with AI" action on the message thread and an AI operations-summary card
  on `/analytics`. The mock drafts in es/en/fr and only tags translations.
- Phase 4 — **traveler mock checkout (ADR 0003):** `POST
  /me/reservations/:id/payments` (ownership-scoped) creates the link and moves
  `SECURED_AND_INVOICED → PENDING_PAYMENT`; confirmation stays the ops-only
  `POST /reservations/:id/payments/:paymentId/confirm`. Storefront shows
  "Proceed to payment" on the account reservation and lands on
  `/checkout/mock/[reference]`, which has no confirm action.
- Phase 3 — **quality & duty of care (§4.9.4):** no migration — the `Incident`
  model already existed and only analytics counted it. API (ops; writes
  ops+super): `GET /incidents?reservationId&resolved&limit`,
  `POST /reservations/:id/incidents`, `PATCH /incidents/:id/resolve`, and
  `GET /quality/supplier-reliability`. Reliability is reduced from the
  dispatch-offer ledger by the pure `calculateSupplierReliability`
  (`packages/domain/src/dispatch/reliability.ts`). Incidents are audited
  (`incident.logged` / `incident.resolved`). Back-office `/quality` (incidents +
  scorecards) and a Duty-of-care card on the reservation workbench.
- Phase 3 — **CSAT reviews + incident-aware quality KPIs:** no migration (the
  `Review` model existed). Traveler `POST /me/reservations/:id/reviews`
  (ownership-scoped, only when COMPLETED, one per booking, audited
  `review.submitted`); ops `GET /reviews?reservationId&limit`; the me reservation
  detail carries a nullable `review`. Storefront shows a review form on
  COMPLETED; `/quality` lists recent reviews. `calculateQuality` now takes
  incident rows and reports `openIncidentCount` + `highSeverityCount`, shown on
  `/analytics`.
- Phase 3 — **BI exports (§4.9.5):** new `packages/reports` builds the digest
  workbook with exceljs (already a repo dependency; no new third-party).
  `GET /analytics/export/xlsx` and `/analytics/export/pdf` (ops) stream both
  formats (the PDF is `buildAnalyticsHtml` rendered through `DOCUMENT_RENDERER`),
  the `/analytics` page links to them, and a weekly BullMQ job
  (`analytics-digest`, Monday 07:00) emails both to
  `ANALYTICS_DIGEST_EMAIL`/`OPS_NOTIFY_EMAIL` via the new optional
  `EmailMessage.attachments`.
- Phase 7 — **fork tooling:** `pnpm create:tenant --name …` scaffolds
  `tenant/agency.config.json` (validated by `buildTenantManifest` in
  `packages/config`) plus `tenant/assets/`, refusing to overwrite without
  `--force`; `docs/forking.md` documents the upstream-remote workflow. No new
  third-party dependency (`tools/**` is lint/format-ignored like the map tool).
- Phase 7 — **RBAC/security hardening:** `authorization.e2e.test.ts` is a
  table-driven matrix proving every ops/financial/customer route is 401
  unauthenticated and 403 for each role outside its allow-list, that
  SERVICE_WORKER passes the guard on accept/decline, and that `/health` +
  `/tenant/config` stay public. The review also found and fixed an
  over-exposure: the worker accept/decline response now returns only the acting
  worker's own service item (`getView` gained an optional `onlySupplierId`).
- Wave 2a — **storefront messaging + banner:** the account reservation page has a
  traveler ↔ operations thread (`message-thread.tsx`, HTTP `GET/POST
  /reservations/:id/messages`, refresh-on-send — no storefront socket); a
  `promotional-banner.tsx` renders site-wide when the tenant enables
  `culturalEventsBanner`, with copy in `packages/i18n`.
- Web apps reach the API through same-origin Next rewrites; Socket.IO connects
  the browser **directly** to the API (`NEXT_PUBLIC_API_ORIGIN`).
- API dev runner: `node --watch -r @swc-node/register src/main.ts`.
- e2e: 19 spec files / 26 tests (`pnpm e2e`, cached `chromium-1243`).
- Head `849ea73` was the base; the regulatory, curated-package, AI-assistant,
  mock-checkout, quality, CSAT, package-polish, and BI-export increments are
  committed on top.

## Verified
Node 22.22.3, pnpm 12.4.2 (2026-09-23):
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (**258**: api
  153, domain 45, config 11, ai 4, payments 3, reports 4, i18n 2, theming 9,
  documents 8, imports 5, ui 4, email 4, schemas 3, storage 3), `pnpm build` —
  green.
- `pnpm create:tenant --name "Viñales Eco Travel" --license … --out /tmp/…`
  wrote a valid manifest + `assets/README.md`, and refused a re-run without
  `--force` (exit 1) — verified manually.
- `pnpm --filter @ota/db exec prisma migrate dev` created and applied
  `20260923063425_regulatory_reporting` and `20260923091856_curated_packages`
  (10 migrations total).
- `pnpm e2e` — 26 real-browser tests pass, including the BI XLSX + PDF digest
  downloads (session-authenticated requests; the PDF renders through Chromium),
  the curated-package editor (open → save itinerary), the storefront CSAT
  review, the quality spec (log →
  surface → resolve an incident), the AI reply draft from the messaging inbox,
  and the traveler mock checkout (link only, no confirm action), plus the
  curated-package specs (back-office list/create, storefront list → book), the
  two regulatory specs (report render + workbench classification),
  the inventory flow, the supplier availability toggle, the payment link →
  mark-paid → CONFIRMED flow, the storefront map province filter (and banner),
  traveler sign-in → dashboard, the traveler message send, the package builder
  submit, recruitment submit → approve, the locale switch, and the analytics
  dashboard.
- New coverage: `regulatory.test.ts` (4 pure cases), `regulatory.e2e.test.ts`
  (5: summary, window, CSV, 403, 401), `packages.e2e.test.ts` (8: public
  active-only, slug, ops list, create+slug, unknown item, delete, 403, 401), the
  `me.e2e.test.ts` from-package booking cases (3) and payment-link cases (3),
  the reservations classify/nationality tests, `packages/ai` mock tests (4),
  `assistant.e2e.test.ts` (6), `quality.e2e.test.ts` (8) + `reliability.test.ts`
  (2), the `me.e2e.test.ts` review cases (4), `reports.e2e.test.ts` (4) +
  `packages/reports` workbook/HTML tests (4), the `packages/config`
  `buildTenantManifest`/`slugifyTenantId` tests (4), `authorization.e2e.test.ts`
  (4, the RBAC matrix) + the dispatch worker-scope test, the `analytics.test.ts`
  / `analytics.e2e.test.ts` package-type assertions, and the `regulatory.spec.ts` +
  `storefront-packages.spec.ts` + `packages.spec.ts` + `packages-edit.spec.ts` +
  `storefront-checkout.spec.ts` + `storefront-review.spec.ts` + `quality.spec.ts`
  + `messages.spec.ts` (AI draft) browser specs.
  Earlier: the storefront message send and the cultural-events banner
  assertion (both in `storefront-auth.spec.ts` / `storefront.spec.ts`);
  `analytics.test.ts` (6 pure KPI cases) and
  `analytics.e2e.test.ts` (4: overview, window, 403, 401),
  `packages/i18n` key-parity test, `storefront-i18n.spec.ts`,
  `supplier-applications.e2e.test.ts` (7), `me.e2e.test.ts` (8),
  `payments.test.ts` (3), `payments.e2e.test.ts` (8),
  `inventory.service.test.ts` (13), `catalog.e2e.test.ts` (3),
  `suppliers.e2e.test.ts` (14).

Not verified: outbound credential-expiry notifications (the scan logs only); a
live escalation event round-trip (the `/ops` handshake is tested, not an event);
the PDF branch of the credential inspector (the image branch is); dispatch
start/candidates and import commit through the UI (covered over HTTP/unit only);
passkeys; worker accept/decline against a real database. Storefront browser
flows are covered (map, auth, builder, i18n, recruitment).

## Assumptions & unknowns
- Catalog media content type is derived from the storage-key extension, so no
  content-type column exists (same precedent as credentials).
- Availability remains supplier-scoped; there is no inventory-item availability
  link (the `Availability` model has only `supplierId`).
- The storefront `/catalog` is dynamic (reads `searchParams`), so each filter
  combination is server-rendered; the underlying `/catalog` fetch is still cached
  for 60s, so CMS edits land within ~1 minute.
- Payments run on the mock adapter; confirmation is an authenticated ops action,
  not a gateway webhook. The mock `checkoutUrl` base is `PAYMENT_CHECKOUT_BASE_URL`
  (storefront origin) and stays informational until a `/checkout` page exists.
- Authorisation stays API-only; the UI hides controls by role but is not a
  security boundary.
- e2e writes E2E-owned fixtures to the dev DB; `global-setup.ts` resets the
  reservation, clears its audit/messages, restores the guide supplier, deletes
  `E2E `-prefixed inventory items, and clears the 15th-of-month availability
  override.
- Documents still itemise included services without per-service prices; voucher
  rendezvous is province + start time.
- Regulatory bed-nights are per booking (accommodation service-item nights): there
  is no party-size field, so a true guests × nights figure needs a further
  migration decision. The fiscal CSV is a plain PAID-receipt ledger, not an
  ONAT-formatted filing; commission/withholding formatting needs finance input.
- `Reservation.tourismCategory` defaults to GENERAL; there is no automatic
  classifier yet, so operators classify specialised bookings by hand (intake
  form or the workbench control).

## Traps
- API dev must stay swc-based (`node --watch -r @swc-node/register`); tsx/esbuild
  emits no `design:paramtypes` and Nest DI throws `UndefinedDependencyException`.
- Keep the back-office on Next same-origin rewrites; do not add CORS.
- WebSocket features bypass Next (rewrites do not proxy WS upgrades) and connect
  the browser to the API origin.
- Inventory route order matters: static `media/:mediaId` is declared before the
  `:id` routes in `inventory.controller.ts`.
- `PAYMENT_PROVIDER` lives in `payments.tokens.ts`, not the module: importing it
  from `payments.module.ts` into `payments.service.ts` is a circular import that
  resolves the token to `undefined` and breaks Nest DI.
- `pnpm e2e` starts `pnpm dev` via Playwright's `webServer`, but its turbo-spawned
  children are **not** torn down here — ports 3000–3002 stay listening after a
  successful run. Kill them (`ps aux | grep next`; the API `node --watch` tree)
  before `pnpm build`, which clobbers `.next`.
- Running `pnpm build` immediately before `pnpm e2e` leaves a production `.next`;
  the first `next dev` SSR of a route can then render "Application error … Digest"
  once. Delete `apps/storefront/.next` and `apps/backoffice/.next` before e2e when
  a build just ran.
- BullMQ 6 has no `repeat` on `JobsOptions`; repeatable jobs use
  `queue.upsertJobScheduler`.

## Next
1. **Phase 4 storefront remainder:** package follow-ups that need a migration
   (Article 2) — accommodation-tier selection and package media; the catalog/map
   do not yet show real-time availability. Checkout is link-only until a real
   signed-webhook provider is selected. The back-office package editor and the
   §4.9.1 package-type revenue/margin split shipped 2026-09-23.
2. **Phase 3 remainder:** select a real LLM vendor and wire it behind
   `packages/ai`'s `LlmProvider` (new dependency → Article 2). The weekly
   XLSX + PDF BI digests shipped 2026-09-23. A true guests × nights bed-nights
   figure still needs a party-size migration.
3. **Phase 7 hardening:** `create-tenant` + fork docs and the RBAC matrix +
   worker-response scoping shipped (2026-09-23/24). Remaining — rate limiting,
   a PII-at-rest review (no passport field exists yet), observability/runbooks,
   load tests, and Changesets core versioning (deferred; would add a dev tool).
4. Mobile apps (Phases 5–6) need Expo (Article 2).
5. Extend e2e: dispatch start/candidates, import commit, intake form, live
   escalation event round-trip.

## Decisions (append-only)
- 2026-09-20 — fork-per-agency template over runtime multi-tenancy.
- 2026-09-20 — TypeScript pinned to 6.x; Prisma pinned to 6.x.
- 2026-09-20 — spec §4.2 reservation statuses are canonical over §6.2.
- 2026-09-20 — reference-slice-first, then auth.
- 2026-09-20 — official `better-auth` only; community NestJS wrapper rejected.
- 2026-09-20 — secure-by-default global `AuthGuard` with `@Public()`.
- 2026-09-20 — Better Auth in an ESM `packages/auth`, loaded via dynamic import.
- 2026-09-20 — dispatch offers are an append-only `DispatchOffer` ledger.
- 2026-09-20 — dispatch timeouts go through a `DispatchScheduler` interface.
- 2026-09-20 — escalation via an `EscalationPublisher` interface (Socket.IO impl).
- 2026-09-20 — `ServiceItem.province` drives eligibility via `coversProvince`.
- 2026-09-20 — inventory catalog + `PricingRule`; pure domain `calculatePrice`.
- 2026-09-20 — documents rendered from HTML via Playwright Chromium, behind
  `DocumentRenderer`/`DocumentStorage` interfaces; generation on CONFIRMED is
  best-effort and never rolls back the transition.
- 2026-09-20 — transactional email lives in `packages/email`; magic-link uses it.
- 2026-09-20 — tenant manifest at `tenant/agency.config.json`, loaded into the
  global `TENANT_CONFIG`; public `GET /tenant/config`.
- 2026-09-20 — bulk import parses CSV/XLSX in `packages/imports` (exceljs) and
  stages in `import_batches`.
- 2026-09-21 — design-token contract lives in `packages/theming`
  (`THEME_TOKEN_KEYS`); `packages/ui` owns the preset and fallbacks.
- 2026-09-21 — the back-office proxies auth + API through Next same-origin
  rewrites instead of enabling CORS on the Nest API.
- 2026-09-21 — added `GET /reservations` (ops roles) so the dashboard reads the
  pipeline without introducing any write path.
- 2026-09-21 — switched the API dev runner from `tsx` to `@swc-node/register`
  under `node --watch`.
- 2026-09-21 — e2e uses `@playwright/test` against the cached `chromium-1243`
  bundle; Playwright's `webServer` starts `pnpm dev`.
- 2026-09-21 — the storefront reads a public `GET /catalog` (active items only)
  instead of opening the ops `GET /inventory`.
- 2026-09-21 — `docs/adr/0002-back-office-priority.md`: finish the back-office
  operator surface (increments A–E) before storefront expansion.
- 2026-09-21 — the reservation read model is a pipeline; ops intake
  `POST /reservations` creates DRAFT with a generated 8-char booking code.
- 2026-09-21 — the dashboard is a status board that deep-links to a workbench.
- 2026-09-21 — escalation desk and messaging inbox connect the browser directly
  to the API over Socket.IO (`NEXT_PUBLIC_API_ORIGIN`).
- 2026-09-21 — `GET /dispatch/active` and `workerPhone` feed the live desk.
- 2026-09-21 — the BullMQ timeout-firing integration test uses a unique queue name.
- 2026-09-21 — credentials live behind `packages/storage`; served only through an
  authorised API route — no public URLs.
- 2026-09-21 — credential content type is derived from the key extension so no
  column/migration was needed.
- 2026-09-21 — the 30-day credential scan is a BullMQ repeatable job
  (`upsertJobScheduler`, daily 06:00).
- 2026-09-21 — duty-of-care contacts live in the tenant manifest; core ships no
  agency phone numbers.
- 2026-09-21 — the traveler invoice itemises included services; `payoutRate` is
  work-order only.
- 2026-09-21 — voucher "rendezvous" is province + start time.
- 2026-09-22 — catalog media is a first-class `inventory_media` gallery table
  (approved migration) rather than an `attributes` JSON key; media is served only
  through API routes, and the public route refuses inactive items.
- 2026-09-22 — `DELETE /inventory/:id` hard-deletes (cascades pricing rules +
  media, removes storage objects best-effort, audited); `active=false` remains the
  soft-disable path.
- 2026-09-22 — availability reuses the existing supplier-scoped `Availability`
  model (worker availability, spec §5.2); no per-inventory-item availability link.
- 2026-09-22 — payments are provider-agnostic in `packages/payments`
  (`PaymentProvider` + `MockPaymentProvider`, ADR 0003); the mock ships first
  because real rails wait on provider/legal clearance, and it adds no dependency.
- 2026-09-22 — creating a payment link is the event that moves
  `SECURED_AND_INVOICED` → `PENDING_PAYMENT`; confirming the receipt drives
  `PENDING_PAYMENT` → `CONFIRMED` through `ReservationsService.transition`, so the
  state machine and document generation stay in one place.
- 2026-09-22 — no public payment webhook until a real provider implements
  signature verification; the mock confirmation is an authenticated ops action.
- 2026-09-22 — the Cuba map is a tokenized React component over path data
  generated from `resources/index.html` (not a copied SVG blob), so provinces are
  real buttons and the tenant primary token drives the selection; historical
  province labels are aliased to the catalog's names.
- 2026-09-22 — traveler self-service reads live under `/me`, always scoped to the
  caller; the traveler document DTO omits `storageKey`, and downloads keep using
  the owner-allowed `GET /documents/:id/download`.
- 2026-09-22 — the storefront reuses the existing `better-auth` browser client
  (no new dependency) and resolves the session server-side by forwarding cookies
  to `/api/auth/get-session`; the root header reads the session, so storefront
  pages are dynamic and the storefront is not a security boundary.
- 2026-09-22 — the package builder submits to `POST /me/reservations` and creates
  ITINERARY_SUBMITTED for the caller (not DRAFT); each ServiceItem's type,
  province, and price are derived server-side from the catalog item.
- 2026-09-22 — the ops and storefront booking-code generators were unified into
  `apps/api/src/common/booking-code.ts` (retry-on-collision stays at each call
  site because only it can query the database).
- 2026-09-22 — supplier recruitment stages a `supplier_applications` row first;
  only operator approval creates the User + SupplierProfile, so a public
  submission never writes to Better Auth's user table.
- 2026-09-22 — storefront i18n uses `next-intl` with `app/[locale]` and
  `localePrefix: 'as-needed'` (tenant default `es` unprefixed); catalogs live in
  `packages/i18n`. `i18next` is deferred until the mobile app consumes it, so it
  is not an unused dependency today.
- 2026-09-22 — the `[locale]` layout/pages stay dynamic (the shell reads the
  session); `generateStaticParams` was removed so the header and `/account` are
  not frozen into a static shell without a session.
- 2026-09-22 — locale is detected from `Accept-Language`; e2e pins the browser
  locale (`test.use({ locale: 'es' })`) or navigates the `/en` prefix.
- 2026-09-22 — BI maths is pure and lives in `packages/domain/src/analytics`; the
  API only fetches raw rows and reduces them, so the KPI definitions are
  unit-tested and framework-agnostic.
- 2026-09-22 — GBV is the sum of `PAID` `PaymentReceipt.amount`; supplier payouts
  sum `ServiceItem.payoutRate` by `payoutStatus`; `takeRate = netRevenue / GBV`.
  The overview range filters on `createdAt`.
- 2026-09-22 — regulatory reporting (MINTUR nationalities/bed-nights, ONAT
  exports, ecotourism ratio) is deferred: the schema has no nationality or
  booking-taxonomy fields, so claiming those reports would require a migration.
- 2026-09-22 — the storefront message thread reloads on send instead of opening
  the `/conversations` socket (that socket is a back-office concern); the API's
  async email fallback still fires on every send.
- 2026-09-22 — the promotional banner is gated by the tenant
  `culturalEventsBanner` flag; its copy lives in `packages/i18n`, not in code.
- 2026-09-23 — curated packages will be a real `Package`/`PackageService` bundle
  model (migration) that expands into the existing Reservation/ServiceItem
  pipeline, not tagged inventory via `attributes` (owner decision).
- 2026-09-23 — the regulatory migration is approved: `User.nationality` +
  `Reservation.tourismCategory` only; bed-nights derive from accommodation
  service-item dates. Party size is deferred.
- 2026-09-23 — the AI assistant ships as a provider-agnostic
  `packages/ai` abstraction plus a deterministic mock first; a real LLM SDK is
  deferred to a separate Article 2 decision (owner decision).
- 2026-09-23 — checkout will be a traveler-facing mock that only creates the
  payment link; confirmation stays the authenticated ops action, so ADR 0003's
  no-public-mark-paid rule holds (owner decision).
- 2026-09-23 — regulatory reporting (§4.9.2) shipped as a read-only ops surface:
  pure `calculateRegulatory`, `GET /analytics/regulatory` + `fiscal-export`,
  capture at intake/builder and via `PATCH /reservations/:id/tourism-category`.
- 2026-09-23 — curated packages shipped as `Package`/`PackageService` +
  `Reservation.packageId`; booking expands services into the existing
  Reservation/ServiceItem pipeline via the shared `MeService.createSubmission`,
  so dispatch and documents are untouched. `attributes` JSON was not used.
- 2026-09-23 — package itineraries are replaced wholesale on PATCH (delete +
  recreate services) rather than diffed, because the editor submits the full
  list at once; service-level PATCH endpoints were not added.
- 2026-09-23 — accommodation-tier selection, package media, the service-editing
  UI, and the package-type analytics split are deferred follow-ups, not
  half-built features.
- 2026-09-23 — the AI assistant shipped as `packages/ai` (`LlmProvider` +
  deterministic mock) behind the `LLM_PROVIDER` token, with ops-only
  draft/summary/translate endpoints; no new dependency. Selecting a real vendor
  is a separate Article 2 decision.
- 2026-09-23 — the mock's `summarize` is templated and `translate` only tags the
  target locale; neither is a real model, and the code/comments say so.
- 2026-09-23 — traveler checkout is link-only: an ownership-scoped POST creates
  the intent and moves the booking to PENDING_PAYMENT, but confirmation stays
  the authenticated ops action and `/checkout/mock/[reference]` has no confirm
  control (ADR 0003 holds).
- 2026-09-23 — the quality/duty-of-care desk reuses the existing `Incident`
  model (no migration); incident writes are audited and reliability scorecards
  are derived from the dispatch-offer ledger by a pure domain function.
- 2026-09-23 — Reviews stay read-only for now: a traveler review/CSAT submission
  flow is a storefront concern and a separate increment.
- 2026-09-23 — the CSAT review flow shipped (one review per COMPLETED booking,
  audited `review.submitted`), superseding the read-only note above;
  `calculateQuality` now takes incident rows and reports open/high-severity
  counts.
- 2026-09-23 — the §4.9.1 package-type split buckets paid receipts and payouts
  by `Reservation.packageId` (null = CUSTOM); per-type net = gross − that type's
  accrued/settled payouts. Margin by type is therefore only as complete as the
  payout ledger.
- 2026-09-23 — the back-office package editor replaces the itinerary wholesale
  through the existing PATCH (no service-level endpoints), consistent with the
  earlier package PATCH decision.
- 2026-09-23 — the BI digest is a new `packages/reports` (exceljs reused, no new
  third-party dependency), delivered both on demand and weekly by email; the
  workbook is the single source of the layout, the API only fetches figures.
- 2026-09-23 — `EmailMessage.attachments` was added as an optional field so the
  weekly digest can be attached; existing mailers and templates are unaffected.
- 2026-09-23 — the PDF digest reuses the existing HTML layout
  (`buildAnalyticsHtml`) and the `DOCUMENT_RENDERER` (Playwright Chromium)
  rather than a second templating path; the weekly email now attaches both
  formats, and the API test overrides the renderer to avoid launching a browser.
- 2026-09-23 — `create-tenant` keeps the CLI in `tools/` (lint/format-ignored,
  like the map tool) and the pure, validated manifest builder in
  `packages/config`; the root gains `@ota/config` as a devDependency so a
  `pnpm build` makes the tool resolvable.
- 2026-09-23 — Changesets-based core versioning stays deferred (it would add a
  dev-time dependency); forks pin the upstream commit they last merged.
- 2026-09-24 — `authorization.e2e.test.ts` is the canonical RBAC registry; a new
  controller route is not "done" until it is in the matrix.
- 2026-09-24 — a worker's accept/decline response is scoped to that worker's own
  service item (privacy fix found by the review); operations views stay
  unscoped. `POST /suppliers/:id/credential` stays `READ_ROLES` (support may
  upload), now explicit in the matrix.
