# Handoff — main — updated 2026-09-26 17:20

## Goal
Build the Cuban inbound-tourism OTA platform — a fork-per-agency white-label
monorepo. Plan: `docs/development-plan.md` (the original baseline; the next
session is asked to **rework it against actual status** — see
`docs/next-session-prompt.md`); stack: `docs/adr/0001-stack.md`.

Waves 1 and 2a are done: the back-office ERP (ADR 0002 A–E), the recurring
reservation/dispatch/escalation pipeline, inventory CMS, legal documents,
messaging, bulk import, compliance, analytics/BI + statutory regulatory
reporting, curated packages, quality/duty-of-care + CSAT, the AI assistant mock,
and the storefront (catalog + Cuba map, traveler auth/dashboard, package
builder, recruitment portal, i18n es/en/fr). Phase 6's GDPR retention lifecycle
ships end to end (`docs/adr/0004-data-retention.md`), including Tier 1 free-text
PII scrubbing (`docs/pii-at-rest-review.md`). Phase 7 has a readiness probe,
`docs/runbook.md`, rate limiting, and the RBAC matrix.

Payments: manual **wire transfer** is the primary rail
(`docs/adr/0005-payment-rails.md`); the TropiPay card rail is deferred until the
agency's legal documents exist. Open decisions: a real LLM vendor, PII purge
Tiers 2–3, migration-gated package items, Expo mobile, real-time map
availability, load tests, and observability.

## Status analysis (2026-09-26)

Detailed done/remaining snapshot. Counts: 18 workspaces (3 apps, 15 packages),
11 migrations, 300 unit tests, 31 e2e tests — all green.

### Done since upstream base `849ea73` (16 increments, in order)
1. **Regulatory reporting (§4.9.2).** Migration
   `20260923063425_regulatory_reporting` (`User.nationality`,
   `Reservation.tourismCategory`); pure `calculateRegulatory`;
   `GET /analytics/regulatory` + `/fiscal-export` CSV;
   `PATCH /reservations/:id/tourism-category`; back-office `/regulatory`.
2. **Curated packages (§3.3).** Migration
   `20260923091856_curated_packages` (`Package`, `PackageService`,
   `Reservation.packageId`); ops CRUD `/packages`; public `/catalog/packages`;
   `POST /me/reservations/from-package`; storefront `/packages` + booking.
3. **AI assistant, mock first (§4.8).** `packages/ai` (`LlmProvider` +
   `MockLlmProvider`); ops `POST /assistant/draft-reply`, `GET
   /assistant/ops-summary`, `POST /assistant/translate`; back-office draft
   button + summary card.
4. **Traveler mock checkout (ADR 0003).** Ownership-scoped
   `POST /me/reservations/:id/payments`; `/checkout/mock/[reference]` with no
   confirm action.
5. **Quality & duty of care (§4.9.4).** Incident log/resolve + supplier
   reliability scorecards; back-office `/quality`; workbench Duty-of-care card.
6. **CSAT reviews + incident-aware quality KPIs.** One review per COMPLETED
   booking (`POST /me/reservations/:id/reviews`), ops `GET /reviews`;
   `calculateQuality` now reports open/high-severity incidents.
7. **Package editor + package-type analytics (§4.9.1).** `/packages/[id]`
   itinerary editor; `calculateFinance.byPackageType` (PACKAGE vs CUSTOM).
8. **BI exports (§4.9.5).** `packages/reports` XLSX + PDF;
   `GET /analytics/export/xlsx|pdf`; weekly BullMQ digest email with
   attachments; optional `EmailMessage.attachments`.
9. **Fork tooling (Phase 7).** `pnpm create:tenant` +
   `packages/config.buildTenantManifest`; `docs/forking.md`.
10. **RBAC/security hardening (Phase 7).** `authorization.e2e.test.ts` route
    matrix; fixed an over-exposure so a worker's accept/decline response is
    scoped to their own service item.
11. **GDPR retention lifecycle (§3.5, Phase 6, 2026-09-24).** Migration
    `20260924065637_retention_lifecycle` (`Reservation.completedAt` indexed and
    backfilled from audit, `User.retentionNoticeSentAt`); pure retention rules in
    `packages/domain/src/retention`; a daily BullMQ scan at 05:00 that emails a
    keep-alive notice 6 months after the latest completion and anonymizes after
    a 30-day grace with no consent; a stateless HMAC keep-alive link; ops
    `GET /retention/pending` + `POST /retention/scan`; the back-office
    `/retention` desk. `docs/adr/0004-data-retention.md`. A live-Postgres
    integration test (`retention.integration.test.ts`, `RUN_DB_INTEGRATION=1`)
    proves notice → consent → anonymize against the dev DB.
12. **Readiness probe + runbook (Phase 7, 2026-09-24).** Split `/health`
    (liveness) from `GET /health/ready` (Postgres `SELECT 1`, plus Redis `PING`
    when `REDIS_URL` is set; 200/503, no error detail). `docs/runbook.md`
    documents the service map, scheduled jobs, and incident playbooks.
13. **Deeper e2e (2026-09-24).** Browser specs for the dispatch engine
    (candidates + start offer), bulk import (stage → map → commit), ops intake,
    and a live `/ops` dispatch event; shared DB fixture helpers in
    `e2e/fixtures.ts`.
14. **Wire-transfer payment rail (2026-09-25, ADR 0005).** `BankTransferProvider`
    + a rail→provider map (`createPaymentProviders`); the storefront's
    "Proceed to payment" now lands on `/checkout/wire/<ref>` with the agency's
    bank details from `tenant/agency.config.json` `payments.bankTransfer`
    (schema in `packages/config`); ops confirmation unchanged. The page gets the
    authoritative amount/booking code from the public PII-free
    `GET /payments/intents/:ref`. Card stays on the mock pending TropiPay.
    `pnpm create:tenant` / `buildTenantManifest` scaffold the block via
    `--account-name/--bank/--iban/--bic/--reference-note`.
15. **Rate limiting (2026-09-25, Phase 7).** Dependency-free Express
    middleware (`apps/api/src/common/rate-limit.ts`) mounted in `main.ts` before
    the Better Auth handler, so `/api/auth` is covered too; fixed-window,
    in-memory, per process. `/health*` skipped; `/api/auth/get-session` keeps the
    normal limit while credential endpoints get the stricter one; `TRUST_PROXY`
    supported.
16. **PII-at-rest review + Tier 1 purge (review 2026-09-25, Tier 1 2026-09-26).**
    `docs/pii-at-rest-review.md` maps every PII location and recommends a tiered
    scope (G1–G10); Tier 1 is implemented in `RetentionService.anonymize`:
    reservation-scoped free text (messages/reviews/incidents/decline reasons/
    `customItineraryPayload` notes/PII keys in audit metadata) is redacted and
    Better Auth `Verification` rows for the old email are deleted. Tier 2
    (generated PDFs) and Tier 3 (supplier applications/PII/credentials, import
    batches) remain.

### Remaining
**Blocked on a human decision**
- Real LLM vendor behind `packages/ai` (new dependency → Article 2).
- **Real-time catalog/map availability (Phase 4).** A product call on what
  province-level "available" means; there is no inventory ↔ availability link.
- **TropiPay card rail** (ADR 0005): DEFERRED — creating a TropiPay business
  account requires the agency's legal documents, which the owner does not have
  yet. Wire transfer remains the sole live rail; card stays on the mock. No code
  depends on this; resume when the documents and account exist.

**Blocked on a migration (Article 2)**
- Accommodation-tier selection for packages (`PackageService.tier`).
- Package media (a `PackageMedia` table; images already work for inventory).
- Party-size bed-nights (`Reservation.partySize`) for a true guests × nights
  regulatory figure.

**Unblocked (no decision or migration needed)**
- **Observability (Phase 7).** Structured pino logs, liveness `/health`, a
  readiness `/health/ready`, and `docs/runbook.md` exist. Still open: Sentry or
  OpenTelemetry metrics/tracing, and alerting on readiness/queue depth.
- **Rate limiting (Phase 7).** Done 2026-09-25 as hand-rolled Express middleware
  (no dependency); a shared store is still needed for multi-instance deploys.
- **PII purge scope (Phase 7) — Tier 1 done, Tiers 2–3 open.** Tier 1 free-text
  scrubbing shipped 2026-09-25 (`docs/pii-at-rest-review.md`). Remaining:
  generated PDFs (Tier 2, needs legal input on fiscal retention), supplier
  applications / supplier PII + credentials, and import batches (Tier 3).
- **Load tests (Phase 7).** Not started.
- **E2E depth.** Dispatch start/candidates, bulk-import commit, ops intake, and
  a live `/ops` dispatch event are now browser-exercised (2026-09-24). Remaining
  UI-only gaps: worker accept/decline, timeout firing, and passkeys.
- **Mobile apps (Phase 5–6).** `worker-app`, `traveler-app`, `admin-app` — Expo
  is a new dependency (Article 2). Nothing started.
- **Core versioning.** Changesets deferred (dev-time tool); forks pin commits.
- **Polish.** Per-supplier reviews / NPS, package accommodation tiers, storefront
  messaging over a socket (today it is refresh-on-send).

## State
- Monorepo: pnpm + Turborepo, TS 6.0.3, ESLint/Prettier, Vitest, GitHub Actions;
  **18 workspace projects** (3 apps, 15 packages).
- Apps: `api` (NestJS, CommonJS), `backoffice`, `storefront` (Next.js 15).
- Packages (15): domain, schemas, db, auth, config, documents, email, i18n,
  imports, payments, reports, ai, storage, theming, ui.
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
- Phase 4 — **wire-transfer rail (ADR 0005):** `createPaymentProviders` maps
  `OPEN_BANKING_SEPA`/`OTHER` → `BankTransferProvider` and `CARD` → the mock
  until TropiPay. A wire intent returns `wire_<uuid>` and
  `<base>/checkout/wire/<ref>` (no query params); the storefront page reads the
  authoritative amount/booking code from the public PII-free
  `GET /payments/intents/:ref` and renders `tenant.payments.bankTransfer`
  (account name, bank, IBAN, BIC, reference note). No gateway, no state-changing
  public callback; ops "Mark paid" confirms.
  The storefront's "Proceed to payment" requests SEPA, so it now lands on the
  wire page. `packages/config` validates the optional `payments.bankTransfer`
  block; `tenant/agency.config.json` holds the demo placeholders.
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
- Phase 6 — **GDPR retention lifecycle (§3.5):** migration
  `20260924065637_retention_lifecycle` adds `Reservation.completedAt` (indexed;
  set when `transition` enters COMPLETED; backfilled from the
  `reservation.transition` audit rows) and `User.retentionNoticeSentAt`. Pure
  rules live in `packages/domain/src/retention` (6-month trigger, 30-day grace,
  12-month extension). `apps/api/src/retention` runs a daily BullMQ scan (05:00,
  queue `retention-lifecycle`) that emails a keep-alive notice and, after the
  grace with no consent, anonymizes the traveler in place: email →
  `anonymized+<userId>@anonymized.invalid`, `fullName`/`phone`/`image`/`nationality`
  nulled, sessions/accounts/passkeys revoked, while Reservation/ServiceItem/
  PaymentReceipt/AuditLog rows are kept for fiscal aggregates. The link is a
  stateless HMAC-SHA256 token (AUTH_SECRET) verified at public
  `GET /retention/keep-alive` (returns branded HTML; 400 invalid/expired, 409
  already anonymized), which sets `retentionConsentGrantedAt`. Ops
  `GET /retention/pending` + `POST /retention/scan`; back-office `/retention`
  desk.
- Phase 7 — **readiness + runbook:** `apps/api/src/health` splits
  `GET /health` (liveness; never touches dependencies) from `GET /health/ready`
  (Postgres `SELECT 1`, plus Redis `PING` when `REDIS_URL` is set; 200/503, no
  error detail). The Redis probe is behind the `REDIS_HEALTH` token
  (`IoredisHealth`, Noop in tests) and closes on module destroy.
  `docs/runbook.md` covers the service map, scheduled jobs (retention 05:00,
  compliance 06:00, BI digest Mon 07:00, dispatch timeouts), incident playbooks,
  secrets, and backups.
- Phase 7 — **rate limiting:** dependency-free fixed-window Express middleware
  (`apps/api/src/common/rate-limit.ts`) mounted in `main.ts` *before* the Better
  Auth handler, so `/api/auth` is covered as well as Nest routes. Normal limit
  `RATE_LIMIT_MAX` 600/min per IP; credential endpoints `RATE_LIMIT_AUTH_MAX`
  30/min; `/health*` skipped; `TRUST_PROXY` supported. In-memory per process.
- Wave 2a — **storefront messaging + banner:** the account reservation page has a
  traveler ↔ operations thread (`message-thread.tsx`, HTTP `GET/POST
  /reservations/:id/messages`, refresh-on-send — no storefront socket); a
  `promotional-banner.tsx` renders site-wide when the tenant enables
  `culturalEventsBanner`, with copy in `packages/i18n`.
- Web apps reach the API through same-origin Next rewrites; Socket.IO connects
  the browser **directly** to the API (`NEXT_PUBLIC_API_ORIGIN`).
- API dev runner: `node --watch -r @swc-node/register src/main.ts`.
- e2e: 23 spec files / 31 tests (`pnpm e2e`, cached `chromium-1243`).
- Head `849ea73` was the base; the regulatory, curated-package, AI-assistant,
  mock-checkout, quality, CSAT, package-polish, and BI-export increments are
  committed on top.

## Verified
Node 22.22.3, pnpm 12.4.2 (2026-09-25):
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (**300**: api
  177, domain 54, config 13, theming 11, documents 8, email 5, imports 5, ai 4,
  reports 4, ui 5, payments 6, schemas 3, storage 3, i18n 2), `pnpm build` —
  green. (3 api tests skipped without Redis/DB — compliance + dispatch BullMQ and
  the retention DB integration — plus 1 storage test skipped without S3.)
- Health/readiness: `health.test.ts` (8: liveness ignores dependencies; ready
  200/503; service up/down/skipped + close) and `/health/ready` asserted public
  in the authorization matrix. Live smoke with the stack up:
  `GET /health/ready` returns
  `{"status":"ok","checks":{"database":{"status":"up"},"redis":{"status":"up"}}}`.
- Retention live proof: `RUN_DB_INTEGRATION=1 pnpm --filter @ota/api exec vitest
  run test/retention.integration.test.ts` — against the dev Postgres it sent the
  6-month notice, recorded the keep-alive consent, anonymized after the grace,
  and left the reservation intact. It now also asserts **Tier 1**: message body
  → `[redacted]`, review comment → null (rating kept), incident description →
  `[redacted]` (severity kept), service-item decline reason → null,
  `customItineraryPayload` → null, `Verification` rows for the old email
  deleted, and audit `metadata.reason` stripped. The default `pnpm test` skips
  it (177 api passed, 3 skipped).
- Wire-transfer rail: `packages/payments` tests (6: mock + wire intent URL,
  operator confirmation, rail map) and `packages/config`/`i18n` green;
  `me.e2e.test.ts` asserts SEPA → `/checkout/wire/wire_`; `payments.e2e.test.ts`
  keeps CARD → `/checkout/mock/` and covers the public intent lookup (200 by
  reference, 404 unknown) plus the auth-matrix public assertion. `pnpm e2e`
  passes 31; the storefront wire page asserts the authoritative `EUR 200.00`,
  the booking reference, the bank details, and no confirm action.
- Rate limiting: `rate-limit.test.ts` (6: limit + 429, window reset, credential-
  only strict bucket, per-client keys, `skip`, sweep). `pnpm e2e` passes 31 with
  the limiter mounted; `playwright.config.ts` raises the limits via env so the
  suite is never throttled.
- `pnpm --filter @ota/db exec prisma migrate dev` created and applied
  `20260924065637_retention_lifecycle` (11 migrations total). Read-only
  Postgres checks confirm `reservations.completed_at` and
  `users.retention_notice_sent_at` exist and the migration row is applied.
- `pnpm create:tenant --name "Viñales Eco Travel" --license … --out /tmp/…`
  wrote a valid manifest + `assets/README.md`, and refused a re-run without
  `--force` (exit 1) — verified manually (earlier increment). Re-verified with
  `--account-name/--bank/--iban/--bic/--reference-note`: the manifest carries
  `payments.bankTransfer`; without them it is `null`; a partial set errors.
- Live: after `pnpm dev` the BullMQ scheduler registered the
  `retention-lifecycle` repeat job in Redis (`bull:retention-lifecycle:repeat`
  with a delayed `retention-scan`).
- `pnpm e2e` — 31 real-browser tests pass, adding the dispatch engine
  (candidates + start offer), bulk-import commit, ops intake, and a live `/ops`
  dispatch event to the `/retention` desk spec and the existing BI XLSX + PDF
  digest
  downloads (session-authenticated requests; the PDF renders through Chromium),
  the curated-package editor (open → save itinerary), the storefront CSAT
  review, the quality spec (log →
  surface → resolve an incident), the AI reply draft from the messaging inbox,
  and the traveler wire-instructions checkout (no confirm action), plus the
  curated-package specs (back-office list/create, storefront list → book), the
  two regulatory specs (report render + workbench classification),
  the inventory flow, the supplier availability toggle, the payment link →
  mark-paid → CONFIRMED flow, the storefront map province filter (and banner),
  traveler sign-in → dashboard, the traveler message send, the package builder
  submit, recruitment submit → approve, the locale switch, and the analytics
  dashboard.
- New coverage (2026-09-24): `packages/domain/test/retention.test.ts` (9:
  6-month trigger, cycle/extension, grace purge, status labels), the
  `packages/email` retention-notice template test (deadline + keep-alive link),
  `retention.e2e.test.ts` (5: notice at 6 months + audit, no notice before,
  anonymize + credential revocation, keep-alive consent cancels the purge, ops
  pending list) and `retention-token.test.ts` (4: round-trip, tampered, wrong
  secret, expired). Earlier:
  `regulatory.test.ts` (4 pure cases), `regulatory.e2e.test.ts`
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

Not verified: outbound credential-expiry notifications (the scan logs only);
the PDF branch of the credential inspector (the image branch is); passkeys;
worker accept/decline through the UI and the timeout firing through the UI
(covered at the service/unit level and over HTTP). Storefront browser flows are
covered (map, auth, builder, i18n, recruitment), as are dispatch
start/candidates, import commit, ops intake, and a live `/ops` event. The
retention notice/consent/anonymize path is now proven against the dev Postgres
(`RUN_DB_INTEGRATION=1`); the BullMQ schedule is observed live in Redis.

Not asserted in `apps/api/test/authorization.e2e.test.ts` (the canonical RBAC
matrix): the `/me/*` self-service routes, `GET /documents/:id/download`,
`GET /inventory/media/:mediaId`, and the public `POST /supplier-applications` /
`GET /catalog*` routes. They are covered by other specs and over HTTP, but the
working rule ("a controller route is not done until it is in the matrix") says
they should be added.

## Assumptions & unknowns
- Catalog media content type is derived from the storage-key extension, so no
  content-type column exists (same precedent as credentials).
- Availability remains supplier-scoped; there is no inventory-item availability
  link (the `Availability` model has only `supplierId`).
- The storefront `/catalog` is dynamic (reads `searchParams`), so each filter
  combination is server-rendered; the underlying `/catalog` fetch is still cached
  for 60s, so CMS edits land within ~1 minute.
- The **wire-transfer** rail is the live primary rail; the **card** rail runs on
  the mock (ADR 0005). Confirmation is an authenticated ops action, not a gateway
  webhook; there is no public callback. The mock `checkoutUrl` base is
  `PAYMENT_CHECKOUT_BASE_URL` (storefront origin).
- Authorisation stays API-only; the UI hides controls by role but is not a
  security boundary.
- e2e writes E2E-owned fixtures to the dev DB; `global-setup.ts` resets the
  reservation, clears its audit/messages, restores the guide supplier, deletes
  `E2E `-prefixed inventory items, and clears the 15th-of-month availability
  override. Several specs also create and delete their own fixtures through a
  PrismaClient (`e2e/fixtures.ts`, the `E2EDSP01`/`E2EESC01` bookings, the intake
  booking, and the imported `E2E Imported Stay` item).
- Documents still itemise included services without per-service prices; voucher
  rendezvous is province + start time.
- Regulatory bed-nights are per booking (accommodation service-item nights): there
  is no party-size field, so a true guests × nights figure needs a further
  migration decision. The fiscal CSV is a plain PAID-receipt ledger, not an
  ONAT-formatted filing; commission/withholding formatting needs finance input.
- `Reservation.tourismCategory` defaults to GENERAL; there is no automatic
  classifier yet, so operators classify specialised bookings by hand (intake
  form or the workbench control).
- Retention: the notice fires 6 months after the latest completion; after a
  confirmation the next cycle is 12 months from that confirmation, not 6 from
  completion. The keep-alive token expires at the notice + 30 days, so a click
  after the grace and before the purge is rejected. Only TRAVELER-role users
  enter the lifecycle. Reservation-scoped free-text PII is now scrubbed on
  anonymization (Tier 1, 2026-09-26); generated PDFs (Tier 2) and supplier
  PII / import batches (Tier 3) are not (`docs/pii-at-rest-review.md` §5).
- `docs/design.md` (design system — "Vereda Expeditions") was added 2026-09-26.
  Applied so far: the tenant is renamed to `vereda-expeditions` / "Vereda
  Expeditions", the `vereda` palette + `warning`/`timeout` alert tokens drive the
  escalation state, Bricolage Grotesque is self-hosted in `tenant/assets/fonts/`
  and loaded via `next/font/local` in both apps (`--ota-font-sans`), the design
  radii (4/10/20px) and two warm-tinted elevation levels are in the token
  contract, and the back-office is localized (cookie → `Accept-Language` →
  tenant locale) across the shell/nav/login, every ops page, and the
  reservation/inventory action forms. Remaining hardcoded copy is confined to a
  few form components (inventory edit/media, pricing rules, availability,
  supplier credential, import wizard, package create/edit). Still open: the 1.25
  type scale, a dark `/ops` surface, and the storefront hero/imagery layout.

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
- The retention keep-alive token is signed/verified with `AUTH_SECRET` read at
  call time; `retention.e2e.test.ts` sets `process.env.AUTH_SECRET` before
  compiling the Nest app. A missing secret makes `scan()` log and skip notices.

## Next
1. **Phase 6 remainder:** retention is functionally complete and live-proven,
   including Tier 1 free-text scrubbing (2026-09-25). Remaining purge scope:
   generated PDFs (Tier 2 — needs legal input on fiscal retention) and supplier
   applications / supplier PII / import batches (Tier 3) — see
   `docs/pii-at-rest-review.md`.
2. **Phase 4 storefront remainder:** package follow-ups that need a migration
   (Article 2) — accommodation-tier selection and package media; the catalog/map
   do not yet show real-time availability. Checkout now uses the wire-transfer
   rail (ADR 0005); the card rail awaits TropiPay. The back-office package editor
   and the §4.9.1 package-type revenue/margin split shipped 2026-09-23.
3. **Phase 3 remainder:** select a real LLM vendor and wire it behind
   `packages/ai`'s `LlmProvider` (new dependency → Article 2). A true guests ×
   nights bed-nights figure still needs a party-size migration.
4. **Phase 7 hardening:** `create-tenant` + fork docs, the RBAC matrix, the
   retention purge, the readiness probe + runbook, rate limiting, and the
   PII-at-rest review shipped. Remaining — act on the review's purge scope
   (owner decision), Sentry/OpenTelemetry, load tests, a shared rate-limit store
   for multi-instance deploys, and Changesets core versioning (deferred).
5. Mobile apps (Phases 5–6) need Expo (Article 2).
6. Extend e2e (remaining): worker accept/decline through the UI, the dispatch
   timeout firing through the UI, and passkey sign-in. Dispatch start/candidates,
   import commit, ops intake, and a live `/ops` event now have browser specs.
7. **TropiPay card rail — DEFERRED:** blocked until the agency's legal
   documents exist and a TropiPay business account can be created (owner,
   2026-09-25). Then implement behind `PaymentProvider` with plain `fetch` and
   add the signature-verified public webhook route (ADR 0003/0005). No action
   until the documents are available.
8. **Design rollout (`docs/design.md`) — continue.** Owner decisions of
   2026-09-26: rename to Vereda Expeditions, self-host Bricolage, implement
   radii/elevation, localize the back-office. Done: naming, palette, alert
   tokens, font, geometry, and back-office i18n across the shell, every ops page,
   and the reservation/inventory action forms. Next, in order: localize the
   remaining form components (inventory edit/media, pricing rules, availability,
   supplier credential, import wizard, package create/edit) — es/en/fr, no output
   change for `en`; encode the 1.25 type scale; a dark `/ops` desk surface; then
   the storefront hero/imagery layout.
9. **Authorization-matrix gaps:** add the `/me/*`, `GET /documents/:id/download`,
   `GET /inventory/media/:mediaId`, and public `/catalog*` /
   `POST /supplier-applications` routes to
   `apps/api/test/authorization.e2e.test.ts`.

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
- 2026-09-24 — GDPR retention purges by **anonymizing in place**, not deleting:
  PII on `User` is overwritten and credentials are revoked, while
  Reservation/ServiceItem/PaymentReceipt/AuditLog rows are kept for fiscal
  aggregates. Hard delete is impossible (`Reservation.user` is RESTRICT). Owner
  approved (see `docs/adr/0004-data-retention.md`).
- 2026-09-24 — the retention clock is anchored on new additive columns
  `Reservation.completedAt` (backfilled from the `reservation.transition` audit
  rows) and `User.retentionNoticeSentAt`; deriving them from the audit log would
  have avoided a migration but is a brittle, unindexed JSON query. Owner
  approved.
- 2026-09-24 — the keep-alive link uses a stateless HMAC-SHA256 token signed with
  `AUTH_SECRET` (no token column, no dependency); ops
  `GET /retention/pending` + `POST /retention/scan` are in the matrix and
  `/retention/keep-alive` is public (invalid token → 400 HTML). Owner approved.
- 2026-09-24 — readiness is split from liveness (`/health` stays dependency-free
  so it never flaps; `/health/ready` checks Postgres + Redis) and hand-rolled
  rather than adding `@nestjs/terminus` (Article 2 avoided). The public body
  carries no error detail; the Redis probe sits behind a `REDIS_HEALTH` token so
  tests stay offline. `docs/runbook.md` is the day-2 ops guide.
- 2026-09-24 — deeper e2e specs seed and tear down their own fixtures through a
  PrismaClient (`e2e/fixtures.ts`) instead of mutating the shared `E2E0001`
  fixture, and retry client-component clicks with `expect(...).toPass()` so the
  first pre-hydration click does not flake.
- 2026-09-24 — DB integration tests opt in with `RUN_DB_INTEGRATION=1` rather
  than gating on `DATABASE_URL`, because Prisma Client auto-loads
  `packages/db/.env` and would otherwise make the default unit suite hit
  Postgres. `retention.integration.test.ts` follows this gate.
- 2026-09-25 — **manual wire transfer is the primary payment rail** (owner
  decision): `BankTransferProvider` + a rail→provider map, bank details in the
  tenant manifest, a storefront `/checkout/wire/<ref>` page, and ops
  confirmation. Card stays on the mock until TropiPay. `docs/adr/0005-payment-rails.md`.
- 2026-09-25 — provider selection is **by rail** (`createPaymentProviders`)
  behind the `PAYMENT_PROVIDERS` token, so TropiPay and future rails are a map
  entry plus an adapter, not a rewrite. The mock stays default for card/tests.
- 2026-09-25 — the agency bank details live only in
  `tenant/agency.config.json` `payments.bankTransfer` (validated by
  `packages/config`), not core code or `.env`; a fork edits that block.
- 2026-09-25 — no TropiPay SDK is added; it will be implemented with plain
  `fetch` behind `PaymentProvider` once the owner supplies credentials and the
  webhook verification is confirmed, and only then a public webhook route.
- 2026-09-25 — **TropiPay deferred:** creating a business account needs the
  agency's legal documents, which do not exist yet, so the card rail stays on
  the mock and wire transfer is the only live rail. No code changes needed to
  resume; see ADR 0005 open items.
- 2026-09-25 — rate limiting is **hand-rolled Express middleware**, not
  `@nestjs/throttler` (Article 2 dependency avoided; matches the hand-rolled
  readiness pattern). It is mounted in `main.ts` rather than as a Nest guard
  because Better Auth bypasses Nest; only credential endpoints get the strict
  limit, session reads stay normal, and `/health*` is skipped. In-memory per
  process — a multi-instance deploy needs a shared store.
- 2026-09-25 — `create-tenant`/`buildTenantManifest` accept the wire-transfer
  bank details (`--account-name/--bank/--iban/--bic/--reference-note`), so a new
  fork scaffolds a working `/checkout/wire` page instead of editing the manifest
  by hand. All three of account-name/bank/iban are required together.
- 2026-09-25 — wrote `docs/pii-at-rest-review.md` (analysis only): it maps PII
  across the schema, object storage, email, and logs; documents what the purge
  covers; and recommends a tiered scrub scope. No code changed. Tier 1 (scrub
  reservation-scoped free text + Verification rows) is recommended; Tier 2
  (generated PDFs) needs legal input.
- 2026-09-26 — applied the PII review's **Tier 1** in
  `RetentionService.anonymize`: reservation-scoped free text is redacted
  (messages, reviews, incidents, decline reasons, `customItineraryPayload`), PII
  keys are stripped from the traveler's audit metadata, and Better Auth
  `Verification` rows for the old email are deleted — all inside the existing
  purge transaction. Proven live in `retention.integration.test.ts`. Tier 2
  (PDFs) and Tier 3 (suppliers/imports) remain.
- 2026-09-26 — the wire-instructions page reads the amount/booking code from the
  persisted receipt via a new **public, PII-free** `GET /payments/intents/:ref`
  (unguessable capability URL; unknown → 404; rate-limited). The checkout URL
  now carries only `wire_<uuid>`, so nothing is spoofable in the URL and nothing
  sensitive leaks. Still no state-changing public callback (ADR 0003).
- 2026-09-26 — the default tenant is renamed to **Vereda Expeditions**
  (`tenantId: vereda-expeditions`), aligning the manifest with `docs/design.md`
  (owner decision). The `TENANT_ID` env default follows.
- 2026-09-26 — the design typeface **Bricolage Grotesque** is self-hosted as a
  variable woff2 in `tenant/assets/fonts/` and loaded with `next/font/local` in
  both apps (owner decision), rather than `next/font/google` (build-time network)
  or a core font package. This is a build-time asset path, not a tenant config
  import; a fork swaps the file.
- 2026-09-26 — the design radii (`radius-sm/md/lg` = 4/10/20px) and two
  warm-tinted elevation levels are part of the core token contract; `Card` is
  flat (hairline border) and elevation is reserved for inputs and the escalation
  alert card. The tenant's `theme.borderRadius` still selects the legacy single
  `--ota-radius` used by the bare `rounded` utility.
- 2026-09-26 — the back-office is internationalized with `next-intl` **without
  URL prefixes**: locale resolves cookie → `Accept-Language` → tenant primary
  locale; a header switcher pins the cookie. English output is unchanged so the
  e2e suite is unaffected. Shell/nav/app-shell/login are migrated; the remaining
  page bodies are a tracked follow-up.
