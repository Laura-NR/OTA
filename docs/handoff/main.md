# Handoff — main — updated 2026-09-20 17:25

## Goal
Build the Cuban inbound-tourism OTA platform. Plan: `docs/development-plan.md`;
stack: `docs/adr/0001-stack.md`. Wave 1 = Phases 0–2. Phases 0–1 done; Phase 2
underway (suppliers, dispatch, escalation, inventory/pricing done; documents next).

## State
- Monorepo: pnpm + Turborepo, TS 6.0.3, ESLint/Prettier, Vitest, GitHub Actions.
- `packages/domain` — reservation state machine, dispatch policy, supplier
  compliance + `coversProvince`, service-type→category mapping, and the pricing
  calculator (`calculatePrice`).
- `packages/schemas` — reservation, supplier, dispatch, and inventory/pricing DTOs.
- `packages/db` — Prisma 6; migrations `init`, `better_auth`, `dispatch_offers`,
  `service_item_province`, `inventory_pricing`; seed (super admin, traveler,
  verified guide, DEMO0001 + a GUIDE item in La Habana).
- `packages/auth` — ESM Better Auth (email+password, magic link, passkeys,
  optional Google).
- `apps/api` — NestJS (CJS). Global `AuthGuard`; global `AuthModule`; modules:
  `reservations`, `suppliers`, `dispatch`, `escalation` (Socket.IO `/ops`),
  `inventory` (CRUD + pricing rules + price quote).
- Infra: docker-compose (postgres, redis, minio, mailpit). `apps/api/.env`
  (gitignored) has DATABASE_URL/REDIS_URL/AUTH_SECRET.
- Committed/pushed: `e6e41bf`, `36dd100`, `071e2ff`, `af906dd`. This increment
  adds inventory CMS + pricing.

## Verified
Node 22.22.3, pnpm 12.4.2, TS 6.0.3 (2026-09-20):
- `pnpm lint`, `pnpm format:check`, `pnpm typecheck` (10/10), `pnpm test`
  (72: config 3, domain 33, schemas 3, api 33), `pnpm build` (6/6) — green.
- Live inventory: `POST /inventory` creates an item, `POST
  /inventory/:id/pricing-rules` adds seasonal/markup rules, and
  `GET /inventory/:id/price?date=` returns the breakdown (base 100, seasonal 220,
  markup 22, total 242 on the seasonal date; the dateless markup applies
  year-round). Unauthenticated list → 401.
- Earlier live: Better Auth; reservations RBAC; dispatch offer + BullMQ job +
  candidates; Socket.IO engine handshake.

Not verified: `pnpm e2e`; magic-link/passkey; `/ops` live socket; BullMQ timeout
firing; worker accept/decline against a real DB.

## Assumptions & unknowns
- Pricing: a SEASONAL_RATE with no matching date is ignored (latest matching
  start wins); a MARKUP with no date bounds is always active.
- Inventory `attributes` is free-form JSON.
- Magic-link delivery logs the URL; needs `packages/email`.
- Payments undecided; `docs/adr/0002-payments.md` not written.

## Traps
- AuthService lives in a global `AuthModule`; tests override it to fake sessions.
- Services publish through `ESCALATION_PUBLISHER`; never call the gateway directly.
- BullMQ 6 needs `ioredis` explicitly (it is a direct dep).
- Dispatch scheduler is no-op under NODE_ENV=test or without REDIS_URL.
- `startDispatch` requires at least `ITINERARY_SUBMITTED` (not DRAFT).
- Better Auth is ESM-only; API stays CommonJS via dynamic import.
- Prisma adapter keys models by client property; do NOT set modelName.
- `bodyParser: false` + `express.json()` after the auth mount.
- Global guard is secure-by-default: add `@Public()` deliberately.
- Pin `typescript@^6.0.3` and Prisma 6.x. `docker` needs the docker group.

## Next
1. Document generation: PDF voucher / work order / invoice, tenant-branded, MINTUR
   licence injected, emitted on CONFIRMED.
2. Add `packages/email` and wire magic-link delivery.
3. `packages/config` tenant manifest + feature flags; `packages/ui` + theming.
4. Messaging (traveler↔ops) with email fallback; bulk Excel/CSV import.
5. Worker-facing accept/decline against a real DB.

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
- 2026-09-20 — inventory catalog + `PricingRule` (SEASONAL_RATE / MARKUP); pricing
  computed by the pure domain `calculatePrice`.
