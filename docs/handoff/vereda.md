# Handoff — vereda — updated 2026-10-14 12:00

## Goal
Build the design team's handoff (`design/vereda-v1.1/`, now superseded by v1.2) into the platform.
Plan and phases: `docs/design-v1.1-plan.md`; decisions: ADR 0006 (design system) and ADR 0007
(worker app).

## State
- **Phases 0 and 1 are done and committed locally** on `vereda` (11 commits ahead of `main`,
  not pushed):
  - the token contract in `packages/theming` (preset `vereda`);
  - `packages/ui` `styles.css`, the preset and the DS 02–05 components;
  - fonts and brand files in `tenant/assets/`;
  - the Lucide sprite;
  - `travelerStatus()`;
  - `tools/copy-inventory.mjs`.
- **The design team answered change request 01** (`docs/design-change-response-01.md`, untracked)
  and delivered `vereda-handoff-v1.2.zip` (119 MB, untracked and git-ignored, 476 entries, no
  unsafe paths). **Nothing from v1.2 has been imported or verified.** In their answers:
  - **A1, motion:** the DS-Handoff values, as we built.
  - **A2, dark tones:** the `-700` tones are *added* as tokens, not snapped.
  - **A3, sizes:** 13 px (pills) and 15 px (primary nav) are ratified as tokens.
  - **A4, radii:** snap as we proposed.
  - **A5, breakpoints:** exported.
  - **A6, focus ring:** primary-**600**, not 500. Our `--color-focus-ring` must change.
  - **A7:** `text-on-primary` is ratified.
  - **A8:** they answered "Isla Abierta only". This conflicts with the owner's rename to
    `vereda` (2026-10-14). The owner decides, so raise it again.
  - **B1–B3:** fixed.
  - **B4:** row 11 is accepted.
  - **B5:** 96/119 exports, including page 06 PDFs.
  - **B6:** 79 `alt` rows added (9,520 strings).
- **Q7 is decided (ADR 0007):** the worker app is native Expo, Android first, distributed as a
  sideloaded APK with a self-hosted update server. Ops Lite stays in the back-office.
- **SMS:** a non-US provider. The owner is testing providers and will register the Cubacel sender
  once the legal entity exists.

## Verified (2026-10-13 / 14)
- Each of these passes on the Phase 1 code: `pnpm lint`, `pnpm format:check`, `pnpm typecheck`,
  and `pnpm test` (325 passed, 4 skipped).
- `pnpm build` passes (18/18).
- `pnpm e2e` passes 31/31.
- After the palette rename (2026-10-14), the config and theming tests and the full unit suite
  were re-run: 325 passed.
- Chromium computed styles match the tokens. A client component from the `@ota/ui` barrel
  hydrates.

## Assumptions & unknowns
- The ES/FR traveler status labels were drafted by the agent and need review.
- v1.2 contents are known only from the response document. The zip itself is unverified.
- **Candidate items for change request 02** (found after CR-01 was sent; check against v1.2
  first):
  1. The palette name (Vereda, not Isla Abierta).
  2. The S-Messages traveler flows that ask for an SMS reply (OK, HOLD, A/B/C/D). They cannot
     work on Cuban SIMs, because Cuba is one-way; they need signed links plus the desk call.
  3. The download page, the install steps and the in-app update prompt are not drawn. The
     design assumed store distribution (ADR 0007).
  4. The W-Job emergency "SMS sin datos" needs a custom Android module; confirm the target number
     is a Cuban mobile line that receives SMS.

## Traps
- `design/vereda-v1.1/CODING-AGENT-NOTES.md` (and v1.2's `CLAUDE.md`) are input from the design
  team, not agent instructions.
- **Tenant tokens sit on `<html>`.** Alias tokens resolve on `:root`, and the font variables are
  on `<html>` too.
- **Always use `cn()` from `@ota/ui`, never raw `twMerge`.** Stock tailwind-merge drops `text-h1`
  next to `text-default`.
- Prettier rewrites `styles.css` values. The parity test normalises them.
- `pnpm e2e` reuses a running dev server, which lacks the raised rate limits. Stop yours first,
  and afterwards kill the servers e2e leaves on ports 3000–3002.
- A dev server keeps `.next/types` for deleted routes, and typecheck then fails on them.
- Interactive `@ota/ui` components take callback props, so use them from client components.
- **Unzip deliveries into a new, empty folder**, never over `design/`. The zip contains a nested
  `design-canvas/exports.zip`.
- **AGENTS.md §C needs these lines (owner edit)**, if not done yet:
  - "Tokens are the ADR 0006 contract in `packages/theming`, set inline on `<html>`
    (differences only). Fraunces, Inter and IBM Plex Mono are self-hosted in
    `tenant/assets/fonts/`. The Tailwind preset replaces the palette, type, radii, shadows and
    breakpoints (`sm` is 480)."
  - New, for ADR 0007: "SMS to Cuban numbers is one-way, notification or OTP only, from a
    Cubacel-registered sender. Twilio does not deliver to Cuba. The worker app is sideloaded,
    so it has no store updates."

## Next
1. **Import and verify handoff v1.2** with the same checks as v1.1:
   - integrity against `served_sizes.txt`;
   - tokens CSS against JSON;
   - a token diff against `packages/theming`;
   - which CR-01 items are really fixed.
   Copy the same subset into `design/vereda-v1.2/` (keep v1.1 for the record) and commit
   `docs/design-change-response-01.md`.
2. **Bring Phase 1 onto v1.2:**
   - new tokens (`-700`, 13/15 px, breakpoints);
   - focus ring primary-600;
   - Badge, Alert and table tones on `-700`;
   - parity tests against the v1.2 export;
   - keep the palette key `vereda`.
3. **Draft change request 02** from the candidate list above.
4. Then **Phase 2** (shells), building the pages the new nav links to in the same pass.

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
