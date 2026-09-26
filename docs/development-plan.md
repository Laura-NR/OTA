# OTA — Master Development Plan & Architecture Analysis

**Status:** Living plan. Originally approved 2026-09-20 as the baseline; the
**Current status** section immediately below supersedes the historical phase
prose in §8–§10 (those are kept as the original rationale). The authoritative
per-session snapshot, with the full evidence list, is `docs/handoff/main.md`.
**Owners:** Project founders / lead engineer
**Source material:** `OTA - Specifications Document.pdf` / `.docx`, `resources/index.html`
(SVG Cuba map), `resources/cuban_map_svg - Pinar del Rio.svg`, `START-HERE.md`,
`AGENTS.md`, `docs/design.md`.

This document is the authoritative plan for building the platform. It captures the
analysis, the locked architectural decisions, the environment setup, the white-label
reuse strategy, and the phased implementation roadmap.

## Current status (2026-09-26) — supersedes the phase prose

Verified against the code, tests, migrations, and ADRs. Counts are from a green
`pnpm lint && pnpm typecheck && pnpm test && pnpm build` on 2026-09-26 plus a
`pnpm test --force` breakdown. Anything not evidenced below is **unverified** and
therefore listed under Remains.

**Baseline counts:** 18 workspace projects (3 apps, 15 packages) · 11 migrations
· 300 unit tests passed / 4 skipped · 23 e2e spec files / 31 tests · lint,
typecheck, test, build green.

### (a) DONE — verified

| Area | What shipped | Evidence |
|---|---|---|
| Foundation | pnpm + Turborepo, TS 6.0.3 strict, ESLint flat + Prettier, Vitest, CI | `package.json`, `turbo.json`, `tsconfig.base.json`, `.github/workflows/ci.yml`; `pnpm build` = 18 tasks successful |
| Stack decision | Locked stack, fork-per-agency white-label | `docs/adr/0001-stack.md`, `docs/forking.md` |
| Domain core (pure) | Reservation state machine (§4.2), pricing, dispatch policy, supplier compliance, analytics KPIs, statutory reporting, retention rules, reliability | `packages/domain/src/reservation/state-machine.ts`, `pricing/pricing.ts`, `dispatch/policy.ts`, `supplier/compliance.ts`, `analytics/kpi.ts`, `analytics/regulatory.ts`, `retention/retention.ts`, `dispatch/reliability.ts`; `packages/domain/test/*` (54 tests) |
| Persistence | Prisma 6 schema, 11 migrations, idempotent seed | `packages/db/prisma/schema.prisma`, `packages/db/prisma/migrations/` (count `ls -d packages/db/prisma/migrations/*/ | wc -l` = 11), `packages/db/prisma/seed.ts` |
| Auth + RBAC | Better Auth (ESM via dynamic import), global `AuthGuard` + `@Roles`, `@Public()` | `packages/auth`, `apps/api/src/common/auth`, `apps/api/test/authorization.e2e.test.ts` (4 tests: 401, 403 matrix, worker actions, public routes) |
| Back-office A–E | Reservation read model + workbench, escalation + messaging desks, compliance/credentials, document depth, inventory CMS | `docs/adr/0002-back-office-priority.md`; `apps/backoffice/src/app/(dashboard)/*`; `apps/api/src/{reservations,dispatch,escalation,suppliers,documents,inventory}` |
| Dispatch + escalation | Offers ledger, BullMQ delayed timeouts, amber/red policy, live `/ops` + `/conversations` | `packages/domain/src/dispatch`, `apps/api/src/dispatch`, `apps/api/src/escalation`; timeout **firing** proven in `apps/api/test/dispatch.bullmq.integration.test.ts` (gated `REDIS_URL`) |
| Inventory CMS | CRUD, pricing rules PATCH/DELETE, `inventory_media` gallery, supplier availability calendar, public `/catalog` filters | migration `20260922070932_inventory_media`; `apps/api/src/inventory/inventory.controller.ts`, `public-catalog.controller.ts` |
| Documents | Voucher/work order/invoice with rendezvous, emergency directory, itemised services; Playwright PDF | `packages/documents`, `apps/api/src/documents`; migration-free |
| Payments (ADR 0003/0005) | Provider-agnostic adapter; **wire transfer is the primary rail**; mock card; public PII-free intent lookup; ops confirmation | `packages/payments`, `apps/api/src/payments`, migration-free; `docs/adr/0003-payments.md`, `docs/adr/0005-payment-rails.md` |
| Messaging + email | Reservation threads, Socket.IO `/conversations`, async email fallback, Mailpit | `apps/api/src/messages`, `packages/email` |
| Bulk import | CSV/XLSX staging + atomic commit | `packages/imports`, `apps/api/src/imports`; migration `20260921065155_import_batches` |
| Analytics/BI | Finance/ops/quality/geography KPIs + weekly XLSX/PDF digest | `packages/domain/src/analytics/kpi.ts`, `packages/reports`, `apps/api/src/{analytics,reports}` |
| Regulatory reporting (§4.9.2) | Nationality + tourism category, MINTUR summary, fiscal CSV | migration `20260923063425_regulatory_reporting`; `packages/domain/src/analytics/regulatory.ts`, `apps/api/src/regulatory` |
| Curated packages (§3.3) | `Package`/`PackageService`, ops CRUD, public catalogue, from-package booking | migration `20260923091856_curated_packages`; `apps/api/src/packages`, `apps/storefront/src/app/[locale]/packages` |
| Quality / duty of care | Incident log/resolve, supplier reliability, CSAT reviews | `apps/api/src/quality`; `packages/domain/src/dispatch/reliability.ts`; migration-free (models existed) |
| AI assistant (mock) | `LlmProvider` + deterministic `MockLlmProvider`, ops draft/summary/translate | `packages/ai`, `apps/api/src/assistant` |
| Storefront | Content home, catalog + Cuba map, traveler auth/dashboard, five-step builder, recruitment portal, i18n es/en/fr, wire checkout | `apps/storefront/src/app/[locale]/*`, `packages/i18n`, migration `20260922122512_supplier_applications` |
| GDPR retention (§3.5) | Daily BullMQ scan, HMAC keep-alive link, in-place anonymize, Tier 1 free-text scrub | migration `20260924065637_retention_lifecycle`; `apps/api/src/retention`; `packages/domain/src/retention`; `docs/adr/0004-data-retention.md`; `docs/pii-at-rest-review.md` |
| Hardening | Liveness/readiness split, runbook, hand-rolled rate limiting, RBAC matrix, fork tooling | `apps/api/src/health`, `docs/runbook.md`, `apps/api/src/common/rate-limit.ts`, `apps/api/test/{health,rate-limit}.e2e.test.ts`, `tools/create-tenant.mjs` |
| Design system (partial) | Vereda tenant identity + palette, `warning`/`timeout` alert tokens, self-hosted Bricolage Grotesque, design radii + two elevation levels, back-office i18n plumbing (shell/nav/app-shell/login) | `packages/theming/src/tokens.ts`, `packages/ui/{styles.css,tailwind-preset.mjs,src/components}`, `tenant/agency.config.json`, `tenant/assets/fonts/BricolageGrotesque.woff2`, `apps/{storefront,backoffice}/src/lib/font.ts`, `packages/i18n/src/messages/*.json`, `apps/backoffice/src/i18n/request.ts` |

### (b) REMAINS

**Blocked on a decision from the owner (DECISION GATES)**

- **Real LLM vendor** behind `packages/ai` — new dependency (Article 2).
- **TropiPay card rail** — deferred until the agency's legal documents exist
  (ADR 0005). Wire transfer remains the sole live rail; card stays on the mock.
- **PII purge Tiers 2–3** — generated PDFs (Tier 2, needs legal/fiscal input),
  supplier applications/PII/credentials and import batches (Tier 3). Tier 1 is
  done; see `docs/pii-at-rest-review.md` §5.
- **Load testing** — tool + SLO thresholds to assert.
- **Observability** — Sentry and/or OpenTelemetry adoption; alerting on
  readiness/queue depth.
- **Mobile apps** (`worker-app`, `traveler-app`, `admin-app`) — Expo is a new
  dependency and the surface order is a product call. Nothing started.
- **Real-time catalog/map availability** — what province-level "available" means;
  there is no inventory ↔ availability link (a product call).
- **Changesets core versioning** — deferred (dev-time tool).
- **Deployment topology** — single vs multi API instance, which decides whether
  the in-memory rate-limit store must move to Redis.
- **Design system rollout** — owner decisions taken 2026-09-26 (rename the tenant,
  self-host Bricolage, implement radii/elevation, localize ops). The palette,
  identity, font, radii, elevation, alert tokens, and the back-office i18n
  plumbing and the full back-office copy (shell, pages, forms) are done; still
  open: the 1.25 type scale, a dark `/ops` surface, and the storefront
  hero/imagery layout — see "Design gap" below.

**Blocked on a schema migration (Article 2 — ask first)**

- Accommodation-tier selection for packages (`PackageService.tier`).
- Package media (a `PackageMedia` table; inventory media already works).
- Party-size bed-nights (`Reservation.partySize`) for a true guests × nights
  regulatory figure.
- Per-service traveler prices (the invoice currently itemises services without
  unit amounts; `payoutRate` is internal).

**Decision-free work that can start now**

- **Existing wire/supplier/reporting polish** (no migration): per-supplier
  reviews/NPS, richer e2e for worker accept/decline and timeout firing, passkey
  sign-in coverage.
- **Authorization-matrix gaps:** several live routes are not yet asserted in
  `apps/api/test/authorization.e2e.test.ts` (see the handoff's "Not verified").
- **Design increments that need no decision** (tokens/alert semantics — see
  below); typography, palette *identity*, and elevation need the owner decision
  above.
- **Operational items** the review already recommended: stop logging supplier
  emails in the expiry scan, redact email bodies, document TLS termination.

### Design gap — `docs/design.md` (Vereda Expeditions) vs the current UI

**How it maps.** `docs/design.md` is the default tenant's visual identity. Its
tokens are compiled by `packages/theming` into `--ota-*` CSS variables set on
`<body>` by both apps; `packages/ui/tailwind-preset.mjs` maps semantic utilities
onto those names and `packages/ui` holds the components (Button, Card, Input,
Label, Select, Table, Alert, Badge). Surfaces: storefront (`apps/storefront`,
editorial), back-office (`apps/backoffice`, dense ops), worker app (not built).

| # | Gap | Status |
|---|---|---|
| 1 | **Alert semantics.** The design gives distinct `warning`/`color-error` and a dispatch `timeout` (Amber) token; the escalation UI mapped AMBER to `secondary`. | **Done 2026-09-26:** added `warning`/`timeout` tokens to `THEME_TOKEN_KEYS`, the Tailwind preset, `styles.css` and `Badge`; the escalation board and dispatch page now use `timeout` for AMBER. |
| 2 | **Palette.** The six named colours are not in `THEME_PRESETS`; only a preset + a single `primaryColor` are overridable. | **Done 2026-09-26:** added a `vereda` preset, pointed the tenant at it (Verdín primary), and renamed the tenant to `vereda-expeditions` / "Vereda Expeditions" per the owner. |
| 3 | **Typography.** Design mandates Bricolage Grotesque and a 1.25 scale; no font is loaded and `--ota-font-sans` is never set. | **Done 2026-09-26 (font):** the variable font is self-hosted in `tenant/assets/fonts/` and loaded via `next/font/local` in both apps, setting `--ota-font-sans`. The 1.25 type scale still uses Tailwind defaults — **open**. |
| 4 | **Geometry/elevation.** Design radii (4/10/20px) differ from `RADIUS_SCALE` (4/8/12/16px), which also derives md/lg from one `--ota-radius`; `Card` always carries the default grey `shadow-sm` instead of the two warm-tinted levels. | **Done 2026-09-26:** fixed `--ota-radius-sm/md/lg` (4/10/20px), added two warm-tinted shadows (`shadow-ota-1/2`), made `Card` flat with a hairline border, and reserved elevation for inputs and the escalation alert card. |
| 5 | **Iconography/imagery.** No real-photography pipeline; the map fills provinces with primary (token-driven, acceptable) but has no geometric pins. | **Open** — content/asset work. |
| 6 | **Motion.** Design asks for minimal, state-change-only motion. | **Compliant** (only transition utilities are used). |
| 7 | **Voice/copy.** Storefront copy lives in `packages/i18n` (es/en/fr). The back-office copy was hardcoded English. | **Done 2026-09-26:** back-office i18n (cookie → `Accept-Language` → tenant locale) covers the shell, login, metadata, every ops page, and every form/manager component, in es/en/fr. Only domain enum identifiers (statuses, types, categories) render raw, because they are data the e2e suite asserts on. |
| 8 | **Layout per surface.** Storefront hero is text + catalog cards, not the interactive map/photo, and uses an eyebrow label the design bans; the ops desk is light, not the design's Tinta dark surface. | **Open** — screen-level work. |
| 9 | **Accessibility.** Tokens are contrast-checked and focus rings exist; the amber→red change is conveyed by label and colour. | **Pass** — re-verify any new token pairing. |

**Contradictions flagged to the owner:** (a) the design names the default tenant
"Vereda Expeditions" vs the manifest's old "Authentic Cuba Expeditions" —
**resolved 2026-09-26** by renaming the tenant; (b) design.md §9 says a fork
changes only the `theme` block, but the six named colours, typography, and radii
are not all expressible by the current `theme` schema (`palette` + `borderRadius`
+ `primaryColor`) — the palette/font/radius defaults now live in core, and a fork
swaps the font file in `tenant/assets/`; extending the tenant schema with more
theme knobs is a further option; (c) design.md describes a worker-app surface that
does not exist yet.

## 0. Security note recorded at planning time

`opencode.jsonc:21` contained a hardcoded GitHub Personal Access Token in plaintext.
At the time of writing the file was **untracked** (the only commit was `README.md`),
so it had not been pushed. The token is to be revoked by the human owner and the
config changed to read the value from the environment. The secret value is
intentionally **not** reproduced in this document. The config now reads the value
from the environment (`{env:GITHUB_PERSONAL_ACCESS_TOKEN}`).

Standing rules: never commit secrets; keep real values in a gitignored `.env`;
new MCP servers are new dependencies and require security review (AGENTS.md Article 1).

---

## 1. Project mission and system ecosystem

An Online Travel Agency (OTA) for authentic, community-based Cuban tourism:
ecotourism, agrotourism, rural excursions, and cultural immersion beyond resort
circuits.

Three decoupled-but-synchronized applications over one shared core:

1. **Client-Facing Web Application (Storefront)** — global travelers discover Cuban
   heritage, configure custom itineraries, book curated packages, and pay securely.
2. **Operations Back-Office (Havana Operations ERP)** — dispatch management,
   reservation lifecycle monitoring, operational escalation, legal document
   generation, worker compliance auditing, CMS, BI and regulatory reporting.
3. **Worker / Client / Admin Mobile Applications** — low-bandwidth, offline-first
   field tools for guides, drivers, hosts, and translators; a traveler companion;
   and a lightweight admin triage app.

**Architecture consequence:** one domain core, many surfaces. Business rules
(state machine, pricing, dispatch policy, compliance invariants) live in a
framework-agnostic package and are consumed by every app.

---

## 2. Key architectural decision — fork-per-agency white-label

**Decision:** fork-per-agency git template (not runtime multi-tenancy).

- This repository is the **upstream template**.
- Every agency is a **fork** with its own git remote.
- **All tenant-specific material lives in exactly one directory, `/tenant/`**
  (config manifest, theme preset, assets, locale overrides) plus `.env`.
- Core packages **never import `/tenant` directly**; the tenant config is injected
  at each application entrypoint through `packages/config`.
- Upstream improvements merge via `git remote add upstream ...; git merge upstream/main`.
  The conflict surface is confined to `/tenant/`.
- Provide a `create-tenant` script and semantic versioning of core (Changesets) so
  a fork can pin and later upgrade its core version.

**Rejected for now:** a single deployment serving many agencies at runtime. It is
cheaper to operate but breaks branding isolation, complicates data residency, and
does not match "fork and sell." The `packages/config` boundary keeps the door open
to adding a tenant resolver later without rearchitecting.

---

## 3. Locked technology stack

Confirmed decisions (2026-09-20): TypeScript/Node full-stack, EU cloud hosting,
Expo React Native for mobile, provider-agnostic payments, fork-per-agency reuse.

| Concern | Choice | Why | Rejected |
|---|---|---|---|
| Language/runtime | TypeScript 6.x, Node 22 LTS | One language across 5 surfaces; share domain + Zod types | Python/Django (no RN sharing), PHP |
| Monorepo | pnpm workspaces + Turborepo | Forkable, cached tasks, one core | Nx (heavier), npm workspaces (weaker) |
| API | NestJS 11 | Modules/DI/guards fit a 10-module ERP; OpenAPI, WebSockets, BullMQ built in | Fastify+tRPC (lighter, more glue) |
| Database | PostgreSQL 16 | JSONB itineraries, enums, arrays, UUID | MySQL (weaker JSONB) |
| ORM | Prisma 6 | Typed client, migrations, seed, JSONB/enums | Drizzle (lower-level), TypeORM |
| Queue/cache | Redis 7 + BullMQ | Delayed jobs for dispatch timeouts + retention cron | Postgres-only queue (later), RabbitMQ |
| Realtime | Socket.IO | Messaging + live dispatch alerts | SSE (one-way), raw ws |
| Web apps | Next.js 15 (App Router), React 19 | SEO/SSR storefront; admin SPA; shares UI package | Vite SPA (no SSR), Remix |
| Styling/UI | Tailwind + shadcn-style components + CSS-variable tokens | Deep retheme per tenant; own the component source | MUI/Chakra (hard to rebrand) |
| Mobile | Expo (React Native) + expo-sqlite | Offline-first SQLite, push, TS code share | Flutter (no TS share), PWA (weak offline/push) |
| Auth | Better Auth (magic link, OAuth Google/Apple, passkeys, org/RBAC) | Embedded, no extra infra, TS-first | Keycloak (heavy), Auth0 (SaaS cost/lock-in) |
| Payments | Provider-agnostic adapter; **manual wire transfer primary**, TropiPay card next | Rails togglable per tenant; legal to operate today | Stripe-only (may not serve Cuba) |
| Object storage | S3 API (MinIO dev / Cloudflare R2 or AWS S3 prod) | Encrypted credential docs + tenant assets | Local FS (not fork/prod safe) |
| PDF | Chromium (Playwright) render of HTML templates | Branded legal docs, tenant tokens + MINTUR license | pdf-lib (layout pain), React-PDF |
| Email | SMTP via nodemailer (Mailpit locally), templates in `packages/email` | Branded, localized, testable | Hand-written HTML |
| AI | Provider-agnostic wrapper (`packages/ai`) + mock | Draft replies, summaries, translation | Scattered SDK calls |
| i18n | next-intl + shared locale JSON | es/en/fr, zero copy inside components | Hardcoded strings |
| Tests | Vitest + Supertest + Playwright | Fast unit; API integration in-process; e2e | Jest (slower), Cypress |
| Quality | ESLint flat + Prettier + strict TS | Core hygiene | TSLint (dead) |
| CI | GitHub Actions | Repo already on GitHub | GitLab CI |
| Infra | Docker Compose dev; EU cloud + Caddy prod | Portable, self-hostable in Cuba if needed | Vercel-only (worker/queue need long-lived) |

### 3.1 Payments/sanctions for Cuba — resolved for now

International card/SEPA settlement for Cuba-nexus transactions is heavily
sanctioned. **Resolution (ADR 0005, 2026-09-25):** manual **wire transfer** is the
primary rail — legal to operate today, no gateway, no sanctions exposure — and
TropiPay is the card rail, **deferred** until the agency's legal documents exist.
All payment code stays behind the provider-agnostic `packages/payments`
`PaymentProvider` interface so adding a rail is one map entry plus one adapter.
There is deliberately **no public state-changing webhook** until a real provider
implements signature verification (ADR 0003).

---

## 4. Monorepo layout

```
ota/
  apps/
    api/            # NestJS: REST + WS + BullMQ processors
    storefront/     # Next.js public site
    backoffice/     # Next.js ERP
    worker-app/     # Expo field app      (Phase 5, not started)
    traveler-app/   # Expo companion      (Phase 6, not started)
    admin-app/      # Expo ops-lite       (Phase 6, not started)
  packages/
    domain/         # pure TS: state machine, pricing, dispatch policy, invariants
    schemas/        # Zod DTOs shared by API/web/mobile
    db/             # Prisma schema, migrations, seed
    ui/ theming/    # design system + token compiler + theme presets
    config/         # tenant manifest (zod) + feature flags + env loader
    i18n/ documents/ email/ payments/ ai/ storage/ auth/
    imports/ reports/
  tenant/           # THE ONLY fork-specific dir: config, assets, locale overrides
  infra/docker/     # compose, Dockerfiles, Caddy
  infra/scripts/    # create-tenant, seed
  docs/adr  docs/handoff  tools/
```

The 15 packages currently in `packages/` are: `ai`, `auth`, `config`, `db`,
`documents`, `domain`, `email`, `i18n`, `imports`, `payments`, `reports`,
`schemas`, `storage`, `theming`, `ui`.

**Rule:** core packages never import `/tenant`. Tenant config is injected at each
app entrypoint via `packages/config`.

---

## 5. Environment configuration

### 5.1 Development Docker Compose services

| Service | Image | Port | Purpose |
|---|---|---|---|
| `postgres` | `postgres:16` | 5432 | Primary DB, healthcheck, persistent volume |
| `redis` | `redis:7` | 6379 | BullMQ |
| `minio` + `createbuckets` | `quay.io/minio/minio` | 9000/9001 | S3 for credentials/assets |
| `mailpit` | `axllent/mailpit` | 1025/8025 | Catch-all SMTP + inbox UI |
| `api` | local | 3001 | NestJS (hot reload) |
| `worker` | same image as api | — | BullMQ processors |
| `storefront` | local | 3000 | Next.js |
| `backoffice` | local | 3002 | Next.js |
| `adminer` (optional) | adminer | 8080 | DB inspection |

### 5.2 Environment files

- `.env.example` — committed, no secrets.
- `.env.local` — gitignored, developer values.
- `.env.test` — test database/provider values.

All loaded through a **Zod-validated env schema** in `packages/config` so a missing
variable fails fast. Key variables: `DATABASE_URL`, `REDIS_URL`, `S3_*`,
`AUTH_SECRET`, `SMTP_*`, `PAYMENT_*`, `AI_*`, `TENANT_ID`, `NODE_ENV`.

### 5.3 MCP configuration

- **git** — keep; pin the `uvx mcp-server-git` version.
- **github** — read the token from the environment (`{env:...}`), never inline.
- **postgres** — point at the Docker database using a **read-only** role so the
  agent cannot mutate data through MCP.
- **puppeteer → Playwright MCP** — Playwright is already the e2e stack. (Note: the
  Playwright MCP is pinned to the `chrome` channel and is unusable in this
  environment; the repo's `pnpm e2e` is the supported real-browser path.)
- Optional: `context7` MCP for up-to-date library docs.
- Any MCP added beyond this is a new dependency requiring approval (Article 1/2).

---

## 6. White-label strategy (detail)

- `tenant.config.ts` — typed and Zod-validated (`packages/config/src/tenant.ts`):
  `tenantId`, branding (`agencyName`, `licenseNumber`, `primaryColor`,
  `supportEmail`/`supportPhone`), `primaryLocale`/`supportedLocales`,
  `theme.palette`/`borderRadius`, `features.*` flags (`interactiveSvgMap`,
  `culturalEventsBanner`, `recruitmentPortal`, `customItineraryBuilder`,
  `instantBooking`, `directBankTransferRail`, `creditCardGatewayRail`),
  `destinations.geographyType`, `emergencyContacts`, and `payments.bankTransfer`.
- `packages/theming` — theme presets; tokens compiled to `--ota-*` CSS variables
  consumed by `packages/ui` and both web apps (`THEME_TOKEN_KEYS` is the contract).
- `/tenant/assets` — logos, favicons, illustrations, empty-state art, watermarks.
  Later, when runtime tenancy is added, these can move to an asset bucket keyed by
  tenant ID.
- Content isolation — no marketing copy in components; all strings in locale JSON
  (`packages/i18n` + potential `/tenant/locales` overrides). Defer a headless CMS
  (Strapi/Directus) until it is demonstrably needed; the back-office CMS covers
  catalog entities. **Current gap:** the storefront is localized es/en/fr, but the
  back-office still holds hardcoded English copy.
- Documents — vouchers, invoices, work orders, and transactional email templates are
  modular HTML populated from the active tenant config + localized catalogs, with
  the MINTUR license programmatically injected.
- Fork workflow — `upstream` remote, `git merge upstream/main`, conflict surface
  limited to `/tenant`; `create-tenant` scaffolds the manifest; core is versioned
  as plain git history for now (Changesets deferred).

---

## 7. Testing, CI, and definition of done

- **Unit/domain:** Vitest (pure state machine, pricing, policies) — 300 tests.
- **API integration:** Supertest against the Nest app (fakes for Prisma/Auth, no DB).
- **Database integration:** opt-in with `RUN_DB_INTEGRATION=1` (e.g.
  `apps/api/test/retention.integration.test.ts`); Redis-gated BullMQ tests skip by
  default. Testcontainers was planned but the repo uses Docker Compose + explicit
  gates instead.
- **E2E web:** Playwright (`pnpm e2e`), 23 specs / 31 tests.
- **E2E mobile:** Maestro/Detox (later phases).
- **CI:** GitHub Actions (`.github/workflows/ci.yml`) — lint, typecheck, test,
  build, e2e, migration check, Docker image build.
- **Quality gates:** ESLint flat config, Prettier, TypeScript strict, commitlint,
  husky, lint-staged.
- **Observability:** structured logs, audit log table, liveness `/health` and
  readiness `/health/ready`; optional OpenTelemetry + Sentry (deferred decision).

Every phase closes under AGENTS.md Article 4 (enumerate requirements → attach
evidence → collect gaps → loop → report `Converged` / `Not converged`), and produces
a handoff in `docs/handoff/`.

---

## 8. Phased roadmap (with as-built status)

Two waves were recommended. Wave 1 was deliberately independent of payment rails,
which kept the one unresolved external blocker off the critical path. Status
annotations below reflect 2026-09-26; the detailed evidence is in **Current
status** above and in `docs/handoff/main.md`.

| Wave | Phases | Scope | Status |
|---|---|---|---|
| **Wave 1 — Back-Office MVP** | 0–2 | Foundation + RBAC + full ERP dispatch/compliance/documents | **Done** |
| **Wave 2a — Storefront + Payments** | 3–4 | BI/AI + public site + booking + payments | **Done** (card rail on mock; wire live) |
| **Wave 2b — Mobile + GDPR** | 5–6 | Expo worker/traveler/admin + retention | **Retention done; mobile not started** |
| **Wave 3 — Productization** | 7 | Hardening + fork tooling | **Mostly done** (observability/load tests open) |

### Phase 0 — Bootstrap & guardrails — DONE

- `docs/adr/0001-stack.md`, `AGENTS.md` §A/§B, pnpm + Turborepo, strict TS,
  ESLint/Prettier, Vitest, GitHub Actions, docker-compose dev stack.
- `opencode.jsonc` reads the token from the environment.
- **Exit met:** CI green; a deliberately broken file fails `pnpm typecheck`.

### Phase 1 — Core foundation — DONE

- `packages/db` schema + 11 migrations + seed.
- Auth + 5-role RBAC with magic link (Better Auth), global guard.
- `packages/domain` state machine, pricing, dispatch policy, compliance invariants.
- `packages/config` tenant manifest + feature flags + env schema.
- `packages/ui` + theming: design tokens, base components, back-office shell.
- Reference slice `POST /reservations/:id/transition`; audit logging, error model.

### Phase 2 — Back-office core — DONE

Supplier/compliance, inventory CMS + pricing + availability, reservation pipeline
+ workbench, dispatch engine with BullMQ timeouts and amber/red escalation,
escalation desk, document engine (voucher/work order/invoice), messaging, bulk
import.

### Phase 3 — Back-office intelligence — DONE (AI real vendor pending)

KPI/BI dashboard, statutory reporting (MINTUR summary + fiscal CSV), operational
metrics, quality/CSAT/incidents, BI XLSX/PDF digests, and the AI assistant **mock**
(a real LLM vendor is an open decision).

### Phase 4 — Storefront — MOSTLY DONE

Content hub + banner + i18n, tokenized Cuba map, catalog + curated packages,
five-step dynamic builder, recruitment portal, traveler auth/dashboard/vault,
messaging, and checkout (**wire transfer live**, card on mock). Remaining:
real-time map availability (product call) and migration-gated package tiers/media.

### Phase 5 — Worker mobile — NOT STARTED

Expo worker app (phone login, credential banner, availability calendar, job
offers with countdown, offline-first SQLite `sync_queue`, emergency button, push).
Blocked on the Expo dependency decision.

### Phase 6 — Client & Admin mobile + GDPR — GDPR DONE, MOBILE NOT STARTED

- GDPR retention lifecycle shipped end to end (ADR 0004), including Tier 1
  free-text PII scrubbing.
- Traveler companion and admin-lite mobile apps not started.

### Phase 7 — Hardening & productization — MOSTLY DONE

- Done: RBAC/security matrix, readiness probe + runbook, hand-rolled rate
  limiting, `create-tenant` fork tooling, `docs/forking.md`, PII-at-rest review.
- Open: Sentry/OpenTelemetry, load tests, a shared rate-limit store for
  multi-instance deploys, and the PII purge Tiers 2–3.

---

## 9. Cross-cutting risks

1. **Payments/sanctions for Cuba** — resolved for now by manual wire transfer
   (ADR 0005); the TropiPay card rail is deferred pending the agency's legal
   documents. The mock keeps all other work unblocked.
2. **Cuba connectivity/power** — worker app offline-first is non-negotiable; EU CDN
   for storefront; ERP must be self-hostable if data residency requires it.
3. **Regulatory citations** (Resolución 193/2026, 68/2026) — confirm currency and
   authority before encoding into reports. The fiscal CSV is a plain ledger export,
   not an ONAT-formatted filing.
4. **New dependencies needing approval:** payment providers (TropiPay), LLM
   provider, Expo, observability. A headless CMS is deferred; DB-driven CMS +
   locale JSON first.
5. **Legal document templates** — vouchers/contracts require agency/legal review,
   not just code.
6. **PII at rest** — Tier 1 is scrubbed on anonymization; generated PDFs, supplier
   PII, and import batches still lack an erasure path (Tiers 2–3), and there is no
   field-level encryption yet (`docs/pii-at-rest-review.md`).

---

## 10. Immediate next actions (Phase 0) — DONE

1. `docs/adr/0001-stack.md` — lock the stack. ✅
2. `AGENTS.md` §A (commands) and §B (git conventions). ✅
3. `opencode.jsonc` — token from the environment, read-only Postgres MCP. ✅
4. Scaffold the monorepo skeleton + docker-compose + CI. ✅
5. Run the verification loop: green CI and a deliberate-failure check. ✅
6. Payments/sanctions spike → ADR 0003/ADR 0005. ✅

For the live "next" list, read the **Current status** section above and
`docs/handoff/main.md` §Next.
