# Handoff — main — updated 2026-09-20 16:55

## Goal
Build the Cuban inbound-tourism OTA platform. Plan: `docs/development-plan.md`;
stack: `docs/adr/0001-stack.md`. Wave 1 = Phases 0–2. Phases 0–1 done; Phase 2
underway (suppliers + dispatch done; escalation UI, inventory, documents next).

## State
- Monorepo: pnpm + Turborepo, TS 6.0.3, ESLint/Prettier, Vitest, GitHub Actions.
- `packages/domain` — reservation state machine, dispatch timeout/escalation
  policy, supplier compliance invariants, service-type→category mapping.
- `packages/schemas` — reservation, supplier, and dispatch Zod DTOs.
- `packages/db` — Prisma 6; migrations `init`, `better_auth`, `dispatch_offers`;
  seed (super admin, traveler, verified guide, DRAFT `DEMO0001` + a GUIDE item).
- `packages/auth` — ESM Better Auth (email+password, magic link, passkeys,
  optional Google).
- `apps/api` — NestJS (CJS). Global `AuthGuard`, `@Public()`, `@Roles()`,
  `@CurrentUser`. Modules: `reservations` (transition slice/reference),
  `suppliers` (list/detail/verification), `dispatch` (offers, accept/decline,
  timeout, reassign) with a `DispatchScheduler` abstraction and a BullMQ impl.
- Infra: docker-compose (postgres, redis, minio, mailpit). `apps/api/.env`
  (gitignored) has DATABASE_URL/REDIS_URL/AUTH_SECRET.
- Committed/pushed: `e6e41bf`, `36dd100`. This increment adds the dispatch engine.

## Verified
Node 22.22.3, pnpm 12.4.2, TS 6.0.3 (2026-09-20):
- `pnpm lint`, `pnpm format:check`, `pnpm typecheck` (10/10), `pnpm test`
  (50: config 3, domain 24, schemas 3, api 20), `pnpm build` (6/6) — green.
- Live dispatch against real Postgres + Redis: `POST /reservations/:id/dispatch`
  → 200; reservation `DISPATCH_IN_PROGRESS`, item `OFFERED`, supplier assigned,
  deadline +2h, `dispatch_offers` + audit rows written; BullMQ delayed job present
  (`bull:dispatch:delayed` = 1). Unauthenticated dispatch → 401.
- Live (earlier): `/health` 200, Better Auth sign-up/session, reservations
  transition RBAC 401/403/200/409.

Not verified: `pnpm e2e`; magic-link/passkey flows; worker accept/decline against a
real DB (service tests use an in-memory Prisma); the BullMQ timeout actually firing
(only scheduling is observed).

## Assumptions & unknowns
- ServiceItem has no province/location, so dispatch eligibility ignores geography
  for now (the fallback "nearby workers" requirement is not yet satisfiable).
- Magic-link delivery logs the URL; needs `packages/email`.
- Payments undecided; `docs/adr/0002-payments.md` not written.
- Reservation statuses: §4.2 canonical over §6.2.

## Traps
- BullMQ 6 needs `ioredis` installed explicitly (it is now a direct dep of api).
- The dispatch scheduler is `NoopDispatchScheduler` when NODE_ENV=test or
  REDIS_URL is unset; tests inject a fake anyway.
- `startDispatch` requires the reservation to be at least `ITINERARY_SUBMITTED`;
  `DRAFT → DISPATCH_IN_PROGRESS` is illegal by design.
- Better Auth is ESM-only; API stays CommonJS via dynamic import.
- Prisma adapter keys models by client property; do NOT set modelName.
- `bodyParser: false` + `express.json()` after the auth mount; order matters.
- Global guard is secure-by-default: add `@Public()` deliberately.
- Pin `typescript@^6.0.3` and Prisma 6.x for new packages.
- `docker` needs the docker group; stale shells use `sg docker -c '...'`.

## Next
1. Escalation surface: WebSocket gateway for live amber/red alerts + click-to-call
   data and fallback re-dispatch menu.
2. Geography on service items (province) so eligibility can match location.
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
- 2026-09-20 — supplier verification is an explicit audited workflow.
- 2026-09-20 — dispatch offers are an append-only `DispatchOffer` ledger; the
  active offer is mirrored on `ServiceItem`.
- 2026-09-20 — dispatch timeouts go through a `DispatchScheduler` interface
  (BullMQ impl, no-op/fake in tests) rather than calling BullMQ directly.
