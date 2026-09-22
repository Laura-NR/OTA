# Handoff — main — updated 2026-09-21 09:35

## Goal
Build the Cuban inbound-tourism OTA platform. Plan: `docs/development-plan.md`;
stack: `docs/adr/0001-stack.md`. Phases 0–2 core are done; this increment adds
the shared design system and the first browser surface (back-office). Next:
storefront, then the remaining live-socket/worker gaps.

## State
- Monorepo: pnpm + Turborepo, TS 6.0.3, ESLint/Prettier, Vitest, GitHub Actions;
  12 workspaces.
- Core packages unchanged: domain, schemas, db, auth, config, documents, email,
  imports.
- `packages/theming` — palette presets, hex→HSL conversion, `themeCssVariables`
  (tenant manifest → `--ota-*` custom properties), radius scale.
- `packages/ui` — shadcn-style base components (button, card, input, label,
  alert, badge, table, select), `cn`, fallback CSS (`styles.css`), and
  `tailwind-preset.mjs` (ESM) mapping semantic utilities onto the tokens.
- `apps/backoffice` — Next.js 15 App Router shell. Same-origin rewrites proxy
  `/api/auth/*` and `/api/ota/*` to the API, so no CORS and no cross-origin
  cookies. Magic-link login; a server-resolved session gates a route group
  whose pages are: reservations (`/`, transition actions), suppliers (verify),
  dispatch (pick reservation, view + start + candidates), inventory (create +
  price quote), imports (base64 upload → preview → mapping → commit), documents
  (pick reservation, list/download/regenerate). The tenant theme is applied as
  inline `--ota-*` variables on `<body>` in the root layout.
- `apps/storefront` — Next.js 15 public site (:3000) sharing the tenant theme
  (`themeCssVariables` → `--ota-*`) and the same-origin `/api/ota` rewrite. A
  content-hub home plus `/catalog`, which reads the new public `GET /catalog`
  (ISR, revalidate 60; tolerates an unavailable API at build).
- `apps/api` — added `GET /reservations` (pipeline list, optional status filter
  and limit, ops roles) and public `GET /catalog` (active inventory only). Its
  dev runner is now `node --watch -r @swc-node/register src/main.ts` (tsx
  removed), so `pnpm dev` boots the API, back-office, and storefront.
- `e2e/` — Playwright suite at the repo root (`pnpm e2e`, `@playwright/test`
  1.63.0 against the cached `chromium-1243`). `global-setup.ts` resets an
  E2E-owned reservation (status + audit rows) and the guide supplier through
  Prisma; `helpers.ts` signs in through the real magic-link flow. Specs cover
  board → detail → transition, supplier suspend/reinstate, and sign-out.
- Back-office increment A — the reservation read model is a pipeline:
  `GET /reservations` (traveler + service-item count), `POST /reservations`
  (ops intake → DRAFT + 8-char code + audit), `GET /reservations/:id`, and
  `GET /reservations/:id/audit`. The dashboard is a status board that
  deep-links to `/reservations/[id]` (transitions, service items, documents,
  audit) and `/reservations/new`. Sequencing is fixed by
  `docs/adr/0002-back-office-priority.md` (increments A–E; payments ADR 0003).
- Back-office increment B — `/escalation` consumes the `/ops` socket (amber/red
  recomputed client-side, `tel:` click-to-call, one-click re-dispatch) and
  `/messages` uses the `/conversations` socket; both connect the browser
  directly to the API. The API adds `GET /dispatch/active` and `workerPhone` on
  the dispatch item. The BullMQ timeout **firing** is proven live
  (`dispatch.bullmq.integration.test.ts`, gated on `REDIS_URL`). New dependency:
  `socket.io-client`.
- Back-office increment C — `packages/storage` (S3/MinIO) backs supplier
  credential upload/download (`POST|GET /suppliers/:id/credential`); the
  back-office inspector is `/suppliers/[id]`, the list flags credentials
  expiring within 30 days (`GET /suppliers/expiring`), and a daily BullMQ
  repeatable job scans them. No schema migration (content type derived from the
  key extension). New dependency: `@aws-sdk/client-s3`.
- Back-office increment D — documents are richer: the voucher has a rendezvous
  column (province + start) and the tenant emergency directory; the work order
  has an emergency protocol; the invoice itemises included services. Emergency
  contacts come from the tenant manifest (`emergencyContacts`, `packages/config`),
  so a fork sets them in `tenant/agency.config.json`.
- Committed: `23920d7` (reservations list), `3547317` (ui + theming),
  `87c464a` (back-office + root wiring), `e2a9058` (docs), `fc084f6`
  (dev-runner fix), `1b4304d` (e2e), `ad29d0c` (storefront), plus the
  Increment A commit.

## Verified
Node 22.22.3, pnpm 12.4.2 (2026-09-21):
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (139: domain
  33, api 63, theming 9, documents 8, config 7, imports 5, ui 4, email 4,
  schemas 3, storage 3), `pnpm build` — green.
- Document depth proven live: regenerating DEMO0001's documents
  (`POST /reservations/:id/documents`) produced real PDFs whose `pdftotext`
  output contains the voucher rendezvous column + emergency directory
  ("Medical emergency: +53 5555 0104"), the invoice's itemised
  "GUIDE — La Habana" line, and the work order's emergency protocol.
- BullMQ timeout firing proven live: `REDIS_URL=… vitest
  test/dispatch.bullmq.integration.test.ts` → the delayed job fires the handler
  (~300 ms). The credential-expiry repeatable scan is proven the same way
  (`test/compliance.bullmq.integration.test.ts`). Both skipped without
  `REDIS_URL`.
- S3 round-trip proven live: `S3_ENDPOINT=http://localhost:9000
  S3_ACCESS_KEY_ID=minio S3_SECRET_ACCESS_KEY=minio123 pnpm --filter
  @ota/storage exec vitest run test/s3.integration.test.ts` → put/get/delete
  against MinIO. Skipped without the `S3_*` env.
- Live back-office smoke (API from `dist`; back-office `next dev` on :3002):
  `POST /api/auth/sign-in/magic-link` through the Next proxy → 200; the link in
  Mailpit verified via 302 → `http://localhost:3002/`; `GET /api/ota/reservations`
  with the session cookie → 200 `DEMO0001`; SSR `/` → 200 containing `DEMO0001`,
  the agency name, `--ota-primary:175 77% 26%`, and the `IN PROGRESS` transition
  action; unauthenticated `/` → 307 `/login`; `/api/ota/tenant/config` → the
  public manifest.
- Root cause of the old API dev failure proven: `tsx` emits no `design:paramtypes`
  (`Reflect.getMetadata(...) === undefined`), while the tsc output emits it.
- `pnpm dev` (turbo: API + back-office + storefront) now boots cleanly — API
  `/health` 200, back-office `/login` 200; touching `apps/api/src/main.ts` restarts the API
  (`Restarting 'src/main.ts'`) and `/health` stays 200. The full magic-link →
  session → reservations → SSR dashboard smoke test was repeated against this
  `pnpm dev` stack.
- `pnpm e2e` — 6 real-browser tests pass: the `/ops` escalation socket connects,
  a message is sent into the conversation, board → detail → transition, supplier
  suspend/reinstate, a credential upload + inspector render, and sign-out. Green
  both against an already-running `pnpm dev` and with Playwright starting the
  stack itself (webServer → `pnpm dev` → API `/health`). Docker
  (Postgres/Redis/Mailpit/MinIO) and the seed are required.
- Storefront smoke (`pnpm dev`, :3000): `/` and `/catalog` → 200 with the agency
  name, `--ota-primary:175 77% 26%`, and all three active inventory items from
  the public `GET /catalog` (reachable through `/api/ota/catalog` with no
  session).

Not verified: storefront browser flows; dispatch start/candidates and import
commit UI actions; receiving a live escalation event in the browser (the `/ops`
socket *connect* is verified, not an event round-trip); the credential inspector
PDF path (only an image is exercised); outbound expiry notifications (the scan
logs; no email/push yet); the Playwright MCP still cannot launch (no system
`chrome`); and passkeys + worker accept/decline over a real DB.

## Assumptions & unknowns
- Back-office routes are `export const dynamic = 'force-dynamic'`; each request
  re-reads the tenant manifest and re-resolves the session.
- The UI hides controls by role, but authorisation is enforced only in the API —
  the client is not a security boundary.
- The e2e suite writes E2E-owned fixtures to the dev database; `global-setup.ts`
  resets the reservation status and deletes that fixture's audit rows each run.
  It does not use a separate test database.
- The ops `POST /reservations` creates DRAFT only (no storefront builder yet);
  the storefront will submit the same shape and land at ITINERARY_SUBMITTED.
- Documents itemise the included services, not per-service traveler prices: the
  model has no structured booking prices yet, so the invoice lists services and
  the booking total. `payoutRate` (internal supplier cost) is only on the work
  order, never the traveler invoice. Voucher rendezvous is province + start time;
  an explicit meeting-point field still needs a `ServiceItem` column/migration.
- The demo tenant's `emergencyContacts` are placeholders (+53 5555 numbers)
  pending agency/legal confirmation (spec §9).

## Traps
- The API dev runner must stay swc-based (`node --watch -r @swc-node/register`).
  tsx/esbuild emits no `design:paramtypes`, so Nest DI throws
  `UndefinedDependencyException` under it. Tests don't care (unplugin-swc).
- The back-office must keep talking to the API through the Next rewrites. Do not
  add CORS to the API or a cross-origin auth `baseURL`; keep `TRUSTED_ORIGINS`
  including `http://localhost:3002`.
- `packages/ui/tailwind-preset` is ESM (`.mjs`) inside an otherwise CJS package.
  Token names must stay in sync with `THEME_TOKEN_KEYS` in `packages/theming`.
- `apps/backoffice/next.config.ts` must not become `.mjs` (flat ESLint has no
  node globals, so `process` trips `no-undef`).
- Next regenerates `next-env.d.ts` on build; it is ESLint-ignored and a missing
  `.next` directory does not fail back-office typecheck.

## Next
Sequence is fixed by `docs/adr/0002-back-office-priority.md`.
1. **Increment E — inventory CMS completion:** delete, availability calendar,
   media, and the storefront sync controls (final back-office increment).
2. Then Wave 2a — payments mock + ADR 0003, storefront (SVG map, dynamic package
   builder, recruitment portal, traveler auth, i18n, checkout).
3. Then Phase 3 (BI/reporting, AI assistant) and the mobile apps (Phases 5–6).
Also: extend the e2e suite to dispatch start/candidates, import commit, the
reservation intake form, and a live escalation-event round-trip.

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
