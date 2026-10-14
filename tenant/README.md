# tenant/

This is the **only fork-specific directory**. Everything an agency deployment
changes should live here (plus `.env`); core packages and apps must never import
this directory directly — the config is loaded at each app entrypoint and passed
around as data.

- `agency.config.json` — the agency manifest: `tenantId`, branding (including the
  MINTUR `licenseNumber` injected into every generated document), locales, theme
  tokens, feature flags, and destination geography.
- `messages/<locale>.json` — the agency's own copy, merged over the core catalogs
  (`packages/i18n`) by the storefront. Any core key can be overridden; the agency's
  page content (Support, Travel info, Blog, About, Privacy, the footer tagline)
  lives under `content` and is validated by the `@ota/schemas` content schemas.
  English ships first: where a locale file has no `content`, the English content
  is shown. A page whose content is missing is a 404.

## Placeholders to replace before launch

The default tenant (Vereda Expeditions) carries placeholder and mock data until the
agency publishes real data. Pages marked `"status": "placeholder"` show a
"Sample content" notice; set `"published"` once the agency has approved the text.

- `messages/en.json` → `content`: built from the design's copy (handoff v1.2). Its
  policies (deposit, fees, cancellation scale), figures and team are the design's
  sample content, not confirmed terms; the privacy notice is a draft written from
  `docs/pii-at-rest-review.md` for the owner and counsel to review. ES/FR content
  is not written yet.
- `agency.config.json`: `licenseNumber` (`MINTUR-2026-XXXX`), the
  `emergencyContacts` numbers (`+53 5555 …`), the `payments.bankTransfer` details,
  and `supportEmail` (`desk@example.test`, a reserved domain that never delivers;
  in development Mailpit receives the Support form there).

## Forking for a new agency

See `docs/forking.md` for the full workflow. In short:

1. Fork the repository.
2. `pnpm install && pnpm build`, then scaffold the manifest with
   `pnpm create:tenant --name "Agency Name" --license MINTUR-YYYY-XXXX` and edit
   `tenant/agency.config.json` (branding, locales, feature flags, theme); add
   brand assets under `tenant/assets/`.
3. Copy `.env.example` to `.env` and fill in secrets/services.
4. Deploy. Core updates merge from `upstream`; conflicts stay inside `tenant/`.

The manifest is validated with Zod (`packages/config`) at startup, so a malformed
manifest fails fast rather than leaking undefined branding into documents.
