# Handoff — main — updated 2026-09-20 17:10

## Goal
Build the Cuban inbound-tourism OTA platform. Plan: `docs/development-plan.md`;
stack: `docs/adr/0001-stack.md`. Wave 1 = Phases 0–2. Phases 0–1 done; Phase 2
underway (suppliers, dispatch, escalation done; inventory, documents next).

## State
- Monorepo: pnpm + Turborepo, TS 6.0.3, ESLint/Prettier, Vitest, GitHub Actions.
- `packages/domain` — reservation state machine, dispatch timeout/escalation
  policy, supplier compliance + `coversProvince`, service-type→category mapping.
- `packages/schemas` — reservation, supplier, dispatch, candidate Zod DTOs.
- `packages/db` — Prisma 6; migrations `init`, `better_auth`, `dispatch_offers`,
  `service_item_province`; seed (super admin, traveler, verified guide, DEMO0001
  + a GUIDE item in La Habana).
- `packages/auth` — ESM Better Auth (email+password, magic link, passkeys,
  optional Google).
- `apps/api` — NestJS (CJS). Global `AuthGuard`; global `AuthModule`; modules:
  `reservations`, `suppliers`, `dispatch` (offers, accept/decline, timeout,
  reassign, candidates), `escalation` (Socket.IO gateway on `/ops`).
- Infra: docker-compose (postgres, redis, minio, mailpit). `apps/api/.env`
  (gitignored) has DATABASE_URL/REDIS_URL/AUTH_SECRET.
- Committed/pushed: `e6e41bf`, `36dd100`, `071e2ff`. This increment adds the
  escalation gateway + service-item province.

## Verified
Node 22.22.3, pnpm 12.4.2, TS 6.0.3 (2026-09-20):
- `pnpm lint`, `pnpm format:check`, `pnpm typecheck` (10/10), `pnpm test`
  (55: config 3, domain 26, schemas 3, api 27), `pnpm build` (6/6) — green.
- Live: dispatch offers an eligible worker (province `La Habana`), persists
  `dispatch_offers`, leaves a BullMQ delayed job in Redis;
  `/service-items/:id/candidates` returns `[]` after the only guide was offered
  and 401 unauthenticated; Socket.IO engine handshake responds on `/socket.io`.
- Earlier live: Better Auth sign-up/session; reservations transition RBAC
  401/403/200/409.

Not verified: `pnpm e2e`; magic-link/passkey; the `/ops` namespace handshake over
a real socket (unit-tested only); the BullMQ timeout actually firing.

## Assumptions & unknowns
- `ServiceItem.province` is nullable; null matches any supplier.
- Magic-link delivery logs the URL; needs `packages/email`.
- Payments undecided; `docs/adr/0002-payments.md` not written.

## Traps
- AuthService lives in a global `AuthModule`; any module may inject it, and tests
  override it to fake sessions.
- Services publish escalation through `ESCALATION_PUBLISHER`; never call the
  gateway directly (tests inject a fake).
- BullMQ 6 needs `ioredis` installed explicitly (it is).
- Dispatch scheduler is no-op under NODE_ENV=test or without REDIS_URL.
- `startDispatch` requires at least `ITINERARY_SUBMITTED` (not DRAFT).
- Better Auth is ESM-only; API stays CommonJS via dynamic import.
- Prisma adapter keys models by client property; do NOT set modelName.
- `bodyParser: false` + `express.json()` after the auth mount.
- Global guard is secure-by-default: add `@Public()` deliberately.
- Pin `typescript@^6.0.3` and Prisma 6.x. `docker` needs the docker group.

## Next
1. Inventory CMS + pricing engine (seasonal rates, markups).
2. Document generation (PDF voucher / work order / invoice).
3. Add `packages/email` and wire magic-link delivery.
4. `packages/config` tenant manifest + feature flags; `packages/ui` + theming.
5. Worker-facing accept/decline against a real DB (currently service-tested).

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
- 2026-09-20 — escalation is published through an `EscalationPublisher` interface;
  the Socket.IO gateway is the production implementation (fake in tests).
- 2026-09-20 — `ServiceItem.province` drives eligibility via `coversProvince`.
