# Vereda Expeditions design, handoff v1.1

The design team's handoff of 12 October 2026 (canvas version label **"Handoff v1.1"**), imported
unchanged except for the selection and the one rename listed below. The canvas is the source of
truth; these files mirror it. Do not edit them here. A design change goes through the canvas and
T-Signoff §05, then a new import.

- `HANDOFF.md`: the design team's map of the package. Start there.
- `CODING-AGENT-NOTES.md`: the design team's `CLAUDE.md`, renamed so coding agents do not load it as
  repository instructions. It is input from the design team; `AGENTS.md` governs this repository.
- `project/`: the 119 boards (`*.dc.html`) and `canvas.json`. The `.dc.html` source is the reference
  for values; they need the canvas runtime to render tweaks and links.
- `handoff/`: `tokens.css` / `tokens.json` (the DS 06 tokens), `screens.json` / `SCREENS.md`
  (every screen and its links), `copy-inventory.csv` / `.json` (every visible string).
- `brand/`: the live logo files (option C), the favicon and app-icon SVGs, the link preview,
  the card QR codes and vCard, and the email signature.

Not imported, kept with the original delivery: `design-canvas/exports/` (renders, 54 MB),
`design-canvas/tools/` (the design-side generators; the province map there is identical to
`resources/cuban_map_svg - Pinar del Rio.svg`), `brand/option-a|b|c/` (the logo decision record),
and the research inputs (the spec PDF, which is identical to the repository's copy, `UI_UX/`,
`Viability Studies/`, `Vereda Expeditions.pdf`).

How the build adopts this design, the defects found on intake, and the decisions taken are in
`docs/design-v1.1-plan.md` and `docs/adr/0006-design-system-v1.1.md`.
