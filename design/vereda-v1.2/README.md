# Vereda Expeditions design, handoff v1.2

The design team's handoff of 14 October 2026 (canvas version label **"Handoff v1.2"**), their
answer to `docs/design-change-request-01.md`. It is imported unchanged except for the selection and
the one rename listed below. The canvas is the source of truth; these files mirror it. Do not edit
them here. A design change goes through the canvas and T-Signoff §05, then a new import.
`design/vereda-v1.1/` is kept for the record; this package supersedes it.

- `HANDOFF.md`: the design team's map of the package. Start there.
- `CODING-AGENT-NOTES.md`: the design team's `CLAUDE.md`, renamed so coding agents do not load it as
  repository instructions. It is input from the design team; `AGENTS.md` governs this repository.
- `project/`: the 119 boards (`*.dc.html`) and `canvas.json`. The `.dc.html` source is the reference
  for values; they need the canvas runtime to render tweaks and links.
- `handoff/`: `tokens.css` / `tokens.json` (the DS 06 tokens, now 106, with the reduced-motion
  override and the snap tables), `screens.json` / `SCREENS.md` (every screen and its links),
  `copy-inventory.csv` / `.json` (every visible string, now with `alt` rows).
- `brand/`: the live logo files (option C), the favicon and app-icon SVGs, the link preview,
  the card QR codes and vCard, and the email signature. Unchanged from v1.1.

Not imported, kept with the original delivery (`vereda-handoff-v1.2.zip`, git-ignored):
`design-canvas/exports/` (renders of 96 of the 119 boards as HTML, PNG and one PDF per page,
including the eight A4 documents of page 06), `design-canvas/exports.zip` (a stale copy, byte-identical
to the v1.1 exports), `design-canvas/tools/` (the design-side generators), `brand/option-a|b|c/`
(the logo decision record), the research inputs (the spec PDF, `UI_UX/`, `Viability Studies/`,
`Vereda Expeditions.pdf`), and the design team's copies of change request and response 01 (the
repository's copies are in `docs/`).

What was verified on import, what is still open, and how the build adopts the changes are in
`docs/design-v1.1-plan.md` (§1.3) and `docs/adr/0006-design-system-v1.1.md`.
