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
- `apps/api` — added `GET /reservations` (pipeline list, optional status filter
  and limit, ops roles). Nothing else in the API changed.
- Committed: `23920d7` (reservations list), `3547317` (ui + theming),
  `87c464a` (back-office + root wiring).

## Verified
Node 22.22.3, pnpm 12.4.2 (2026-09-21):
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck` (22 tasks), `pnpm test`
  (120: domain 33, api 50, theming 9, config 6, documents 6, imports 5, ui 4,
  email 4, schemas 3), `pnpm build` (12 tasks) — green.
- Live back-office smoke (API from `dist`; back-office `next dev` on :3002):
  `POST /api/auth/sign-in/magic-link` through the Next proxy → 200; the link in
  Mailpit verified via 302 → `http://localhost:3002/`; `GET /api/ota/reservations`
  with the session cookie → 200 `DEMO0001`; SSR `/` → 200 containing `DEMO0001`,
  the agency name, `--ota-primary:175 77% 26%`, and the `IN PROGRESS` transition
  action; unauthenticated `/` → 307 `/login`; `/api/ota/tenant/config` → the
  public manifest.
- Root cause of the API dev failure proven: `tsx` emits no `design:paramtypes`
  (`Reflect.getMetadata(...) === undefined`), while the tsc output emits it.

Not verified: a real headless-browser run (the Playwright MCP needs the system
`chrome` channel, absent here); the mutating UI actions beyond read/render
(transition, verify, dispatch, import commit); and all pre-existing UNVERIFIED
items (`pnpm e2e`, passkeys, live `/ops` + `/conversations`, BullMQ timeout
firing, worker accept/decline over a real DB).

## Assumptions & unknowns
- Back-office routes are `export const dynamic = 'force-dynamic'`; each request
  re-reads the tenant manifest and re-resolves the session.
- The UI hides controls by role, but authorisation is enforced only in the API —
  the client is not a security boundary.
- Mutating UI actions use the same proxy path as the verified reads; they were
  exercised only through the API/HTTP layer, not clicked in a browser.

## Traps
- `pnpm dev`'s API half is broken: `tsx watch` + esbuild has no decorator
  metadata, so Nest DI throws `UndefinedDependencyException`. Run
  `pnpm --filter @ota/api build && pnpm --filter @ota/api start` for now. The
  clean fix is an swc-based runner (new dependency — Article 2).
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
1. Fix the API dev runner so `pnpm dev` works end-to-end.
2. Click the mutating UI actions in a browser once Chrome is available.
3. Storefront (content hub, SVG map, dynamic package builder, recruitment portal).
4. Worker accept/decline against a real DB; live `/ops` + `/conversations`; then
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
