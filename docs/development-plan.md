# OTA — Master Development Plan & Architecture Analysis

**Status:** Approved (2026-09-20) — this is the original baseline plan. The
authoritative done/remaining snapshot is `docs/handoff/main.md`, and
`docs/next-session-prompt.md` asks the next session to **rework this plan**
against actual status. Phase statuses below are historical.
**Owners:** Project founders / lead engineer
**Source material:** `OTA - Specifications Document.pdf` / `.docx`, `resources/index.html`
(SVG Cuba map), `resources/cuban_map_svg - Pinar del Rio.svg`, `START-HERE.md`,
`AGENTS.md`.

This document is the authoritative plan for building the platform. It captures the
analysis, the locked architectural decisions, the environment setup, the white-label
reuse strategy, and the phased implementation roadmap.

---

## 0. Security note recorded at planning time

`opencode.jsonc:21` contained a hardcoded GitHub Personal Access Token in plaintext.
At the time of writing the file was **untracked** (the only commit was `README.md`),
so it had not been pushed. The token is to be revoked by the human owner and the
config changed to read the value from the environment. The secret value is
intentionally **not** reproduced in this document.

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
| Styling/UI | Tailwind + shadcn/ui + CSS-variable tokens | Deep retheme per tenant; own the component source | MUI/Chakra (hard to rebrand) |
| Mobile | Expo (React Native) + expo-sqlite | Offline-first SQLite, push, TS code share | Flutter (no TS share), PWA (weak offline/push) |
| Auth | Better Auth (magic link, OAuth Google/Apple, passkeys, org/RBAC) | Embedded, no extra infra, TS-first | Keycloak (heavy), Auth0 (SaaS cost/lock-in) |
| Payments | Provider-agnostic adapter: Stripe + GoCardless/SEPA + TropiPay | Rails togglable per tenant via feature flags; mock adapter unblocks dev | Stripe-only (may not serve Cuba) |
| Object storage | S3 API (MinIO dev / Cloudflare R2 or AWS S3 prod) | Encrypted credential docs + tenant assets | Local FS (not fork/prod safe) |
| PDF | Chromium (Playwright) render of HTML/Handlebars templates | Branded legal docs, tenant tokens + MINTUR license | pdf-lib (layout pain), React-PDF |
| Email | React Email + SMTP/Resend, Mailpit locally | Branded, localized, testable | Hand-written HTML |
| AI | Provider-agnostic wrapper (`packages/ai`) | Draft replies, summaries, translation | Scattered SDK calls |
| i18n | next-intl + i18next + shared locale JSON | es/en/fr, zero copy inside components | Hardcoded strings |
| Tests | Vitest + Supertest + Playwright + Testcontainers | Fast unit; API integration on real Postgres; e2e | Jest (slower), Cypress |
| Quality | ESLint flat + Prettier + strict TS + Changesets | Fork versioning + core releases | TSLint (dead) |
| CI | GitHub Actions | Repo already on GitHub | GitLab CI |
| Infra | Docker Compose dev; Fly.io/Hetzner/AWS prod; Caddy | Portable, self-hostable in Cuba if needed | Vercel-only (worker/queue need long-lived) |

### 3.1 Open external risk — payments/sanctions for Cuba

International card/SEPA settlement for Cuba-nexus transactions is heavily
sanctioned. The spec names TropiPay. This must be confirmed with real providers and
legal counsel before Phase 4. Mitigation: build against a **mock payment adapter**
behind the `packages/payments` interface so all other work proceeds unblocked.
Deliverable: `docs/adr/0003-payments.md` decision memo (spike runs in parallel from
Phase 0). Note: ADR 0002 is the back-office-priority decision
(`docs/adr/0002-back-office-priority.md`).

---

## 4. Monorepo layout

```
ota/
  apps/
    api/            # NestJS: REST + WS + BullMQ processors
    storefront/     # Next.js public site
    backoffice/     # Next.js ERP
    worker-app/     # Expo field app      (Phase 5)
    traveler-app/   # Expo companion      (Phase 6)
    admin-app/      # Expo ops-lite       (Phase 6)
  packages/
    domain/         # pure TS: state machine, pricing, dispatch policy, invariants
    schemas/        # Zod DTOs shared by API/web/mobile
    db/             # Prisma schema, migrations, seed
    ui/ theming/    # design system + token compiler + theme presets
    config/         # tenant manifest (zod) + feature flags + env loader
    i18n/ documents/ email/ payments/ ai/ storage/ auth/ testing/
  tenant/           # THE ONLY fork-specific dir: config, assets, locale overrides
  infra/docker/     # compose, Dockerfiles, Caddy
  infra/scripts/    # create-tenant, seed
  docs/adr  docs/handoff  tools/
```

**Rule:** core packages never import `/tenant`. Tenant config is injected at each
app entrypoint via `packages/config`.

---

## 5. Environment configuration

### 5.1 Development Docker Compose services

| Service | Image | Port | Purpose |
|---|---|---|---|
| `postgres` | `postgres:16` | 5432 | Primary DB, healthcheck, persistent volume |
| `redis` | `redis:7` | 6379 | BullMQ |
| `minio` + `createbuckets` | `minio/minio` | 9000/9001 | S3 for credentials/assets |
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
- **github** — remove the hardcoded token from `opencode.jsonc`; read from the
  environment.
- **postgres** — point at the Docker database using a **read-only** role
  (`postgresql://ota_ro:...@localhost:5432/ota_dev`) so the agent cannot mutate data
  through MCP.
- **puppeteer → Playwright MCP** — Playwright is already the e2e stack; avoids a
  second Chromium and provides screenshots.
- Optional: `context7` MCP for up-to-date library docs.
- Any MCP added beyond this is a new dependency requiring approval (Article 1/2).

---

## 6. White-label strategy (detail)

- `tenant.config.ts` — typed and Zod-validated: `tenantId`, branding
  (`agencyName`, `licenseNumber`, logos), `primaryLocale`/`supportedLocales`,
  `theme.palette`/`borderRadius`, `features.*` flags (`interactiveSvgMap`,
  `culturalEventsBanner`, `recruitmentPortal`, `customItineraryBuilder`,
  `instantBooking`, `directBankTransferRail`, `creditCardGatewayRail`),
  `destinations.geographyType`.
- `packages/theming` — theme presets; tokens compiled to CSS variables consumed by
  `packages/ui` and both web apps.
- `/tenant/assets` — logos, favicons, illustrations, empty-state art, watermarks.
  Later, when runtime tenancy is added, these can move to an asset bucket keyed by
  tenant ID.
- Content isolation — no marketing copy in components; all strings in locale JSON
  (`packages/i18n` + `/tenant/locales` overrides). Defer a headless CMS
  (Strapi/Directus) until it is demonstrably needed; the back-office CMS covers
  catalog entities.
- Documents — vouchers, invoices, work orders, and transactional email templates are
  modular HTML/Handlebars populated from the active tenant config + localized
  catalogs, with the MINTUR license programmatically injected.
- Fork workflow — `upstream` remote, `git merge upstream/main`, conflict surface
  limited to `/tenant`; Changesets for core versioning; `create-tenant` script.

---

## 7. Testing, CI, and definition of done

- **Unit/domain:** Vitest (pure state machine, pricing, policies).
- **API integration:** Supertest against the Nest app.
- **Database integration:** Testcontainers Postgres.
- **E2E web:** Playwright.
- **E2E mobile:** Maestro/Detox (later phases).
- **CI:** GitHub Actions — lint, typecheck, test, build, e2e, migration check,
  Docker image build.
- **Quality gates:** ESLint flat config, Prettier, TypeScript strict, commitlint,
  husky, lint-staged.
- **Observability:** structured Pino logs, health checks, audit log table,
  optional OpenTelemetry + Sentry.

Every phase closes under AGENTS.md Article 4 (enumerate requirements → attach
evidence → collect gaps → loop → report `Converged` / `Not converged`), and produces
a handoff in `docs/handoff/`.

---

## 8. Phased roadmap

Two waves are recommended. Wave 1 is deliberately independent of payment rails,
which keeps the one unresolved external blocker off the critical path.

| Wave | Phases | Scope | Est. (1 dev, full-time) |
|---|---|---|---|
| **Wave 1 — Back-Office MVP** | 0–2 | Foundation + RBAC + full ERP dispatch/compliance/documents | **~9 weeks** |
| **Wave 2a — Storefront + Payments** | 3–4 | BI/AI + public site + booking + payments | ~8 weeks |
| **Wave 2b — Mobile + GDPR** | 5–6 | Expo worker/traveler/admin + retention | ~7 weeks |
| **Wave 3 — Productization** | 7 | Hardening + fork tooling | ~2 weeks |

**Total ≈ 26 weeks.** Assumptions: one full-time TS/Node/React developer, no major
scope changes, payments resolved before Phase 4. Part-time roughly doubles the
schedule; 2–3 developers ≈ 4–5 months.

### Phase 0 — Bootstrap & guardrails (Week 1)

- Write `docs/adr/0001-stack.md`.
- Fill `AGENTS.md` §A (verified commands) and §B (git/review conventions).
- Scaffold pnpm + Turborepo, strict TS, ESLint/Prettier, Vitest, GitHub Actions.
- `docker-compose` dev stack (postgres, redis, minio, mailpit, api, worker,
  backoffice).
- Fix `opencode.jsonc` (token, read-only Postgres MCP).
- **Exit:** CI green; a deliberately broken commit provably fails CI.

### Phase 1 — Core foundation (Weeks 2–4)

- `packages/db`: Prisma schema (Users, Roles, SupplierProfiles, Reservations,
  ServiceItems, Payments, Documents, Messages, Availability, Reviews, Incidents,
  Inventory, Pricing, AuditLog, retention flags) + migrations + seed.
- Auth + 5-role RBAC (Super Admin, Operations Admin, Administrative Support, Service
  Worker, Guest/Traveler) with magic link, OAuth, passkeys.
- `packages/domain`: reservation state machine (§4.2) as pure tested TS, pricing
  calculation, dispatch policy, compliance invariants.
- `packages/config`: tenant manifest + feature flags + env schema.
- `packages/ui` + theming: design tokens, base components, back-office shell.
- Establish the **reference slice** that every later feature imitates.
- Audit logging, structured logging, error model, API conventions.

### Phase 2 — Back-office core (Weeks 5–9) — requested feature start

- Supplier/compliance: recruitment intake, encrypted credential upload, visual
  document inspector, verification workflow, 30-day expiry alerts that pause
  auto-dispatch.
- Inventory & CMS: CRUD hotels/casas/transport/guides, media, availability.
- Pricing engine: seasonal rates, markups, package details.
- Reservations pipeline + state-machine UI (board + detail) with audit trail.
- **Dispatch engine:** offers, BullMQ delayed timeout timers (2h standard / 30min
  under 48h before arrival), amber (75%) / red (100%) alerts, accept/decline,
  manual override/re-route, eligibility gate (`VERIFIED` + available + licence
  valid + province).
- **Escalation engine:** live dashboard audio/visual cues, click-to-call, one-click
  fallback re-dispatch.
- **Document engine:** PDF voucher / work order / invoice with tenant branding +
  MINTUR licence injection on `CONFIRMED`.
- Messaging (traveler ↔ ops) with asynchronous email fallback.
- Bulk import (.xlsx/.csv): column mapping, preview, validation, commit.

### Phase 3 — Back-office intelligence (Weeks 10–12)

- KPI/BI dashboard: GBV, net revenue, take rate, AOV, supplier payout liabilities,
  reinvestment ledger, ecotourism ratio.
- Regulatory reporting: MINTUR annual activity summary, ONAT fiscal exports,
  Resolución 193/2026 reinvestment/threshold tracking.
- Operational metrics: dispatch latency, acceptance, timeout/fallback, reliability,
  conversion funnel.
- Quality: CSAT/NPS, provider scorecards, incident/emergency log.
- AI assistant: email drafting, daily ops summaries, translation.
- Scheduled exports (weekly PDF/XLSX digests).

### Phase 4 — Storefront (Weeks 13–17)

- Content hub + promotional banner + i18n (es/en/fr).
- Refactor `resources/index.html` SVG map into a tokenized React component with
  province filtering and real-time availability states.
- Catalog + curated packages.
- Five-step dynamic package builder → creates `ITINERARY_SUBMITTED`.
- Supplier recruitment portal `/join-our-network`.
- Traveler auth + self-service dashboard + pipeline tracker + document vault +
  messaging.
- Payments: checkout page, SEPA/open-banking + card rails, idempotent webhooks →
  `SECURED_&_INVOICED` → `PENDING_PAYMENT` → `CONFIRMED`.

### Phase 5 — Worker mobile (Weeks 18–21)

- Phone login + credential-status banner.
- Availability calendar.
- Job offers with countdown + accept/decline (+ reason).
- **Offline-first SQLite `sync_queue`** with differential inbound sync and
  exponential backoff.
- Active itinerary + emergency button + push notifications.

### Phase 6 — Client & Admin mobile + GDPR (Weeks 22–24)

- Traveler companion: dashboard, offline itinerary viewer, push, ratings,
  messaging.
- Admin-lite: pipeline monitoring, red-alert push, one-click re-dispatch, unified
  inbox.
- Automated 6-month retention → keep-alive link → 30-day grace → anonymizing purge
  worker preserving aggregate fiscal metrics.

### Phase 7 — Hardening & productization (Weeks 25–26)

- Security review: passport/PII AES-256 at rest, TLS 1.3, RBAC tests, prove billing
  data never reaches worker endpoints.
- Rate limiting, observability/runbooks, Core Web Vitals tuning, load tests.
- `create-tenant` fork tooling, theme presets, asset swapping, core versioning,
  fork documentation.

---

## 9. Cross-cutting risks

1. **Payments/sanctions for Cuba** — external blocker; confirm provider + legal
   before Phase 4. Mock adapter unblocks development.
2. **Cuba connectivity/power** — worker app offline-first is non-negotiable; EU CDN
   for storefront; ERP must be self-hostable if data residency requires it.
3. **Regulatory citations** (Resolución 193/2026, 68/2026) — confirm currency and
   authority before encoding into reports.
4. **New dependencies needing approval:** payment providers, LLM provider, and any
   headless CMS. Headless CMS is deferred; DB-driven CMS + locale JSON first.
5. **Legal document templates** — vouchers/contracts require agency/legal review,
   not just code.

---

## 10. Immediate next actions (Phase 0)

1. `docs/adr/0001-stack.md` — lock the stack.
2. `AGENTS.md` §A (commands, `UNVERIFIED` until proven) and §B (git conventions).
3. `opencode.jsonc` — remove the hardcoded token, env-ref it, read-only Postgres MCP.
4. Scaffold the monorepo skeleton + docker-compose + CI.
5. Run the verification loop: green CI and a deliberate-failure check.
6. Payments/sanctions spike → `docs/adr/0003-payments.md` (parallel).
