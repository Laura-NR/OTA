# ADR 0006 — Design system v1.1: the Vereda canvas replaces docs/design.md

- **Date:** 2026-10-13
- **Status:** Accepted; amended 2026-10-14 for handoff v1.2 and for change request 02 (see the end)
- **Deciders:** Project owner, lead engineer
- **Context:** `design/vereda-v1.1/` (design handoff v1.1), `docs/design-v1.1-plan.md`,
  `docs/design-change-request-01.md`, `packages/theming`, `packages/ui`, `packages/config`

## Context

On 2026-09-26 the owner adopted `docs/design.md` (Verdín palette, Bricolage Grotesque, radii
4/10/20) as the default-tenant identity. On 2026-10-12 the design team delivered a complete UI/UX
design for Vereda Expeditions:
- 119 boards;
- a three-tier token set (the Vereda palette: teal, terracotta, ochre, warm neutrals; the canvas
  calls it "Isla Abierta", a placeholder name);
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
  - `packages/theming` holds the default values, as the preset `vereda` (named for the agency; the
    canvas's placeholder name "Isla Abierta" is not used in code), and compiles a tenant manifest into these custom
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
- **Breakpoints.** DS 07: `sm` 480, `md` 768, `lg` 1024, `xl` 1280; there is no `2xl`. The v1.1
  export did not carry them (A5); v1.2 does, as `--bp-*`.
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
  `slate` no longer exist; an unknown palette falls back to `vereda`, as before. A-Settings
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

## Amendment, 2026-10-14: handoff v1.2

The design team answered change request 01 with handoff v1.2 (`design/vereda-v1.2/`,
`docs/design-change-response-01.md`); the verification is `docs/design-v1.1-plan.md` §1.3. The
token contract moves to the v1.2 export (106 tokens) and replaces the snaps above:

- **Dark tones are tokens, not snaps (A2).** `success/warning/error/info-700` are the text on a
  `-100` surface, `-200` the alert and pill borders, `warning-500` the attention-pill border; also
  `primary-50/200`, `accent-50/700` and `neutral-600`. Badges, alerts, the tinted crisis banners and
  the admin row tints use them. **Field errors stay `error-600`**, 14/20, because T-Forms and DS 02
  draw them there (A3).
- **Sizes (A3).** `--text-label` (600 13/16: pills, tabs, badges) and `--text-nav` (500 15/20:
  primary navigation) are component tokens; `--text-h1-compact` (28/34) and `--text-h2-compact`
  (22/28, display face) are aliases. Other off-scale sizes snap per the export's table.
- **Radii (A4)** snap per the export's table; no new radius.
- **Breakpoints (A5)** are primitives (`--bp-sm/md/lg/xl`) declared in `styles.css` and copied into
  the Tailwind screens. A media query cannot read a custom property, so a tenant cannot override
  them and `@ota/theming` never emits them.
- **Focus ring (A6)** is primary-600 (8.4:1 on the cream page).
- **`--color-text-on-primary` (A7)** is part of the export's alias tier. It is still the one alias
  that the tenant compiler switches (to `neutral-900` on a light primary).
- **A tenant's brand colour** now derives six primary steps: 700, 600, 500, 200, 100 and 50.
  Except at 500, these reproduce the design teal exactly.
- **The palette key stays `vereda` (A8).** The design team answered "Isla Abierta only", but they
  answered a draft of the request written before the owner's rename. The owner's decision stands,
  and change request 02 raises it again. An unknown palette still falls back to `vereda`.

## Amendment, 2026-10-14: the residues of v1.2, resolved by the build

The owner asked the build team to resolve change request 02 itself where it can.
These rules apply the existing tokens; none adds a token, so none needs T-Signoff
§05. The design team is informed, not asked (`docs/design-change-request-02.md`).

- **Colours the boards still draw (B1).** Snap to the nearest token:
  - `#A61E1E` → `error-700`; `#C98A00` → `accent-600`;
  - `#F7FAFB`, `#F3F8FA`, `#EEF3F5` → `primary-50`;
  - `#FFF8F7` → `neutral-50`; `#DCE6D5` → `success-100`;
  - `#A89F94` (W-Calendar's past days) → `neutral-500`, the muted text.
  - `#1B7F5C` is not UI: it is one of the canvas editor's alternative primaries
    for previewing a tenant's brand colour.
  - **Map fills:** `#CDE3D1` → `success-200`, `#FDE9B5` → `warning-100`,
    `#B8B0A6` and `#C9C2B8` → `neutral-300`.
  - **Chart tones:** a series uses `primary-600`, `primary-500`, `primary-200`,
    `primary-100` in that order.
  - `#1A0DAB` (the search-result preview) stays literal: it imitates another
    product's UI, not ours.
- **Sizes (B2):**
  - 10 and 11 px → 12 (`caption`, or `overline` when uppercase), including the
    bottom-nav labels and the documents' overlines;
  - 38 → 40 (`h1`); 44 → 48 (`display-2`); 52, 72 and 96 → 56 (`display-1`).
- **Radii (B2/A4):** 18 and 20 px → `lg` (12).
- **Focus ring (B3).** primary-600, as the token says. DS-Handoff's "primary-500"
  prose is stale.
- **Contrast (B4).** The `-700` tones pass AA on their `-100` surfaces: warning
  6.4:1, error 5.7:1. They are not 7:1 as the export's note claims, and no AAA
  claim is made for them.
- **"Action needed" (B5)** is amber everywhere (DS 03): `warning-100`, `warning-700`,
  `warning-500` border. A-Bookings' red is not followed.
- **Navigation (B8).** Home's six links are the nav, in the header and in the
  drawer. The admin wordmark carries the "Ops" caption as A-Dashboard draws it.
  "Talk to a specialist" shows from `xl` only, because at `lg` the six links leave
  no room for it.
- **Palette name (A1).** `vereda` in code, and the canvas's "Isla Abierta" is not
  carried over. Renaming the canvas is the design team's choice.
- **Renders (B6).** The `.dc.html` source stays the reference for the admin,
  worker and Ops Lite boards. Renders are welcome but not waited for.

