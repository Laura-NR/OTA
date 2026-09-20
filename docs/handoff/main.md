# Handoff — main — updated 2026-09-20 16:50

## Goal
Build the Cuban inbound-tourism OTA platform. Plan: `docs/development-plan.md`;
stack: `docs/adr/0001-stack.md`. Wave 1 = Phases 0–2. Phases 0–1 done; Phase 2
underway (supplier/compliance done, dispatch next).

## State
- Monorepo: pnpm + Turborepo, TS 6.0.3, ESLint/Prettier, Vitest, GitHub Actions.
- `packages/domain` — reservation state machine, dispatch/escalation policy,
  supplier compliance invariants. 20 tests.
- `packages/schemas` — reservation + supplier Zod DTOs.
- `packages/db` — Prisma 6; migrations `20260919221723_init`,
  `20260920161240_better_auth`; seed.
- `packages/auth` — ESM Better Auth (email+password, magic link, passkeys,
  optional Google).
- `apps/api` — NestJS (CJS). Global `AuthGuard` (APP_GUARD), `@Public()`,
  `@Roles()`, `@CurrentUser`. Modules: `reservations` (transition slice,
  reference), `suppliers` (list, detail, verification workflow + audit).
  Better Auth mounted at `/api/auth/*` before `express.json()`.
- Docker stack running (postgres, redis, minio, mailpit). `apps/api/.env`
  (gitignored) holds DATABASE_URL/AUTH_SECRET.
- Committed: `e6e41bf` (initial foundation). This increment adds suppliers.

## Verified
Node 22.22.3, pnpm 12.4.2, TS 6.0.3 (2026-09-20):
- `pnpm lint`, `pnpm format:check`, `pnpm typecheck` (10/10), `pnpm test` (39:
  config 3, domain 20, schemas 3, api 13), `pnpm build` (6/6) — green.
- Live (earlier): `/health` 200, `/api/auth/ok` 200, sign-up → session,
  `get-session` 200; `POST /reservations/:id/transition` 401/403/200/409 with
  status + audit persisted.

Not verified: `pnpm e2e` (no suite); magic-link and passkey flows; suppliers
against a real DB (HTTP tests use a fake Prisma).

## Assumptions & unknowns
- Magic-link delivery logs the URL; needs `packages/email`.
- Google OAuth wired but no credentials.
- Payments undecided; `docs/adr/0002-payments.md` not written.
- Reservation statuses: §4.2 canonical over §6.2.

## Traps
- Better Auth is ESM-only; API stays CommonJS via dynamic import. Do not convert
  apps/api to ESM.
- Prisma adapter keys models by client property (prisma.user), so default model
  names are correct; do not set `modelName`.
- `bodyParser: false` and `express.json()` after the auth mount; order matters.
- Global guard is secure-by-default: add `@Public()` deliberately.
- New endpoints must declare `@Roles(...)`; otherwise any authenticated user.
- Pin `typescript@^6.0.3` and Prisma 6.x for new packages.
- `docker` needs the docker group; stale shells use `sg docker -c '...'`.

## Next
1. Phase 2 dispatch engine: service-item offers, BullMQ delayed timeout timers
   (2h / 30min), amber/red escalation, accept/decline, eligibility via
   `canAutoDispatch`, ops re-route.
2. Escalation dashboard signals (WebSocket) + click-to-call data.
3. Inventory CMS + pricing engine.
4. Document generation (PDF voucher / work order / invoice).
5. Add `packages/email`; tenant manifest + feature flags; `packages/ui`.

## Decisions (append-only)
- 2026-09-20 — fork-per-agency template over runtime multi-tenancy.
- 2026-09-20 — TypeScript pinned to 6.x; Prisma pinned to 6.x.
- 2026-09-20 — spec §4.2 reservation statuses are canonical over §6.2.
- 2026-09-20 — reference-slice-first, then auth.
- 2026-09-20 — official `better-auth` only; community NestJS wrapper rejected.
- 2026-09-20 — secure-by-default global `AuthGuard` with `@Public()`.
- 2026-09-20 — Better Auth in an ESM `packages/auth`, loaded via dynamic import.
- 2026-09-20 — supplier verification is an explicit audited workflow, not a
  direct status write.
