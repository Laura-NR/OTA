# Design system: retired, see the Vereda canvas

This file used to hold the default-tenant design system adopted on 2026-09-26 (the Verdín palette
and Bricolage Grotesque). On 2026-10-13 the owner replaced it with the design team's canvas design,
handoff v1.1 (`docs/adr/0006-design-system-v1.1.md`). That earlier text is in git history
(`git show fe5bd88:docs/design.md`).

Where the design system lives now:

- **The design:** `design/vereda-v1.1/`. Start with `HANDOFF.md`; the boards are in `project/`, the
  tokens in `handoff/tokens.css`, the screens in `handoff/SCREENS.md` and the copy in
  `handoff/copy-inventory.json`. Use the canvas (version "Handoff v1.1") for visual checks and the
  `.dc.html` source for values.
- **The token contract in code:** `packages/theming` holds the token names and defaults and
  compiles a tenant into CSS custom properties. `packages/ui` holds the Tailwind preset and the
  components.
- **How the build adopts it:** `docs/design-v1.1-plan.md` (gap analysis, decisions, phases).
- **What we asked the design team to fix:** `docs/design-change-request-01.md`.
