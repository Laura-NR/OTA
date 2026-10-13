# Copy inventory · Vereda Expeditions canvas · 11 Oct 2026

`copy-inventory.csv` / `.json`: every visible UI string on the 87 product screens of the design canvas (customer web and mobile, admin desk, worker and Ops Lite apps, generated documents, notifications). 9441 strings.

- key: `<screen>.<sequence>.<slug>` — stable while the screen keeps its name; the i18n catalogue can keep these keys or map them to spec §10.3 namespaces (e.g. `email.invoice.subject`).
- kind: `text` (visible), `aria-label`, `placeholder`, `alt`, `page-title`.
- en: as drawn. es / fr: to be translated (worker-app strings are already Spanish and copied into es). Strings with `{{holes}}` must keep the hole names.
- has_placeholder: bracketed values that wait for real data; see T-Signoff › 03 on the canvas.
- Not included: design-system and handoff sheets, the edge-state / accessibility / test-kit boards, and data inside artboard scripts (package names, province descriptions), which is catalogue content.
- Shared chrome (nav, footer, licence line) is listed once per screen so each screen is complete; deduplicate by `en` when building the catalogue.

# Design tokens · exported 11 Oct 2026

`tokens.css` is the DS 06 `:root` block (DS-Handoff on the canvas) with every custom property, grouped into three tiers: primitive (raw colour, type, space and radius values), alias (semantic names that reference primitives), component (names bound to a control). `tokens.json` holds the same tokens as `{ name: { value, group } }` per tier, for a build step or a token transformer. Frozen with the baseline (T-Signoff 01); changes go through T-Signoff 05 and are re-exported from DS-Handoff, never edited here by hand.

# Screen manifest · 12 Oct 2026

`screens.json` and `SCREENS.md`: every artboard with its page, kind (page / phone / fixed), frame size, title, the screens it links to (`href` to another `.dc.html`), its tweak names, and whether it uses repeats or branches. Generated from `project/canvas.json` and the boards; regenerate after any layout change (the script is in the session log: read the index, collect `href="*.dc.html"` and `data-props` per board).
