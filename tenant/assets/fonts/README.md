# Typefaces (default tenant)

The design system's three families (ADR 0006), self-hosted and loaded by each web app's
`src/lib/font.ts` with `next/font/local`. A fork changes its typefaces by replacing these files
(and the loader's `src` paths); no component names a family directly.

| File | Family | Axes / weights | Source |
|---|---|---|---|
| `Fraunces-opsz-wght-latin.woff2` | Fraunces (display) | variable: wght 100–900, opsz 9–144 | `@fontsource-variable/fraunces` 5.3.0, `fraunces-latin-opsz-normal.woff2` |
| `Inter-wght-latin.woff2` | Inter (body and UI) | variable: wght 100–900 | `@fontsource-variable/inter` 5.3.0, `inter-latin-wght-normal.woff2` |
| `IBMPlexMono-400-latin.woff2`, `IBMPlexMono-500-latin.woff2` | IBM Plex Mono (codes, money, timers) | 400, 500 | `@fontsource/ibm-plex-mono` 5.3.0 |

All are the Latin subset, which covers English, Spanish, French, German and Italian, including
ñ, ç, œ, ¿, ¡ and €. A character outside it (for example ł in a traveler's name) falls back to the
system font. Each npm tarball was checked against the registry's integrity hash before
extraction. All three families are under the SIL Open Font License 1.1 (`licenses/`).
