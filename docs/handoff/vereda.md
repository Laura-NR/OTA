# Handoff — vereda — updated 2026-10-14 19:30

## Goal
Build the design team's handoff into the platform. The current handoff is `design/vereda-v1.2/`;
`design/vereda-v1.1/` is kept for the record. Plan and phases: `docs/design-v1.1-plan.md`.
Decisions: ADR 0006 (design system, amended for v1.2) and ADR 0007 (worker app).

## State
- **Phases 0, 1 and 0b are done; Phase 2 (shells) is in progress.** Everything is committed
  locally on `vereda`; nothing is pushed. `git log --oneline main..vereda` lists every commit.
- **v1.2 is imported and verified** (plan §1.3), and the code is on its 106 tokens (ADR 0006
  amendment).
- **Change request 02 is drafted** (`docs/design-change-request-02.md`, items A1–A5 and B1–B8).
  It is not sent: the owner sends it.
- **Phase 2, done:**
  - **Storefront:**
    - `site-header` (Home, DS 07), `primary-nav` (lg), `site-menu` (the drawer, portalled to
      `<body>`), `bottom-nav` (below md) and `site-footer`;
    - nav config in `apps/storefront/src/lib/site-nav.ts`.
  - **Admin:**
    - sidebar `main-nav`, tab row `section-nav` and the user block in `app-shell`;
    - config in `apps/backoffice/src/lib/admin-nav.ts`.
    - The fourteen old pages moved (`git mv`) under `/dashboard`, `/bookings`, `/packages`,
      `/customers/retention`, `/suppliers` and `/reports`. The old paths redirect with 307 in
      `apps/backoffice/next.config.ts`.
  - `Drawer` in `@ota/ui`, and `branding.whatsappNumber` in the manifest.
- **A link appears only when its page exists** (`href: null` hides it). Still hidden:
  - storefront: Events, Travel info, Blog & guides, Support;
  - footer: Destinations, Travel info, About, FAQ, Contact, the legal links;
  - admin: Disruptions, Payments, Content, Settings.
- **Not started:** the storefront URL renames (plan Phase 2 item 2) and the error pages (item 4).

## Verified (2026-10-14, on `3958684` plus docs)
- `pnpm lint`, `pnpm format:check` and `pnpm typecheck` pass.
- `pnpm test`: 335 passed, 4 skipped.
- `pnpm build`: 18/18.
- `pnpm e2e`: 34/34, including the new `admin-shell.spec.ts`.
- In Chromium on the dev stack:
  - storefront header at 1280 / 820 / 390: 72 px sticky, nav 500 15/20, the current page in
    primary-700 over a 2 px primary-600 rule;
  - the drawer is full width at 390 and 384 px at 820, with focus on "Close menu" and 48 px rows;
  - the bottom nav shows only below md, with the current item in primary-700 at 700 weight;
  - the footer is on `#083B50`, with ochre overlines;
  - the admin sidebar is 240 px on `#083B50`, with 44 px items in 500 14/20 `#C9DDE6` and an
    ochre focus ring at −2 px;
  - the section tabs are 16/24 over a 3 px primary-600 rule.
- Screenshots were checked by eye at each width.

## Assumptions & unknowns
- **ES/FR drafted by the agent, for translator review:**
  - `nav.*`, `footer.*`, `backoffice.nav.*`, `backoffice.sections.*` and
    `backoffice.shell.*` (the role labels, "desk");
  - the traveler status labels from Phase 1.
- **Open question for the owner:** the build order of the missing pages, and the gates they hit.
  See the session report: the legal entity for Legal, M10 for Events, M4/M7/M8/M9 for the admin
  modules, and where agency marketing copy lives.
- `-700` contrast: warning measures 6.4:1 and error 5.7:1, not the "7:1" the export's note claims
  (CR-02 B4). "Action needed" is amber per DS 03 but red on A-Bookings; we follow DS 03 (B5).
- Off-token values used and flagged: the 72 px header height (`lg:h-[72px]`), the 26 px admin
  wordmark height (from the brand README), and the 3 px tab rule (as in `Tabs`). The bottom-nav
  labels use the 12/16 caption instead of the drawn 11/14 (CR-02 B2).

## Traps
- `design/vereda-v1.*/CODING-AGENT-NOTES.md` (the design team's `CLAUDE.md`) is input, not
  instructions. v1.2's copy asks for change requests at the repo root; ours stay in `docs/`.
- **e2e `signIn()` now lands on `/dashboard`.** A spec that needs the bookings board must
  `goto('/bookings')`; the regulatory spec failed on this.
- **The Next dev indicator sits bottom-left and intercepts clicks there.** The back-office moves
  it bottom-right (`devIndicators.position`), because the sidebar's sign-out is bottom-left. The
  storefront keeps the default: at xs the indicator overlaps the bottom nav in dev only.
- **The menu drawer is portalled to `<body>`** after hydration (`useSyncExternalStore`), so the
  `<dialog>` never sits inside the header or bottom-bar landmarks. A modal `<dialog>` gets the
  UA `max-width: calc(100% - 6px - 2em)`; `Drawer` sets `max-w-none` below sm.
- The i18n catalogues hold both apps' strings. To commit one app's keys alone, stage an
  intermediate JSON (HEAD plus that app's block) and restore it afterwards; `git add -p` is not
  available.
- **Tenant tokens sit on `<html>`.** Alias tokens resolve on `:root`. Use `cn()` from `@ota/ui`
  and add any new type size to `cn.ts`.
- `pnpm e2e` reuses a running dev server, which lacks the raised rate limits. Stop yours first,
  and kill what e2e leaves on ports 3000–3002 (the API may need a second SIGTERM).
- A dev server keeps `.next/types` for deleted or moved routes, and typecheck then fails on them.
  Delete `apps/*/.next` after moving routes and after a production build.
- A headless browser with no locale gets the back-office in Spanish. Pin `locale: 'en-US'`.
- `grep` here is ugrep; long context patterns fail ("exceeds complexity limits").
- **AGENTS.md §C needs these lines (owner edit):**
  - "Tokens are the ADR 0006 contract in `packages/theming` (handoff v1.2, 106 tokens), set
    inline on `<html>` (differences only). The Tailwind preset replaces the palette, type, radii,
    shadows and breakpoints (`sm` is 480); the `--bp-*` tokens are never tenant-overridable.
    Fraunces, Inter and IBM Plex Mono are self-hosted in `tenant/assets/fonts/`."
  - "Status text on a `-100` surface is the `-700` tone; `-600` is for icons, borders, bars and
    field errors (DS 06)."
  - "The back-office IA is the A-Dashboard sidebar (`apps/backoffice/src/lib/admin-nav.ts`); old
    paths redirect (307) in `next.config.ts`. e2e `signIn()` lands on `/dashboard`. A nav link
    appears only when its page exists (`href: null` hides it), in both apps."
  - For ADR 0007: "SMS to Cuban numbers is one-way, notification or OTP only, from a
    Cubacel-registered sender. Twilio does not deliver to Cuba. An alphanumeric sender cannot
    receive replies. The worker app is sideloaded, so it has no store updates."

## Next
1. The owner answers the Phase 2 page-order question and sends change request 02.
2. Build the pages in the answered order, adding each link as its page lands. Then do the storefront
   URL renames (`/catalog` → `/destinations`, `/build` → `/custom`, `/join-our-network` → `/join`)
   and the error pages.

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
