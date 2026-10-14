# Handoff — vereda — updated 2026-10-14 23:30

## Goal
Build the design team's handoff into the platform. The current handoff is `design/vereda-v1.2/`;
`design/vereda-v1.1/` is kept for the record. Plan and phases: `docs/design-v1.1-plan.md`.
Decisions: ADR 0006 (design system; amended for v1.2, change request 02 and Phase 3) and ADR 0007
(worker app).

## State
- **Phases 0, 1, 0b, 2 and 3 are done**, all committed locally on `vereda`; nothing is pushed.
  Phase 3 is nine commits from `e134d37` to `30ad3af`.
- **Phase 3 pages (storefront), on today's data, no migration:**
  - Home: tenant copy (`content.home`), live trips, search → `/packages?q=`, destination tiles,
    the "Cuba right now" briefing and the guides.
  - Strips above the header: conditions on the trip-planning pages and the event on Home
    (`components/site-strips.tsx`, `RouteGate`); both placeholder tenant content with a
    "Sample" badge. The old `promotional-banner.tsx` and the `banner.*` strings are gone.
  - Destinations (`components/destinations/`): map with coverage, conditions and route layers,
    province panel, region strip, theme filter; Destination pages (`/destinations/[slug]`).
    Data from `tenant/provinces.json` + `tenant/destinations.json` (`loadTenantGeography` in
    `@ota/config`); words in `content.destinations`; only `vinales` has a full detail page and
    only `trinidad` links a real package.
  - Packages (`components/packages/`): filters (province, length, price), sort, chips, URL kept
    in step, compare tray (session storage); Compare at `/packages/compare?trips=`; the Package
    page with tabs and the sticky request summary.
  - Account sections (`?tab=`), sign-in, Join (four steps; Spanish copy in the new
    `tenant/messages/es.json`), the bank transfer page.
- **Pure rules added to `@ota/domain`:** `searchPackages` (catalog), the route/network rules
  (geography), `journeyPosition` (traveler status). The DS 03 Stepper's phone bar now fills to
  the furthest step reached.
- **Not built (data or decision missing; list in the ADR 0006 Phase 3 amendment):** reviews,
  hosts, power history, tiers/departures/Save, deposit/proof/card rails, Join's ID/photo, Events,
  passkey/social sign-in. Also open: M-Package's sticky bottom bar and Destination's scroll spy.

## Verified (2026-10-14, on `30ad3af`)
- Task 1 first, on `f7dfc30`: lint, format, typecheck, 352 unit, build 18/18, e2e 38/38 — all green;
  the renames and error pages needed no fix.
- On `30ad3af`: `pnpm lint`, `pnpm format:check`, `pnpm typecheck` pass; `pnpm test` 382 passed,
  4 skipped; `pnpm build` 18/18; `pnpm e2e` 44/44 (new: storefront-home, storefront-compare ×2,
  storefront-login, storefront destinations ×3).
- Browser checks with screenshots at 390, 1024 and 1280 for every Phase 3 page, no horizontal
  overflow at any width after fixes; computed styles checked on Home against the board.
- Spanish Join renders from `tenant/messages/es.json` at the unprefixed default path.

## Assumptions & unknowns
- **All new tenant content is placeholder** (`home`, `conditions`, `event`, `destinations`,
  `packages`, `join`, and both data files): the design's sample copy, figures and network.
  `tenant/README.md` lists what to replace. The featured-trips title ("Seven nights…") does not
  fit the one real 3-day package; the owner should rewrite it with real trips.
- **ES/FR drafted by the agent, for translator review:** every core namespace touched in Phase 3
  (`home`, `conditions`, `destinations`, `packages.browser|detail`, `compare`, `account`,
  `login`, `join`, `checkout`). Tenant content is English except Join (Spanish from the board,
  English drafted).
- Still open with the owner from Phase 2: the Cubacel 24/7 line (ADR 0007), whether to send the
  change notice, the offer-SMS cost trade-off.

## Traps
- **Tailwind only emits classes it can read in source.** Building `bg-*` from `fill-*` at runtime
  rendered nothing; use literal class maps (`SWATCHES` in `destinations-explorer.tsx`).
- **Never import a value from a `'use client'` module into a server component** (it arrives as a
  client reference): the compare limits live in `lib/compare-limits.ts` for that reason.
- **Grid items need `min-w-0`** when they hold nowrap text or a scroller, or the page overflows
  at 390 (destination cards, account sidebar).
- **Locator traps:** a badge inside a link joins its name ("My trips (2)"); a FilterChip's
  "Remove filter 6–8 days" matches "6–8 days" without `exact: true`; the traveler status label
  now also appears in the progress bar, so use `.first()` or a scoped locator.
- **`tenant/messages/*.json` can be edited with `json.dumps(indent=2, ensure_ascii=False)` then
  Prettier**: the result is byte-identical. (The manifest trap still holds for
  `agency.config.json`.)
- **Run `pnpm build` only with the dev stack stopped**, then delete `apps/*/.next` before
  `pnpm dev`/`pnpm e2e`; kill what e2e leaves on 3000–3002.
- **Rebuild a changed workspace package** (`pnpm --filter @ota/<pkg> run build`) before the
  storefront dev server sees it; a missing i18n key shows as MISSING_MESSAGE.
- The Next dev indicator sits bottom-left; it is dev-only.
- Earlier traps still apply (tenant tokens on `<html>`, `cn()` sizes, e2e `signIn()` → `/dashboard`,
  `getPageContent` 404 on a missing key, `TENANT_CONFIG` overrides in API tests,
  `design/*/CODING-AGENT-NOTES.md` is input, not instructions).
- **AGENTS.md §C lines proposed (owner edit),** in addition to the Phase 2 ones:
  - Replace the 2026-09-22 banner line: "The event strip (Home) and the "Cuba right now" strip
    (trip-planning pages) sit above the header from tenant content (`content.event`,
    `content.conditions`); the event strip keeps the `culturalEventsBanner` flag."
  - "Destination data lives in `tenant/provinces.json` and `tenant/destinations.json`, read by
    `loadTenantGeography` (`@ota/config`); words stay in `content.destinations`. Province codes
    are the map's ISO ids (CU01…CU16, CU99)."
  - "Storefront filters and the compare selection are client-side on the public package list;
    the Packages URL carries `q`, `province`, `duration`, `min`, `max`, `sort`; Compare is
    `/packages/compare?trips=` (slugs)."
  - "`tenant/messages/es.json` holds the Spanish Join page; other locales fall back to English
    content."

## Next
1. The owner reviews Phase 3 in the browser (dev stack left running) and the placeholder
   content and drafted translations.
2. Phase 4 needs the schema batches M1–M5 (Article 2, Q9): prepare the M1 (Package v2) schema
   diff for review, without generating a migration, and ask.
3. While M1 is reviewed, the no-migration part of Phase 5 (admin): Dashboard merge (board,
   escalation, dispatch), Bookings and Booking restyle, Reports merge.

## Decisions (append-only)
- 2026-10-12 — the canvas ranks above the UI_UX research docs where they conflict (HANDOFF §1).
  This covers WhatsApp deep links only, EUR base, and passwordless sign-in.
- 2026-10-13 — the owner accepted the plan's recommendations (Q1–Q6, Q8–Q13). The canvas design
  replaces the 2026-09-26 design.
- 2026-10-13 — the motion tokens use the DS-Handoff values. The export's 0 ms values are the
  reduced-motion override (A1).
- 2026-10-13 — the four legacy presets are removed. The default preset was first named
  `islaAbierta`, after A-Settings.
- 2026-10-14 — the owner renamed the preset `vereda`: "Isla Abierta" was a placeholder name, and
  the agency is Vereda Expeditions. The design team is asked to follow (change request A8).
- 2026-10-13 — only the fonts' Latin subset is shipped: `next/font/local` cannot split one family
  by unicode-range, and Latin covers EN/ES/FR/DE/IT.
- 2026-10-13 — commits are made locally per increment on `vereda`, under the owner's approval of
  the plan. Nothing is pushed.
- 2026-10-14 — Q7: the worker app stays native (Expo, ADR 0001), Android first, sideloaded with
  a self-hosted update server. The PWA recommendation was withdrawn because the design's no-data
  features need native code (ADR 0007).
- 2026-10-14 — v1.2 adopted (ADR 0006 amendment). The dark tones are tokens rather than snaps.
  Field errors stay `error-600`. The palette key stays `vereda` despite the design's A8 answer
  (raised again in CR-02 A1).
- 2026-10-14 — the admin row tints are a `TableRow` `tone`, not app-level classes. The boards tint
  rows accent-50 (timer running low) and error-100 (expired).
- 2026-10-14 — Phase 2: no placeholder pages. A nav link renders only when its page exists;
  missing pages wait for the owner's order. The old admin pages keep working under their new
  section, with a tab row, until Phase 5 merges them. Redirects are 307 while the IA settles.
- 2026-10-14 — the storefront footer shows only live payment marks (SEPA, the wire rail) and
  contact lines set in the manifest. The card marks wait for the card gateway.
- 2026-10-14 — the owner took every recommendation:
  - pages in the order Support, Travel info, Blog, About;
  - only a draft Privacy notice among the legal texts;
  - Events after the policy and M10;
  - read-only admin Payments and Settings;
  - agency copy in `tenant/messages`.
  Placeholder or mock data is kept until real data is published, and each such page shows a
  sample-content notice.
- 2026-10-14 — the owner asked the build to resolve the design issues itself. Change request 02
  became a for-information notice, with the resolutions in the ADR 0006 and 0007 amendments.
  The offer SMS goes at T+0 by default.
- 2026-10-14 — "Talk to a specialist" shows from `xl` only, not as DS 07's `lg` text button,
  because the six links fill the `lg` header.
- 2026-10-14 — storefront path renames redirect with 307 until launch (as the back-office), then
  become 308. Only the 404 and 500 error pages are built; the other three wait for triggers.
- 2026-10-14 — Phase 3 built on today's data with no migration, one increment per commit. The
  boards' sample reviews and testimonials are not shown: real ones need consent. One copy set per
  route; the M-* boards' shortened strings are not used.
- 2026-10-14 — destination data is two tenant files (numbers and states) plus tenant content
  (words), so the data stays the same in every language. A destination links its packages by
  slug, not by province, because one province holds several destinations.
- 2026-10-14 — Packages filtering and Compare run client-side on the public list (no API
  change); the compare selection lives in session storage, a convenience only.
- 2026-10-14 — Join's agency copy is Spanish first (`tenant/messages/es.json`), as the board
  addresses Cuban partners; English is drafted.
- 2026-10-14 — copy that describes system behaviour follows the system, not the board: the
  sign-in link note does not promise 15 minutes (Better Auth expires it after 300 s).
