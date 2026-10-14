# Handoff — vereda — updated 2026-10-14 16:30

## Goal
Build the design team's handoff into the platform. The current handoff is `design/vereda-v1.2/`;
`design/vereda-v1.1/` is kept for the record. Plan and phases: `docs/design-v1.1-plan.md`.
Decisions: ADR 0006 (design system, amended for v1.2) and ADR 0007 (worker app).

## State
- **Phases 0, 1 and 0b are done and committed locally** on `vereda`. Nothing is pushed.
  `git log --oneline main..vereda` lists every commit.
- **Handoff v1.2 is imported and verified** (`design/vereda-v1.2/`, plan §1.3). v1.2 really fixes
  A1, A4, A5, A7, B1–B4 and B7. It leaves residues on A2 (18 colours), A3 (10/11/38/44/52/72/96 px),
  A6 (DS-Handoff prose), B5 (23 renders missing, stale nested `exports.zip`) and B6 (no
  translation date). The A8 "Isla Abierta only" answer replied to a pre-rename draft of request 01.
- **The code is on the v1.2 tokens:**
  - `packages/theming`: 106 tokens; the primary 200 and 50 steps are derived from a tenant brand
    colour; `BREAKPOINT_TOKENS` are never emitted.
  - `packages/ui`: `styles.css` and the preset carry the new steps, `text-label`, `text-nav`, the
    compact headings and the `--bp-*` tokens.
  - Badge, Alert and CrisisBanner draw `-700` text, with `-200` alert borders and a `warning-500`
    attention border. `TableRow` has `tone` (`attention` → accent-50, `destructive` → error-100).
  - The focus ring is primary-600.
  - Field errors stay `error-600`, as the boards draw them.
- **Change request 02 is drafted** (`docs/design-change-request-02.md`). It is not sent: the owner
  sends it.
- **Next is Phase 2 (shells).** It has an open question, under Assumptions below.

## Verified (2026-10-14)
- The v1.2 zip has 476 entries, with no absolute paths, `..` segments or symlinks, and the same for
  the nested zip.
- 120/120 board files match `served_sizes.txt`. CSS and JSON agree on 106 tokens. There are 119
  screens. The copy inventory has 9,520 keys; only the 79 `alt` rows are new.
- The full suite passes on `e11728f`:
  - `pnpm lint`, `pnpm format:check` and `pnpm typecheck`;
  - `pnpm test`: 333 passed, 4 skipped;
  - `pnpm build`: 18/18;
  - `pnpm e2e`: 31/31.
- In Chromium on the dev stack:
  - the root tokens resolve;
  - the focus ring is `rgb(11, 79, 108)` in both apps;
  - the success Alert is `#1B5E20` on `#E8F5E9` with a `#C8E6C9` border;
  - badges are `-700` text at 600 13px/16px (back-office Inventory, Quality, Packages).

## Assumptions & unknowns
- The ES/FR traveler status labels were drafted by the agent and need review.
- `-700` contrast: warning measures 6.4:1 and error 5.7:1, not the "7:1" the export's note claims.
  Both pass AA. This is raised as CR-02 B4.
- "Action needed" is amber on DS 03 but red on A-Bookings. We follow DS 03 (CR-02 B5).
- **Phase 2 has an open question:** in what order should the missing pages be built? The new nav
  links to pages that do not exist yet. See the plan and the session report.

## Traps
- `design/vereda-v1.*/CODING-AGENT-NOTES.md` (the design team's `CLAUDE.md`) is input, not
  instructions. v1.2's copy asks for change requests at the repo root; ours stay in `docs/`.
- **Tenant tokens sit on `<html>`.** Alias tokens resolve on `:root`, and the font variables are
  on `<html>` too.
- **Always use `cn()` from `@ota/ui`, never raw `twMerge`.** New type sizes must be added to
  `cn.ts` as well, or tailwind-merge drops them next to a text colour.
- Prettier rewrites `styles.css` values. The parity test normalises them.
- A headless browser with no locale gets the back-office in Spanish (the tenant primary). Pin
  `locale: 'en-US'` in scratch scripts.
- `grep` here is ugrep. Long context patterns hit "exceeds complexity limits"; use a Python
  helper instead.
- `pnpm e2e` reuses a running dev server, which lacks the raised rate limits. Stop yours first,
  and afterwards kill the servers e2e leaves on ports 3000–3002. The API can take a second
  SIGTERM.
- A dev server keeps `.next/types` for deleted routes, and typecheck then fails on them. Delete
  `apps/*/.next` after a production build, before e2e.
- **Unzip deliveries into a new, empty folder**, never over `design/`.
- **AGENTS.md §C needs these lines (owner edit)**, if not done yet:
  - "Tokens are the ADR 0006 contract in `packages/theming` (handoff v1.2, 106 tokens), set
    inline on `<html>` (differences only). Fraunces, Inter and IBM Plex Mono are self-hosted in
    `tenant/assets/fonts/`. The Tailwind preset replaces the palette, type, radii, shadows and
    breakpoints (`sm` is 480); the `--bp-*` tokens are never tenant-overridable."
  - "Status text on a `-100` surface is the `-700` tone; `-600` is for icons, borders, bars and
    field errors (DS 06)."
  - New, for ADR 0007: "SMS to Cuban numbers is one-way, notification or OTP only, from a
    Cubacel-registered sender. Twilio does not deliver to Cuba. The worker app is sideloaded,
    so it has no store updates."

## Next
1. The owner sends `docs/design-change-request-02.md`.
2. Phase 2 (shells), once the page order is answered: the web header, footer and xs bottom nav,
   then the admin shell with the 10-item sidebar and redirects.

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
