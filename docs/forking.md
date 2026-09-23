# Forking for a new agency

This repository is the **upstream template**. Each agency is a **fork** with its
own git remote and its own `/tenant/` directory plus `.env`. Core packages and
apps are tenant-agnostic and must never import `/tenant` directly — the manifest
is loaded at each entrypoint through `packages/config`.

The conflict surface between upstream and a fork is exactly `/tenant/` (+ `.env`),
which keeps core updates cheap to pull.

## 1. Fork and scaffold the tenant

Fork the repo on GitHub, clone your fork, then generate the agency manifest:

```bash
pnpm install
pnpm build                 # @ota/config must be built for the tool to resolve
pnpm create:tenant --name "Viñales Eco Travel" \
  --license MINTUR-2027-0001 \
  --primary "#0f766e" --palette ecoGreen \
  --locales es,en,fr
```

The tool writes `tenant/agency.config.json` (validated by the same Zod schema
the apps load) and `tenant/assets/README.md`. It refuses to overwrite an
existing manifest without `--force`.

Then configure the environment:

```bash
cp .env.example .env       # fill in DATABASE_URL, REDIS_URL, AUTH_SECRET, SMTP_*, …
```

## 2. Make it yours

Everything agency-specific belongs in `/tenant/` or `.env`:

- **`tenant/agency.config.json`** — `tenantId`, branding (including the MINTUR
  `licenseNumber` injected into every generated document), `primaryLocale` /
  `supportedLocales`, `theme` (palette + radius), `features.*` flags,
  `destinations.geographyType`, and `emergencyContacts` (duty-of-care numbers on
  vouchers and work orders).
- **`tenant/assets/`** — logos, favicons, illustrations, empty-state art.
- **`.env`** — secrets and service endpoints.

`packages/theming` turns the manifest's palette into `--ota-*` CSS variables
consumed by `packages/ui` and both web apps, so a rebrand needs no component
edits. Copy lives in `packages/i18n` (and may be overridden per fork), never in
components.

## 3. Keep up with upstream

```bash
git remote add upstream https://github.com/<owner>/<upstream-repo>.git
git fetch upstream
git merge upstream/main
```

Conflicts are confined to `/tenant/`. Core updates (features, fixes, schema
migrations) flow in unchanged. Run the migrations and the verification loop
after a merge:

```bash
pnpm install && pnpm --filter @ota/db exec prisma migrate deploy
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## 4. Versioning

Core is versioned as plain git history for now; a fork pins the upstream commit
it last merged (record it in the fork's notes). A Changesets-based release flow
is a planned follow-up — it would add a dev-time tool, so it is deferred until
there is a release cadence to support.

## Rules that keep merges cheap

- Do not edit core packages/apps for agency-specific needs — put it in
  `/tenant/` or make it a feature flag.
- Do not import `/tenant/` from `packages/*` or `apps/*`.
- Do not commit `.env` or secrets.
