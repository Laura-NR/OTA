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
  E2E-owned reservation and the guide supplier through Prisma; `helpers.ts`
  signs in through the real magic-link flow. Specs cover the reservations
  transition, supplier suspend/reinstate, and sign-out.
- Committed: `23920d7` (reservations list), `3547317` (ui + theming),
  `87c464a` (back-office + root wiring), `e2a9058` (docs), `fc084f6`
  (dev-runner fix), plus the e2e commit.

## Verified
Node 22.22.3, pnpm 12.4.2 (2026-09-21):
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (121: domain
  33, api 51, theming 9, config 6, documents 6, imports 5, ui 4, email 4,
  schemas 3), `pnpm build` (14 tasks) — green.
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
- `pnpm e2e` — 3 real-browser tests pass: reservations transition, supplier
  suspend/reinstate, and sign-out. Green both against an already-running
  `pnpm dev` and with Playwright starting the stack itself (webServer → `pnpm dev`
  → API `/health`). Docker (Postgres/Redis/Mailpit) and the seed are required.
- Storefront smoke (`pnpm dev`, :3000): `/` and `/catalog` → 200 with the agency
  name, `--ota-primary:175 77% 26%`, and all three active inventory items from
  the public `GET /catalog` (reachable through `/api/ota/catalog` with no
  session).

Not verified: storefront browser flows (none in the e2e suite yet); the mutating
UI actions not yet in the e2e suite (dispatch start/candidates, import commit);
the Playwright MCP still cannot launch (no system `chrome`); and the pre-existing
UNVERIFIED items (passkeys, live `/ops` + `/conversations`, BullMQ timeout
firing, worker accept/decline over a real DB).

## Assumptions & unknowns
- Back-office routes are `export const dynamic = 'force-dynamic'`; each request
  re-reads the tenant manifest and re-resolves the session.
- The UI hides controls by role, but authorisation is enforced only in the API —
  the client is not a security boundary.
- The e2e suite writes E2E-owned fixtures to the dev database; `global-setup.ts`
  resets them each run. It does not use a separate test database.

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
1. Storefront (continued): SVG map, dynamic package builder, recruitment portal,
   traveler auth, i18n (es/en/fr), and the booking/checkout funnel.
2. Extend the e2e suite to the remaining mutating actions (dispatch
   start/candidates, import commit) and add a storefront spec.
3. Worker accept/decline against a real DB; live `/ops` + `/conversations`; then
   the payments/ADR 0002 spike.

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
