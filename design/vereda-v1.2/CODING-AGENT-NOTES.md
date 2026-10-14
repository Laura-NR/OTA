# Vereda Expeditions · instructions for the coding agent

Read `HANDOFF.md` first, then `design-canvas/project/T-Signoff.dc.html` (open items in section 03).

- **Source of truth**: `design-canvas/project/*.dc.html` and `canvas.json` are the design. Do not edit them; a design change goes through the canvas (HANDOFF.md § 8). Build the application in its own folder in this repository.
- **Tokens**: use the names in `design-canvas/handoff/tokens.css`; never add a colour, radius or type size that is not there without flagging it.
- **Screens and routes**: `design-canvas/handoff/screens.json` lists every screen, its kind and size, and the screens it links to.
- **Strings**: take copy from `design-canvas/handoff/copy-inventory.json` (keys `<screen>.<seq>.<slug>`); ES and FR are to be translated. Square-bracketed values are configuration, never hard-coded; their owners are on T-Signoff 03.
- **Brand**: the logo files are in `design-canvas/brand/`; use `vereda-wordmark.svg` (28 px high on web, 26 px on admin and mobile, nothing beside it) and `vereda-mark.svg` for favicon, app tiles and push badges. Never retype the wordmark.
- **Accessibility**: WCAG 2.2 AA as drawn; focus ring 2 px teal on light surfaces, ochre on the dark sidebar; labels on icon-only controls; the audit is `A-A11y`.
- **Frozen with the baseline**: tokens, the status vocabulary (DS 03), the booking state machine (`G-StateMachine`), the thresholds on `A-Settings`, the document footers. Ask before changing any of them.
- **Change requests**: write findings to `design-change-request-NN.md` at the repository root, one table row per item (where, finding, what you need); the answer comes back as `design-change-response-NN.md`. Request and response 01 show the format.
- **Not inputs**: page 09 boards titled "Record · not for the build", `brand/option-a/`, `brand/option-b/`, `design-canvas/tools/`.
- **Verification**: `design-canvas/exports/png/<Board>.png` is the visual reference for any screen (also `exports/html/` and the per-page PDFs); the canvas (Play mode, version "Handoff v1.2") adds live links when you have access; the `.dc.html` source in `project/` is the reference for values.
