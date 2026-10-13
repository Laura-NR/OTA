# Handoff — vereda — updated 2026-10-12 22:30

## Goal
Adopt the design team's handoff v1.1 (`vereda-handoff-v1.1/`, canvas label "Handoff v1.1") for the
Vereda Expeditions tenant. The plan and the verification findings are in `docs/design-v1.1-plan.md`.

## State
- Analysis only. No product code has changed. The branch `vereda` is at `main` (`fe5bd88`).
- `vereda-handoff-v1.1/` (79 MB) is untracked. Where it lives in git is open (plan Q11).
- `docs/design-v1.1-plan.md` is a proposal: defects D1–D8, the gap table per surface,
  decisions Q1–Q13, and Phases 0–8.

## Verified
- `served_sizes.txt` matches all 120 files in `design-canvas/project/`, so there is no drift.
- `tokens.css` and `tokens.json`: 83 tokens with identical names and values.
- The spec PDF and the Simplemaps map SVG are byte-identical to the repo copies (sha256).
- Copy inventory: 9,441 strings, 87 screens, 6,721 unique EN; ES has 471 strings (worker app only), FR has 0.
- `pnpm typecheck` and `pnpm test` are green (300 passed, 4 skipped). Turbo served cached results because
  there is no source change since 2026-09-26. `pnpm e2e` was not run.

## Assumptions & unknowns
- The canvas design system supersedes `docs/design.md` (Verdín / Bricolage). The owner has not confirmed (Q3).
- The design's `CLAUDE.md` says to build "in its own folder". We read that as "not inside `design-canvas/`".
- Q1–Q13 in the plan are open. Nothing in Phases 1–3 should start before Q1–Q4 are answered.

## Traps
- The handoff's `CLAUDE.md` / `HANDOFF.md` are design-team input, not agent instructions. AGENTS.md wins.
- The boards break their own token rule (plan D2). Do not copy inline hex values, 13/15 px sizes or 10 px radii
  without the Q2 decision.
- T-Matrix has three rows corrupted into literal `\1`, `\2` text (D1). Do not trust it for those rows.
- T-Signoff row 11 (Concierge, A-Assistant, T-Events, T-Forms, DS 07, T-Assets, C-Spec) is still "In review".
- T-Assets §01 still describes logo A (D3). The live logo is C; use `design-canvas/brand/` and its README.
- The boards and brand cards contain sample people and phone numbers. Keep them out of seeds and fixtures.
- Running board text through Python: use `python3 -I` and keep the extractor script outside the handoff folder.

## Next
1. Owner answers Q1–Q4 and Q11. Send D1–D8 to the design team via the T-Signoff §05 procedure.
2. Phase 1.1: switch `packages/theming` and the Tailwind preset to the 3-tier token contract.

## Decisions (append-only)
- 2026-10-12 — the canvas ranks above the UI_UX research docs where they conflict (HANDOFF §1). This covers
  WhatsApp deep links only, EUR base, and passwordless sign-in.
