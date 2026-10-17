# tenant/

This is the **only fork-specific directory**. Everything an agency deployment
changes should live here (plus `.env`); core packages and apps must never import
this directory directly — the config is loaded at each app entrypoint and passed
around as data.

- `agency.config.json` — the agency manifest: `tenantId`, branding (including the
  MINTUR `licenseNumber` injected into every generated document), locales, theme
  tokens, feature flags, destination geography, and the booking terms
  (`pricing`: child bands and per-booking or per-traveler fees).
- `provinces.json` and `destinations.json` — where the agency operates, as data:
  per province (ISO code `CU01`…`CU16`, `CU99` the isle) the network state,
  casas, guides and drivers, advisory level, power cuts, fuel, road distance
  from Havana and the map label; per destination its province, theme, backup
  power, the curated packages that sleep there (by slug) and its map point.
  They hold no words: names, taglines and province lines are tenant content
  (`content.destinations`). `packages/config` validates both files
  (`loadTenantGeography`); without `provinces.json` the Destinations pages are
  404 and Home shows no destinations.
- `messages/<locale>.json` — the agency's own copy, merged over the core catalogs
  (`packages/i18n`) by the storefront. Any core key can be overridden (Vereda sets
  `packages.requestPill` to its 24-hour confirmation window); the agency's page
  content (Home, Destinations and each destination, Packages and Compare, Join, Support, Travel info, Blog,
  About, Privacy, the footer tagline, the "Cuba right now" conditions and the
  Home event strip) lives under `content`
  and is validated by the `@ota/schemas` content schemas.
  English ships first: where a locale file has no `content` for a page, the
  English content is shown. `messages/es.json` holds only the Join page, which
  is written in Spanish for Cuban partners. A page whose content is missing is a 404, except Home, which then
  shows only its search and the trips under the agency name.

## Placeholders to replace before launch

The default tenant (Vereda Expeditions) carries placeholder and mock data until the
agency publishes real data. Pages marked `"status": "placeholder"` show a
"Sample content" notice; set `"published"` once the agency has approved the text.

- `messages/en.json` → `content`: built from the design's copy (handoff v1.2). Its
  policies (deposit, fees, cancellation scale), figures and team are the design's
  sample content, not confirmed terms; the privacy notice is a draft written from
  `docs/pii-at-rest-review.md` for the owner and counsel to review. `legal` holds
  the OFAC certification statement and each consent's words with a version id
  (M3), taken from the Booking and Account boards; counsel must approve them, and
  any change to the words needs a new version so consent is asked again. The
  `conditions` briefing (advisory level, power, fuel) and the `event` strip are
  design samples, not current information, and show a "Sample" badge until
  published. Join's figures (partners, payouts, review time) are the design's
  samples. Apart from Join, ES/FR content is not written yet.
- `provinces.json` / `destinations.json`: the design's sample network (casas,
  guides, drivers, advisory levels, power cuts, fuel) dated 3 Oct 2026. Only
  `trinidad` links a real package (`trinidad-heritage-trail`); only `vinales`
  has a full destination page in `content.destinations.details`.
- `agency.config.json`: `licenseNumber` (`MINTUR-2026-XXXX`), the
  `emergencyContacts` numbers (`+53 5555 …`), the `payments.bankTransfer` details,
  and `supportEmail` (`desk@example.test`, a reserved domain that never delivers;
  in development Mailpit receives the Support form there). The `pricing` terms
  are the Booking board's samples: infants under 2 free, children up to 12 at
  60 %, a € 25 tourist card per traveler and a € 100 service fee per booking.
  They are frozen onto every package booking's price lines, so confirm them
  before launch.

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
