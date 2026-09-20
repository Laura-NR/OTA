# ADR 0001 — Technology stack

- **Date:** 2026-09-20
- **Status:** Accepted
- **Deciders:** Project founders, lead engineer
- **Context:** `docs/development-plan.md`

## Context

We are building a Cuban inbound-tourism OTA comprising three decoupled
applications (storefront, operations ERP, worker/traveler/admin mobile) over one
shared domain core. The product must be resellable to other agencies by forking
with different branding and styles. The spec requires design tokens, a config
manifest, feature flags, content isolation, and tenant forking with upstreamable
core. The team builds in TypeScript/Node. Hosting target is EU cloud. Mobile is
Expo React Native. Payment rails are undecided and must remain pluggable.

## Decision

Adopt the stack below, organized as a pnpm + Turborepo monorepo.

| Concern | Choice |
|---|---|
| Language / runtime | TypeScript 6.x on Node.js 22 LTS |
| Monorepo | pnpm workspaces + Turborepo |
| API | NestJS 11 (REST + WebSockets + BullMQ) |
| Database | PostgreSQL 16 |
| ORM | Prisma 6 |
| Queue / cache | Redis 7 + BullMQ |
| Realtime | Socket.IO |
| Web apps | Next.js 15 App Router, React 19 |
| UI / theming | Tailwind CSS + shadcn/ui + CSS-variable design tokens |
| Mobile | Expo (React Native) + expo-sqlite |
| Auth | Better Auth (magic link, OAuth, passkeys, RBAC) |
| Payments | Provider-agnostic adapter (Stripe / GoCardless-SEPA / TropiPay) + mock |
| Object storage | S3 API (MinIO dev, Cloudflare R2 / AWS S3 prod) |
| PDF | Chromium (Playwright) rendering HTML/Handlebars templates |
| Email | React Email + SMTP/Resend (Mailpit locally) |
| AI | Provider-agnostic wrapper package |
| i18n | next-intl + i18next + shared locale JSON |
| Tests | Vitest + Supertest + Playwright + Testcontainers |
| Quality | ESLint flat + Prettier + strict TS + Changesets |
| CI | GitHub Actions |
| Infra | Docker Compose (dev), EU cloud + Caddy (prod) |

## White-label decision

Fork-per-agency template. This repository is upstream. All tenant-specific
material lives only in `/tenant/` plus `.env`; core packages never import it
directly. Runtime multi-tenancy is explicitly deferred but not precluded, because
all tenant config sits behind the `packages/config` boundary.

## Consequences

- One language across API, web, and mobile enables shared domain and Zod schemas.
- NestJS's module/DI/guard model absorbs a ten-module ERP without bespoke glue.
- Prisma provides typed access, migrations, and JSONB/enum support for itinerary
  payloads and status enums.
- BullMQ delayed jobs cover dispatch timeouts and retention scheduling.
- Pluggable payments keep the unresolved Cuba sanctions question off the critical
  path; development proceeds against a mock adapter.
- Fork merges are cheap because the conflict surface is `/tenant`.
- TypeScript is pinned to 6.x: typescript-eslint 8.x refuses to run against TS 7,
  and lint is a required CI gate. Lift the pin when typescript-eslint supports
  TS >= 7.1.

## Rejected alternatives

- **Runtime multi-tenancy now** — weaker branding/data isolation, does not match
  "fork and sell"; deferred, not architectural dead-end.
- **Fastify + tRPC** — lighter but requires significant bespoke structure for a
  large ERP.
- **Drizzle / TypeORM** — lower-level ergonomics or weaker migration story.
- **Flutter** — no TypeScript/domain sharing; second language.
- **PWA-only mobile** — insufficient offline and push guarantees for field work.
- **Keycloak / Auth0** — heavy self-hosting or SaaS cost/lock-in.
- **pspdf/pdf-lib** — layout fidelity inferior to Chromium for branded legal docs.

## Open items

- `docs/adr/0002-payments.md` — provider and legal confirmation for Cuba-nexus
  settlement (spike runs from Phase 0).
- Confirm regulatory citations (Resolución 193/2026, 68/2026) are current.
