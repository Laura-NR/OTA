# Handoff — main — updated 2026-09-22 08:38

## Goal
Build the Cuban inbound-tourism OTA platform. Plan: `docs/development-plan.md`;
stack: `docs/adr/0001-stack.md`. Wave 1 is the back-office ERP, and
`docs/adr/0002-back-office-priority.md` fixes the order (increments A–E before
storefront expansion). A–D are done; E (inventory CMS completion) is next.

## State
- Monorepo: pnpm + Turborepo, TS 6.0.3, ESLint/Prettier, Vitest, GitHub Actions;
  **14 workspace projects** (3 apps, 11 packages).
- Apps: `api` (NestJS, CommonJS), `backoffice`, `storefront` (Next.js 15).
- Packages: domain, schemas, db, auth, config, documents, email, imports,
  storage, theming, ui.
- Back-office (ADR 0002):
  - **A — reservation pipeline:** `GET /reservations` (list DTO with traveler +
    service-item count), `GET /reservations/:id`, `GET /reservations/:id/audit`,
    `POST /reservations` (ops intake → DRAFT + 8-char code). Dashboard is a status
    board deep-linking to `/reservations/[id]` (transitions, service items,
    documents, audit) and `/reservations/new`.
  - **B — escalation + messaging:** `/escalation` live desk on the `/ops` socket
    (amber/red recomputed client-side, `tel:` click-to-call, one-click
    re-dispatch) and `/messages` on the `/conversations` socket; API
    `GET /dispatch/active` + `workerPhone`.
  - **C — compliance:** `packages/storage` (S3/MinIO) backs
    `POST|GET /suppliers/:id/credential`; inspector at `/suppliers/[id]`;
    `GET /suppliers/expiring` + a daily BullMQ scan.
  - **D — document depth:** voucher rendezvous + emergency directory, work-order
    emergency protocol, itemised invoice; `emergencyContacts` in the tenant
    manifest.
- Web apps reach the API through same-origin Next rewrites; Socket.IO connects
  the browser **directly** to the API (`NEXT_PUBLIC_API_ORIGIN`).
- API dev runner: `node --watch -r @swc-node/register src/main.ts` (esbuild/tsx
  cannot emit decorator metadata).
- e2e: 4 spec files / 6 tests (`pnpm e2e`, `@playwright/test` against the cached
  `chromium-1243`).
- Head `4657647`, pushed to `origin/main`.

## Verified
Node 22.22.3, pnpm 12.4.2 (2026-09-22):
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (139: api 63,
  domain 33, theming 9, documents 8, config 7, imports 5, ui 4, email 4, schemas
  3, storage 3), `pnpm build`, `pnpm install --frozen-lockfile` — green.
- `pnpm e2e` — 6 real-browser tests: `/ops` connect, message send, board →
  detail → transition, supplier suspend/reinstate, credential upload + inspector
  render, sign-out. Playwright starts `pnpm dev` via `webServer`; Docker
  (Postgres/Redis/Mailpit/MinIO) and the seed are required.
- Documents proven live: regenerating DEMO0001's PDFs (`POST
  /reservations/:id/documents`) yields `pdftotext` output with the voucher
  rendezvous + emergency directory, the itemised invoice line, and the work-order
  emergency protocol.
- Live-gated integrations: BullMQ timeout firing, the credential-expiry
  repeatable scan (`REDIS_URL`), and an S3 put/get/delete round-trip against
  MinIO (`S3_*`). All skipped without their env.
- `pnpm dev` boots API + back-office + storefront; magic-link → session →
  reservations → SSR dashboard smoke passed; storefront `/` and `/catalog`
  render the tenant theme and the public catalog.

Not verified: storefront browser flows; dispatch start/candidates and import
commit UI actions; a live escalation event round-trip (the `/ops` connect is
verified, not an event); the PDF branch of the credential inspector; outbound
expiry notifications; the Playwright MCP (needs system Chrome); passkeys; worker
accept/decline against a real DB.

## Assumptions & unknowns
- Back-office routes are `force-dynamic`; each request re-reads the tenant
  manifest and re-resolves the session.
- Authorisation is enforced only in the API — the UI hides controls by role but
  is not a security boundary.
- e2e writes E2E-owned fixtures to the dev DB; `global-setup.ts` resets the
  reservation status and clears that fixture's audit rows and messages each run.
  No separate test database.
- `POST /reservations` is ops-only and creates DRAFT; the storefront builder will
  submit the same shape at ITINERARY_SUBMITTED.
- Documents itemise included services, not per-service traveler prices (no
  structured booking prices yet); `payoutRate` is internal (work order only).
  Voucher rendezvous is province + start time; a real meeting point needs a
  `ServiceItem` column.
- Demo `emergencyContacts` are placeholders pending agency/legal confirmation.

## Traps
- API dev must stay swc-based (`node --watch -r @swc-node/register`); tsx/esbuild
  emits no `design:paramtypes` and Nest DI throws `UndefinedDependencyException`.
- Keep the back-office on Next same-origin rewrites; do not add CORS or a
  cross-origin auth `baseURL`; `TRUSTED_ORIGINS` must include `:3002`.
- WebSocket features bypass Next (rewrites do not proxy WS upgrades) and connect
  the browser to the API origin (`NEXT_PUBLIC_API_ORIGIN`, default host:3001).
- `packages/ui/tailwind-preset` is ESM (`.mjs`) inside a CJS package; token names
  must match `THEME_TOKEN_KEYS` in `packages/theming`.
- `apps/backoffice/next.config.ts` must not become `.mjs` (flat ESLint has no
  node globals). `next-env.d.ts` is regenerated by Next and ESLint-ignored.
- BullMQ 6 has no `repeat` on `JobsOptions`; repeatable jobs use
  `queue.upsertJobScheduler`.
- Supplier credential content type is derived from the storage-key extension, so
  there is no `SupplierProfile` column for it.
- Do **not** run `next build` while a Next dev server is running (it clobbers
  `.next`). `pnpm e2e` leaves its webServer process on failure — kill the
  stack and clear `:3000–:3002` before re-running.

## Next
Sequence per `docs/adr/0002-back-office-priority.md`.
1. **Increment E — inventory CMS completion:** delete, availability calendar,
   media, and storefront sync controls (final back-office increment).
2. Wave 2a — payments mock + ADR `0003-payments.md`; storefront SVG map, dynamic
   package builder, recruitment portal, traveler auth, i18n (es/en/fr), checkout.
3. Phase 3 (BI/regulatory reporting, AI assistant) and the mobile apps (Phases 5–6).
Also: extend e2e to dispatch start/candidates, import commit, the intake form,
and a live escalation event round-trip.

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
- 2026-09-20 — transactional email lives in `packages/email` (SMTP via
  nodemailer, console fallback); magic-link delivery uses it.
- 2026-09-20 — tenant manifest at `tenant/agency.config.json`, loaded into the
  global `TENANT_CONFIG`; public `GET /tenant/config`.
- 2026-09-20 — bulk import parses CSV/XLSX in `packages/imports` (exceljs) and
  stages in `import_batches`; commit validates the whole batch atomically before
  writing inventory.
- 2026-09-21 — the design-token contract lives in `packages/theming`
  (`THEME_TOKEN_KEYS`); `packages/ui` owns the Tailwind preset and fallback CSS;
  no agency values in core.
- 2026-09-21 — the back-office proxies auth + API through Next same-origin
  rewrites instead of enabling CORS on the Nest API.
- 2026-09-21 — added `GET /reservations` (ops roles) so the dashboard reads the
  pipeline without introducing any write path.
- 2026-09-21 — switched the API dev runner from `tsx` to `@swc-node/register`
  under `node --watch`: esbuild emits no decorator metadata, and `@swc/core`
  was already a devDependency, so no new native toolchain was introduced.
- 2026-09-21 — e2e uses `@playwright/test` against the repo's cached
  `chromium-1243` bundle (no system Chrome, no sudo); Playwright's `webServer`
  starts `pnpm dev` so `pnpm e2e` works from a cold checkout with Docker up.
- 2026-09-21 — the storefront reads a public `GET /catalog` (active items only)
  instead of opening the ops `GET /inventory`; it is ISR (revalidate 60) and
  tolerates an unavailable API at build.
- 2026-09-21 — `docs/adr/0002-back-office-priority.md`: finish the back-office
  operator surface (increments A–E) before storefront expansion; the payments
  ADR is renumbered `0003-payments.md`.
- 2026-09-21 — the reservation read model is a pipeline (`ReservationListItemDto`
  with traveler + service-item count; detail + audit endpoints); ops intake
  `POST /reservations` creates DRAFT with a generated 8-char booking code.
- 2026-09-21 — the dashboard is a status board that deep-links to a reservation
  workbench, replacing the flat reservations table (removed).
- 2026-09-21 — the escalation desk and messaging inbox connect the browser
  directly to the API over Socket.IO (`NEXT_PUBLIC_API_ORIGIN`) rather than
  through Next, because Next rewrites do not proxy WebSocket upgrades; the
  gateways authenticate via the shared host-only session cookie.
- 2026-09-21 — `GET /dispatch/active` and `workerPhone` on the dispatch item feed
  the live desk; amber/red is recomputed client-side from the deadline with the
  domain `escalationAlert`.
- 2026-09-21 — the BullMQ timeout-firing integration test constructs the
  scheduler with a unique queue name so it does not race the running API worker.
- 2026-09-21 — credentials live in `packages/storage` behind an `ObjectStorage`
  interface (S3/MinIO when configured, in-memory otherwise) and are served only
  through an authorised API route — no public URLs.
- 2026-09-21 — credential content type is derived from the storage-key extension
  so no `SupplierProfile` column or migration was needed.
- 2026-09-21 — the 30-day credential scan is a BullMQ repeatable job
  (`upsertJobScheduler`, daily 06:00). Auto-dispatch pausing is already enforced
  by the domain `canAutoDispatch`; the job surfaces expiring workers (logs only
  for now — email/push is a follow-up).
- 2026-09-21 — duty-of-care contacts live in the tenant manifest
  (`emergencyContacts`) and flow into documents via `DocumentBranding`; core
  ships no agency phone numbers.
- 2026-09-21 — the traveler invoice itemises included services (description) plus
  the booking total; per-service prices do not exist, and internal `payoutRate`
  is never shown to the traveler (only on the supplier work order).
- 2026-09-21 — voucher "rendezvous" is province + start time; a true meeting
  point needs a `ServiceItem` column (deferred, migration).
