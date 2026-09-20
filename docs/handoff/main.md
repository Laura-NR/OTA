# Handoff — main — updated 2026-09-20 16:30

## Goal
Build the Cuban inbound-tourism OTA platform. Plan: `docs/development-plan.md`;
stack: `docs/adr/0001-stack.md`. Wave 1 = Phases 0–2. Phases 0–1 done; next is
Phase 2 (back-office features).

## State
- Monorepo: pnpm + Turborepo, TS 6.0.3, ESLint/Prettier, Vitest, GitHub Actions.
- `packages/domain` — reservation state machine (§4.2), dispatch/escalation policy,
  supplier compliance invariants. 20 tests.
- `packages/schemas` — shared Zod DTOs.
- `packages/db` — Prisma 6; migrations `20260919221723_init`,
  `20260920161240_better_auth`; seed (super admin, traveler, verified guide,
  DRAFT reservation `DEMO0001`). Better Auth tables: `session`, `account`,
  `verification`, `passkey`; `users` gained emailVerified/image.
- `packages/auth` — ESM. `createAuth()` builds Better Auth (email+password, magic
  link, passkeys, optional Google), plus `createAuthMiddleware`/`toWebHeaders`.
- `apps/api` — NestJS (CJS). Global secure-by-default `AuthGuard` (APP_GUARD),
  `@Public()`, `@Roles()`, `@CurrentUser`. Better Auth mounted at `/api/auth/*`
  before `express.json()`. Reference slice: `POST /reservations/:id/transition`.
- Docker stack running (postgres, redis, minio, mailpit). `apps/api/.env`
  (gitignored) holds DATABASE_URL/AUTH_SECRET.
- Nothing committed; all untracked.

## Verified
Node 22.22.3, pnpm 12.4.2, TS 6.0.3 (2026-09-20):
- `pnpm lint`, `pnpm format:check`, `pnpm typecheck` (10/10), `pnpm test` (33),
  `pnpm build` (6/6) — green.
- Live: `/health` 200, `/api/auth/ok` 200; email sign-up returns 200 + session;
  `/api/auth/get-session` 200. `POST /reservations/:id/transition`: 401 no session,
  403 as TRAVELER, 200 after promoting to SUPER_ADMIN, 409 illegal; status + audit
  row persisted.

Not verified: `pnpm e2e` (no suite); magic-link and passkey flows configured but
not exercised end to end.

## Assumptions & unknowns
- Magic-link delivery logs the URL; real email awaits `packages/email`.
- Google OAuth is wired in config but no credentials are set.
- Payments still undecided; `docs/adr/0002-payments.md` not written.
- Reservation statuses: §4.2 canonical over §6.2 (confirm with founders).

## Traps
- Better Auth is ESM-only; keep apps/api CommonJS and reach it via dynamic import
  of `@ota/auth`. Do not convert the API to ESM.
- The Prisma adapter keys models by client property (prisma.user), so DEFAULT
  model names are correct. Setting `modelName: 'User'` breaks it — all tables
  report missing.
- Better Auth must receive the raw body: `bodyParser: false` and `express.json()`
  registered after the auth mount. Order matters.
- Sign-up sets `role` server-side (`input: false`); clients cannot self-assign.
- `AUTH_SECRET` is required to start the API.
- Pin `typescript@^6.0.3` and Prisma 6.x when adding packages.
- `better-sqlite3` build is disabled in `pnpm-workspace.yaml`.
- `docker` needs the docker group; stale shells use `sg docker -c '...'`.

## Next
1. Phase 2 back-office: supplier/compliance module, inventory CMS, pricing,
   dispatch engine + escalation, document generation.
2. Add `packages/email` and wire magic-link delivery (remove the console log).
3. `packages/config` tenant manifest + feature flags; `packages/ui` + theming.
4. Add a Postgres service to CI and a DB-backed auth integration test.

## Decisions (append-only)
- 2026-09-20 — fork-per-agency template over runtime multi-tenancy.
- 2026-09-20 — TypeScript pinned to 6.x; Prisma pinned to 6.x.
- 2026-09-20 — spec §4.2 reservation statuses are canonical over §6.2.
- 2026-09-20 — reference-slice-first, then auth.
- 2026-09-20 — `consistent-type-imports` disabled for `apps/api/**` (Nest DI).
- 2026-09-20 — official `better-auth` only; the community NestJS wrapper was
  rejected to avoid another dependency.
- 2026-09-20 — secure-by-default global `AuthGuard` with `@Public()` over
  per-controller guards.
- 2026-09-20 — Better Auth isolated in an ESM `packages/auth`, loaded via dynamic
  import, so the API stays CommonJS.
