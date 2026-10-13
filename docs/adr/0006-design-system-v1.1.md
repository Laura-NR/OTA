# ADR 0006 — Design system v1.1: the Vereda canvas replaces docs/design.md

- **Date:** 2026-10-13
- **Status:** Accepted
- **Deciders:** Project owner, lead engineer
- **Context:** `design/vereda-v1.1/` (design handoff v1.1), `docs/design-v1.1-plan.md`,
  `docs/design-change-request-01.md`, `packages/theming`, `packages/ui`, `packages/config`

## Context

On 2026-09-26 the owner adopted `docs/design.md` (Verdín palette, Bricolage Grotesque, radii
4/10/20) as the default-tenant identity. On 2026-10-12 the design team delivered a complete UI/UX
design for Vereda Expeditions:
- 119 boards;
- a three-tier token set (palette "Isla Abierta": teal, terracotta, ochre, warm neutrals);
- Fraunces, Inter and IBM Plex Mono;
- a status vocabulary and component specs;
- every screen of the web, admin, worker and Ops Lite apps, the documents and the notifications.

The intake review is `docs/design-v1.1-plan.md`. It recorded the decisions Q1–Q13, and the owner
accepted every recommendation on 2026-10-13. Q7 (PWA vs Expo for the worker app and Ops Lite) had
no single recommendation and stays open.

## Decision

**The canvas design (handoff v1.1) is the default-tenant design system. `docs/design.md` is
retired and now points here.**

- **Tokens (Q1).** The core token contract is the design's three-tier set: 59 primitives, 21
  aliases and 3 component tokens, using the design's names (`--color-primary-600`,
  `--color-text-default`, `--text-h1`, `--space-4`, …).
  - `packages/theming` holds the default values, as the preset `islaAbierta` (the name A-Settings
    gives the manifest's `theme.palette`), and compiles a tenant manifest into these custom
    properties. A tenant overrides **primitives only** (DS 06: "alias and component tokens never
    change per tenant").
  - `packages/ui`'s Tailwind preset maps utilities onto these names. The `--ota-*` HSL-triple
    contract, its helpers and the four non-Vereda presets are removed.
  - One alias is added on top of the design set: `--color-text-on-primary`, which keeps text
    readable when a fork picks a light brand colour (change request A7).
- **Values the boards use but the tokens lack (Q2).** These are snapped to the nearest token and
  sent back to the design team as change request 01. Examples: semantic `-700` text tones → `-600`;
  13 px → 12/14 px; 10 px radius → 8 px. The motion tokens are built from DS-Handoff's own values
  (120/200/320 ms), not from the `0ms` export, which is an export bug (A1).
- **Breakpoints.** DS 07: `sm` 480, `md` 768, `lg` 1024, `xl` 1280; there is no `2xl`. The export
  does not carry them yet (A5).
- **Fonts.** Fraunces (variable, wght + opsz), Inter (variable, wght) and IBM Plex Mono (400, 500),
  Latin subset, self-hosted from the Fontsource 5.3.0 builds (SIL OFL) in `tenant/assets/fonts/`
  and loaded with `next/font/local`. Bricolage Grotesque is removed.
- **Icons (Q4).** Lucide (ISC), vendored as one SVG sprite in `packages/ui`. It is generated from a
  pinned `lucide-static` release by a repository script; there is no runtime dependency.
- **Other accepted decisions** from the plan, implemented in later increments:
  - Q5: travelers sign in with a 6-digit email code; email + password is turned off.
  - Q6: a guest account is provisioned on submit, rate-limited and email-verified before documents
    are shown.
  - Q8: content (blog, destinations, FAQ, advisories, legal) is stored in in-house tables behind
    A-Content.
  - Q9: schema batches M1–M10 are each reviewed before generation.
  - Q10: each third party sits behind an interface with a mock until it is chosen.
  - Q11: the selected design package is committed under `design/vereda-v1.1/`.
  - Q12: integration keys are shown as status only.
  - Q13: thresholds become runtime settings, passed into the pure domain functions.

## Consequences

- **Breaking for forks.** The `theme.palette` presets `ecoGreen`, `oceanBlue`, `terracotta` and
  `slate` no longer exist; an unknown palette falls back to `islaAbierta`, as before. A-Settings
  also lists an `ecoGreen` preset, but the design defines no values for it; that question is in
  change request 01 (A8). A fork restyles by
  setting `branding.primaryColor` (the primary scale is derived from it) and, optionally,
  `theme.tokens` (any primitive). The default `branding.primaryColor` becomes `#0B4F6C`.
- **`theme.borderRadius`** keeps working: it scales the radius primitives (`none`, `sm`, `md`,
  `lg`). `md` is the design.
- **Utility names change across both apps** (for example `text-muted-foreground` → `text-muted`,
  `bg-primary` → `bg-action-primary`). This is a one-time rename.
- **Status and copy.** Status labels follow the DS 03 vocabulary. Copy is imported per screen from
  the design's copy inventory.
- **AGENTS.md §C** has lines that describe the `--ota-*` contract and Bricolage. They are stale
  once this lands; the owner updates them (agents may not edit AGENTS.md).

## Rejected alternatives

- **Keep `--ota-*` and alias the design names onto it.** That would mean two vocabularies for the
  same values, so designers and developers would no longer share names.
- **Take the board values literally.** That would put 40 untokenised colours and a dozen
  off-scale sizes into the core, against the design's own token rule.
- **`lucide-react`.** It adds a runtime dependency, while the design contract specifies a sprite.
