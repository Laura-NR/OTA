# Handoff — main — updated 2026-09-20 17:30

## Goal
Build the Cuban inbound-tourism OTA platform. Plan: `docs/development-plan.md`;
stack: `docs/adr/0001-stack.md`. Wave 1 = Phases 0–2. Phase 1 done; Phase 2 core
underway (suppliers, dispatch, escalation, inventory/pricing, documents done).

## State
- Monorepo: pnpm + Turborepo, TS 6.0.3, ESLint/Prettier, Vitest, GitHub Actions.
- `packages/domain` — reservation state machine, dispatch policy, supplier
  compliance + `coversProvince`, service-type→category mapping, pricing
  calculator, `DocumentType`.
- `packages/schemas` — reservation, supplier, dispatch, inventory, document DTOs.
- `packages/db` — Prisma 6; migrations `init`, `better_auth`, `dispatch_offers`,
  `service_item_province`, `inventory_pricing`; seed.
- `packages/auth` — ESM Better Auth.
- `packages/config` — env schema + tenant manifest schema/loader. `tenant/` is the
  only fork-specific directory (`agency.config.json`: branding, MINTUR license,
  locales, theme, feature flags).
- `packages/documents` — data models, HTML templates (tenant branding + MINTUR
  license), and Playwright Chromium HTML→PDF.
- `packages/email` — SmtpMailer (nodemailer) + ConsoleMailer fallback; magic-link
  template. Magic-link delivery now sends through it (Mailpit in dev).
- `apps/api` — NestJS (CJS). Global `AuthGuard` + `AuthModule`; modules:
  `reservations` (transition; triggers documents on CONFIRMED), `suppliers`,
  `dispatch`, `escalation` (Socket.IO `/ops`), `inventory`,
  `documents` (generate + list).
- Infra: docker-compose (postgres, redis, minio, mailpit). `apps/api/.env`
  (gitignored) has DATABASE_URL/REDIS_URL/AUTH_SECRET/agency branding.
- Committed/pushed: `e6e41bf`, `36dd100`, `071e2ff`, `af906dd`, `ca2169a`. This
  increment adds document generation.

## Verified
Node 22.22.3, pnpm 12.4.2, TS 6.0.3 (2026-09-20):
- `pnpm lint`, `pnpm format:check`, `pnpm typecheck` (12/12), `pnpm test`
  (88: config 6, domain 33, schemas 3, documents 6, email 4, api 36),
  `pnpm build` (8/8) —
  green.
- Live documents: transitioning DEMO0001 to CONFIRMED produced VOUCHER,
  WORK_ORDER, and INVOICE rows and real `%PDF-` files under
  `.documents/DEMO0001/` (~20–23 KB each).
- Earlier live: Better Auth; reservations RBAC; dispatch offer + BullMQ job +
  candidates; Socket.IO engine handshake; inventory pricing quote. Tenant config
  verified live: `GET /tenant/config` returns the public manifest. Magic link
  verified live: a branded email lands in Mailpit with a `magic-link/verify` URL
  and the MINTUR license.

Not verified: `pnpm e2e`; magic-link/passkey; `/ops` live socket; BullMQ timeout
firing; worker accept/decline against a real DB; PDF download endpoint (not built).

## Assumptions & unknowns
- Document generation on CONFIRMED is best-effort: failures are logged, not fatal.
- Invoice itemization is a single line; per-service traveler pricing awaits a
  structured booking payload.
- Document storage is local FS; swap for S3/MinIO for multi-instance.
- Agency branding + MINTUR license come from env until `packages/config`.
- Magic-link delivery sends through `packages/email`; without SMTP it logs.
- Payments undecided; `docs/adr/0002-payments.md` not written.

## Traps
- Document rendering needs Playwright's Chromium; `pnpm exec playwright install
  chromium` once per machine. `.documents/` is gitignored.
- Services publish through interfaces (ESCALATION_PUBLISHER, DOCUMENT_RENDERER,
  DOCUMENT_STORAGE, DISPATCH_SCHEDULER); tests inject fakes and never launch a
  browser, hit Redis, or touch the filesystem.
- AuthService is in a global `AuthModule`.
- `startDispatch` requires at least `ITINERARY_SUBMITTED` (not DRAFT).
- Better Auth is ESM-only; API stays CommonJS via dynamic import.
- Prisma adapter keys models by client property; do NOT set modelName.
- `bodyParser: false` + `express.json()` after the auth mount.
- Global guard is secure-by-default: add `@Public()` deliberately.
- Pin `typescript@^6.0.3` and Prisma 6.x. `docker` needs the docker group.
- Better Auth rejects cross-origin `callbackURL` unless the origin is in
  `TRUSTED_ORIGINS`; add new web/mobile origins there.

## Next
1. Document download endpoint + messaging (traveler↔ops) with email fallback.
2. Bulk Excel/CSV import with column mapping + validation preview.
3. `packages/ui` + theming; storefront.
4. Worker-facing accept/decline against a real DB.

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
