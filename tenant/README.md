# tenant/

This is the **only fork-specific directory**. Everything an agency deployment
changes should live here (plus `.env`); core packages and apps must never import
this directory directly — the config is loaded at each app entrypoint and passed
around as data.

- `agency.config.json` — the agency manifest: `tenantId`, branding (including the
  MINTUR `licenseNumber` injected into every generated document), locales, theme
  tokens, feature flags, and destination geography.

## Forking for a new agency

1. Fork the repository.
2. Edit `tenant/agency.config.json` (branding, license, locales, feature flags,
   theme) and add brand assets under `tenant/`.
3. Copy `.env.example` to `.env` and fill in secrets/services.
4. Deploy. Core updates merge from `upstream`; conflicts stay inside `tenant/`.

The manifest is validated with Zod (`packages/config`) at startup, so a malformed
manifest fails fast rather than leaking undefined branding into documents.
