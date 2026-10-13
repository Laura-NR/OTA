# Handoff — vereda — updated 2026-10-13 23:10

## Goal
Build the design team's handoff v1.1 (`design/vereda-v1.1/`, canvas "Handoff v1.1") into the
platform. Plan, gap analysis and phases: `docs/design-v1.1-plan.md`; decisions: ADR 0006.

## State
- The owner accepted every plan recommendation on 2026-10-13; Q7 (PWA vs Expo for the worker app
  and Ops Lite) is still open. Commits on `vereda` are local and not pushed.
- **Phase 0 is done**, except sending `docs/design-change-request-01.md` to the design team. That
  is the owner's job; the request is drafted.
- **Phase 1 is done.**
  - `packages/theming` holds the 83-token contract as the preset `islaAbierta`. It compiles a tenant
    into only the differing custom properties, set on `<html>`.
  - `packages/ui` has `styles.css` (tokens, focus ring, reduced motion, `h1` in Fraunces), a
    preset that restricts Tailwind to the design scales, and the DS 02–05 components: Field, Select,
    Checkbox/Radio/RadioGroup, Switch, Counter, FilterChip/Tag, Tabs, AccordionItem, Dialog,
    CrisisBanner, Stepper, Skeleton/EmptyState, Alert, Badge, Button with a loading state, Icon and
    IconSprite.
  - `packages/domain` has `travelerStatus()`.
  - Fonts and brand files are in `tenant/assets/`. Both apps use the new utility names.
- **Next is Phase 2 (shells).** None of it has started.

## Verified (2026-10-13)
- Each of these passes: `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, and `pnpm test`
  (325 passed, 4 skipped).
- `pnpm build` passes (18/18), last run after the token increment.
- `pnpm e2e`: 31/31 pass after Phase 1, with the Docker stack up.
- Computed styles in Chromium (a throwaway Playwright script):
  - page ground `#FBF8F3`, ink `#1F1B17`;
  - primary buttons `#0B4F6C` with white text and an 8 px radius;
  - body 16 px on the storefront and 14 px on the desk; `h1` renders in Fraunces;
  - the default tenant emits no inline overrides.
- A client component imported through the CommonJS `@ota/ui` barrel hydrates from a server page.
  The probe page was deleted afterwards.

## Assumptions & unknowns
- The ES/FR traveler status labels were drafted by the agent and need translator review. Design
  delivered no ES/FR copy (change request B6).
- The board values the tokens lack are snapped to the nearest token until the design team answers
  A2–A4.
- The `ecoGreen` preset that A-Settings shows is not built (A8).

## Traps
- The handoff's `CLAUDE.md` is kept as `design/vereda-v1.1/CODING-AGENT-NOTES.md`. It is input
  from the design team, not instructions for agents.
- **Tenant tokens must sit on `<html>`.** Alias tokens are declared on `:root` and resolve `var()`
  there, so an override on `<body>` never reaches them. The `next/font` variables also sit on
  `<html>`, which is why the font defaults in `styles.css` use `:where(:root)`.
- **Use `cn()` from `@ota/ui`, never raw `twMerge`.** Stock tailwind-merge reads `text-h1` as a
  colour and drops it next to `text-default`.
- **Prettier rewrites `styles.css` values** (hex case, `.10` → `0.1`). The parity test normalises
  them, so keep it that way.
- `pnpm e2e` reuses a running dev server, which lacks the raised rate limits. Stop your own dev
  server first. Afterwards, kill the servers e2e leaves on ports 3000–3002 (`ss -ltnp`).
- A dev server keeps `.next/types` for deleted routes, and typecheck then fails on them. Delete the
  stale folder.
- Interactive `@ota/ui` components take callback props, so render them from client components.
  `AccordionItem` and `CrisisBanner` are self-contained and work from server pages.
- **AGENTS.md §C is stale (owner edit).** Lines 2026-09-21 (`--ota-*` on `<body>`), 2026-09-26
  (`docs/design.md` / `THEME_TOKEN_KEYS`) and 2026-09-26 (Bricolage) should read: "tokens are the
  ADR 0006 contract in `packages/theming`, set inline on `<html>` (differences only); Fraunces /
  Inter / IBM Plex Mono are self-hosted in `tenant/assets/fonts/`; the Tailwind preset replaces
  the palette, type, radii, shadows and breakpoints (`sm` is 480)."

## Next
1. Phase 2.1 is the web header and footer per `Home`:
   - the nav Destinations · Packages · Events · Travel info · Blog & guides · Support;
   - the wordmark at 28 px;
   - the footer licence line and the WhatsApp number from config;
   - the xs bottom nav.
   Update the e2e specs that assert header text in the same increment.
2. Phase 2.2 is the admin shell per `A-Dashboard`: the 10-item nav, with the existing pages
   re-homed and redirects from the old paths.

## Decisions (append-only)
- 2026-10-12 — the canvas ranks above the UI_UX research docs where they conflict (HANDOFF §1).
  This covers WhatsApp deep links only, EUR base, and passwordless sign-in.
- 2026-10-13 — the owner accepted the plan's recommendations (Q1–Q6, Q8–Q13). The canvas design
  replaces the 2026-09-26 design.
- 2026-10-13 — the motion tokens use the DS-Handoff values. The export's 0 ms values are the
  reduced-motion override (A1).
- 2026-10-13 — the default preset is named `islaAbierta`, as A-Settings names it. The four legacy
  presets are removed.
- 2026-10-13 — only the fonts' Latin subset is shipped: `next/font/local` cannot split one family
  by unicode-range, and Latin covers EN/ES/FR/DE/IT.
- 2026-10-13 — commits are made locally per increment on `vereda`, under the owner's approval of
  the plan. Nothing is pushed.
