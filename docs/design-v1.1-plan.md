# Design handoff v1.1: verification and implementation plan

**Status:** Accepted 2026-10-13. The owner took every recommendation in §3 (Q7 remains open) and confirmed that the canvas replaces the 2026-09-26 design; see `docs/adr/0006-design-system-v1.1.md`.
**Input:** `vereda-handoff-v1.1/` (design team, dated 12 Oct 2026; canvas label "Handoff v1.1").
**Scope:** whether the package is complete and consistent, how far the code is from it, which decisions block the build, and the order to build in.
**Effect:** this plan replaces the "Design gap" section of `docs/development-plan.md`. `docs/design.md` (Verdín / Bricolage Grotesque, adopted 2026-09-26) is replaced by the canvas design system ("Isla Abierta": teal, terracotta and ochre; Fraunces, Inter and IBM Plex Mono).

---

## 1. Verification of the package

### 1.1 What checks out

| Check | Result | How it was checked |
|---|---|---|
| Board integrity | 119 boards plus `canvas.json`. All 120 files match `tools/served_sizes.txt` byte for byte, so there is no drift from the published canvas. | `wc -c` against `served_sizes.txt` |
| Token export | 83 tokens (59 primitive, 21 alias, 3 component). `tokens.css` and `tokens.json` hold identical names and values. | Parsed both and compared |
| Screen manifest | 119 entries on 9 pages. The counts match T-Signoff §01. | `screens.json` |
| Copy inventory | 9,441 strings with unique keys across 87 screens; 6,721 unique EN strings. | `copy-inventory.json` / `.csv` |
| Spec | `OTA - Specifications Document (3).pdf` is identical to the repo's `OTA - Specifications Document.pdf`. | sha256 |
| Province map | `tools/cuba-provinces-simplemaps.svg` is identical to `resources/cuban_map_svg - Pinar del Rio.svg`, so the map asset needs no change. | sha256 |
| Booking states | `G-StateMachine` shows the same 10 statuses as `packages/domain/src/reservation/state-machine.ts` (the code adds `DRAFT`). | Board text vs code |
| Thresholds | The 2 h / 30 min timers, amber at 75 %, red at 100 % or on decline, the 30-day credential pause and the 6 months + 30 days retention all match `packages/domain` (`dispatch/policy.ts`, `supplier/compliance.ts`, `retention/retention.ts`). | Board text vs code |

### 1.2 Defects to return to the design team (T-Signoff §05 procedure)

| # | Defect | Evidence | Impact |
|---|---|---|---|
| D1 | **T-Matrix is corrupted.** Three traceability rows were replaced by literal regex backreferences (`\1`, `\1\2 … \3 … \5`). | `T-Matrix.dc.html`: the rows after §10.2, after UX 9 and after VS 13 | Three requirement→screen mappings are lost (probably §10.3 i18n and two research rows). |
| D2 | **The boards use values that are not tokens.** The 90 product boards use 40 hex colours outside `tokens.css`. The main ones are dark semantic text tones: `#1B5E20` ×297, `#92400E` ×182, `#0D47A1` ×88 and `#B71C1C` ×84. T-Forms even names `error-700`, which is not a token. Off-scale type sizes include 13 px ×226, 15 px ×92, 22 px ×54 and 28 px ×35; off-scale radii include 10 px ×110. | Scan of product boards with inline SVG excluded | HANDOFF §3 says to take inline values literally, while CLAUDE.md says never to add an untokenised colour or size. For these values both rules cannot hold. |
| D3 | **References to the old logo (option A) remain.** The B-Logo title in `canvas.json` / SCREENS.md still says "the trail and the sun". T-Assets §01 names `vereda-logo-horizontal.svg` (no such file), "clear space = one sun diameter" and "cream trail, ochre sun". It also gives email-logo sizes of 140×40 / 280×80, while `brand/README.md` says 360×122 @2x. | `B-Logo.dc.html` `<title>` vs index; `T-Assets.dc.html` | Asset production could follow the wrong spec. |
| D4 | **Some boards are not accepted.** T-Signoff §02 row 11 is still **"In review"**. It covers T-Events, T-Forms, DS 07 (DS-Responsive), T-Assets, C-Spec, Concierge, M-Concierge and A-Assistant. | `T-Signoff.dc.html` §02 | We should not build Concierge or the analytics taxonomy against unaccepted boards. |
| D5 | **Exports are incomplete.** 50 of 119 boards are rendered, and only pages 01–03 have PDFs. T-Signoff §06 promises "page 06 as PDF" and "the five diagrams as SVG"; neither was delivered. | `exports/` | The documents (page 06) are where a pixel comparison matters most. |
| D6 | **Motion is disabled.** All three `--motion-*` tokens are `0ms`. | `tokens.css` | On 2026-10-13 this proved to be an **export bug**: DS-Handoff defines 120/200/320 ms, and the export kept its reduced-motion override. The build uses the DS-Handoff values (change request A1). |
| D7 | **Fonts are in the wrong place or missing.** Inter and Fraunces ship only under `tools/fonts/`, which HANDOFF §6 marks "not for the build". IBM Plex Mono is not supplied. | `design-canvas/tools/fonts/` | We source the fonts ourselves (all SIL OFL). |
| D8 | **The copy inventory is incomplete.** ES exists only for the 471 worker-app strings and FR is empty. The README lists an `alt` kind, but the inventory has none; photo alt texts live only on the boards. | `copy-inventory.json` | About 6,250 strings per language still need translating. Alt text must be taken from the boards. |

Two smaller issues:
- The research docs contradict the canvas in places. UI_UX 5 lists WhatsApp Business integration, USD/CAD multi-currency and password reset as MVP. UI_UX 11 says the WhatsApp Business API is unsupported in Cuba and recommends PWA-first. HANDOFF §1 ranks the canvas above the research, so **the canvas wins**.
- The design's `CLAUDE.md` says to "build the application in its own folder". The application already exists in this monorepo (`apps/`), so we read that as "not inside `design-canvas/`".

The boards and brand files also contain sample people: names, roles, work emails and a Havana phone number. These must not be copied into seeds or e2e fixtures (AGENTS.md Article 1).

---

## 2. Where the code stands against the design

The back end already covers most of the spec: the state machine, dispatch and escalation, documents, wire payments, inventory, packages, analytics and retention. The design adds three things on top:
- a complete visual and IA redesign of every surface;
- a significant expansion of the booking domain (travelers, departures, tiers, deposits, OFAC, consents, disruption cases, content);
- two surfaces that do not exist yet (the worker app and Ops Lite).

Re-checked on 2026-10-12: `pnpm typecheck` and `pnpm test` are green, with 300 unit tests passed and 4 skipped. Turbo served cached results because no source has changed since the last commit on 2026-09-26. The e2e suite (31 tests per the handoff) was not re-run. Today the i18n catalogue holds **710 keys per locale** against **6,721** unique design strings.

Legend: **R** restyle only · **E** extend on the current schema · **N** new screen on the current schema · **M** needs a migration (Article 2).

### Customer web (22 boards; each M-* board is the xs layout of the same route per DS 07)

| Design | Today | Gap |
|---|---|---|
| Home | `/` | R + E (search bar, advisory and event banners) |
| Destinations (map with 3 layers, province panel, route sketch, 14 places) | `/catalog` + `cuba-map.tsx` | E (provinces/destinations data files; the map asset already exists) |
| Destination detail | none | N (content) |
| Packages (filters, compare) | `/packages` | R + E |
| Package detail (tabs, tiers, departures) | `/packages/[slug]` | **M** (departures, tiers) |
| Booking (5 steps, guest provisioning, OFAC gate) | `package-booking-form.tsx` (sign-in first) | **M** (travelers, OFAC, consents) |
| Payment (deposit or full; SEPA, open banking, card, invoice) | `/checkout/wire`, `/checkout/mock` | **M** (deposit schedule, proof upload); card and open banking blocked on providers |
| Confirmation (next steps, CSAT) | none | N |
| Compare | none | N (client-side) |
| Custom builder → proposal | `/build` | R + **M** (proposal entity) |
| Concierge (events) | banner only | **M**; boards still in review (D4) |
| Account (overview, trips, documents, messages, payments, preferences) | `/account`, `/account/reservations/[id]` | E |
| Travel info, Blog, Blog post, About, Support, Legal | none | N (content; see the CMS decision, Q8) |
| Auth (passwordless **6-digit code**) | `/login` (magic link) | Auth change (Article 2, Q5) |
| Errors (404, 500, offline, compliance hold, maintenance) | Next defaults | N |
| Join (Spanish) | `/join-our-network` | R + **M** (national ID, vehicle, municipalities) |

### Admin (14 screens; nav: Dashboard · Bookings · Disruptions · Packages · Customers · Suppliers · Payments · Content · Reports · Settings)

| Design | Today | Gap |
|---|---|---|
| A-Login (passkey; role shown after sign-in) | `/login` | R |
| A-Dashboard (KPIs, aging buckets, dispatch matrix) | `/` board + `/escalation` + `/dispatch` | E (merge three pages) |
| A-Bookings / A-Booking | `/`, `/reservations/[id]`, `/reservations/new` | R + E (saved views, who-acts legend) |
| A-Disruption | none | **M** (cases, playbooks, traveler options) |
| A-Packages / A-Package-Edit | `/packages`, `/packages/[id]`, `/inventory`, `/imports` | **M** (package model v2, publish checks) |
| A-Customers | none (users only) | E + **M** (OFAC records) |
| A-Suppliers | `/suppliers`, `/suppliers/[id]`, `/applications` | R + E (+ **M** for backup-power fields) |
| A-Payments (reconciliation, proofs, refunds, payouts) | `PaymentPanel` on the workbench | N + **M** (refund approvals, proofs) |
| A-Content (advisories, blog, conditions, FAQ, media) | none | **M** |
| A-Reports | `/analytics`, `/regulatory`, `/quality` | E (merge three pages; charts) |
| A-Settings (users and invites, permission matrix, currencies, manifest, thresholds) | none | **M**; thresholds become runtime data |
| A-Assistant | AI summary card + draft button | E; board still in review (D4) |
| — | `/messages`, `/documents`, `/retention` | fold into Booking, Customers and Ops Lite |

### Other surfaces

| Surface | Today | Gap |
|---|---|---|
| Worker app W-* (7 phone screens, Spanish) | APIs exist (offers, accept/decline, availability, credentials); no client | New app; platform decision Q7; phone sign-in needs SMS (Q10) |
| Ops Lite AL-* (3 phone screens) | `/ops` and `/conversations` sockets exist | New app (Q7) |
| Documents D-* (8 A4) | voucher, work order, invoice (Playwright PDF) | R ×3; N ×5 (voucher page 2, proposal, offline kit ×2, MINTUR summary); QR codes need a library (Q10) |
| Emails E-* (10), SMS and push | magic link, message fallback, retention, digest | N ×10 templates + plain-text versions; SMS and push need a provider (Q10) |
| Analytics events (T-Events) | none | N + sink decision (Q10); board still in review (D4) |
| PWA / offline kit / low-bandwidth / large text | none | N |

---

## 3. Decisions needed (Article 2): owner first, then the design team

**Decided 2026-10-13:** every recommendation below is accepted. Q7 had no single recommendation and remains open. Defects D1–D8 are drafted for the design team as `docs/design-change-request-01.md` (to send).

| # | Decision | Options | Recommendation |
|---|---|---|---|
| Q1 | **Token contract** | (a) Make the design's 3-tier `--color-*` / `--text-*` / `--space-*` names the core contract. `packages/theming` generates them from the tenant manifest, so forks still override primitives, and the Tailwind preset maps utilities onto the alias tier. (b) Keep `--ota-*` and alias the design names onto it. | **(a)**. One vocabulary that designers and developers share. Option (b) leaves two vocabularies side by side. It is a rename across every component, done once in Phase 1. |
| Q2 | **Values outside the tokens (D2)** | (a) Snap to the nearest token now and ask design to add the missing ones (`*-700` semantic text tones, 13 / 15 px sizes, a 10 px radius). (b) Implement the literal values. | **(a)**. Keeps the token rule and puts the gap on record via T-Signoff §05. |
| Q3 | **Replace `docs/design.md`** | Confirm that the canvas supersedes the 2026-09-26 Verdín / Bricolage decision. | Confirm. Remove Bricolage and write ADR 0006 "Design system v1.1". |
| Q4 | **Icons** (Lucide, ISC) | (a) A static SVG sprite in `packages/ui`, built once from Lucide's SVGs, as T-Assets §03 specifies. (b) The `lucide-react` package. | **(a)**. No runtime dependency, and it matches the design contract. Both are a third-party asset, so both need approval. |
| Q5 | **Authentication** | Travelers: switch from magic link to a 6-digit email code (Better Auth's `emailOTP` plugin, already in the installed `better-auth`) and turn off email + password. Workers: phone code (needs SMS). | Approve the traveler email code. Defer the worker phone code until SMS exists, with email code as the interim. |
| Q6 | **Guest provisioning on submit** | An account is created from the booking email without signing in (spec §3.5, Booking). | Approve, with rate limiting and an email-verification step before the account sees documents. |
| Q7 | **Platform for the worker app and Ops Lite** | (a) Installable PWAs in a new Next app sharing `packages/ui`. (b) Expo, per ADR 0001 (which rejected "PWA-only" for offline and push reasons). | Owner call. UI_UX 11 argues PWA-first because app-store distribution for Cuba-related apps is restricted, and T-Signoff leaves it to us. If PWA: a new ADR superseding that line of ADR 0001. |
| Q8 | **Content management** (blog, destinations, FAQ, advisories, legal) | (a) In-house tables + A-Content, as drawn. (b) A headless CMS (new dependency). | **(a)**. Ship static content first, then move it into tables when A-Content lands. |
| Q9 | **Schema batches M1–M9** (§4, Phase 4–5) | Approve per batch. | Review each batch's schema diff before it is generated. |
| Q10 | **Third parties (accounts, money, or dependencies)** | Cuba-capable SMS (Twilio is blocked); open-banking provider; card gateway (TropiPay, deferred); self-hosted analytics (Matomo or Plausible); Sentry; a QR library; the ECB rate feed (display currencies). | Decide one at a time. Each sits behind an interface with a mock, as payments and AI already do, so none of them blocks UI work. |
| Q11 | **Where the design package lives in git** | 79 MB in total; `exports/` is 54 MB and the research PDFs are 13 MB. | Commit `project/`, `handoff/`, `brand/` and the two markdown files (about 5 MB) under `design/vereda-v1.1/`. Keep exports and research PDFs out, or use LFS. |
| Q12 | **Integration keys on A-Settings** ("shown once", rotation from the UI) | This conflicts with env-only secrets (Article 1, runbook). | Show status only (scope, last rotated); rotation stays a deploy operation. |
| Q13 | **Runtime-editable thresholds** (A-Settings, dual Super Admin save) | Move the constants in `packages/domain` behind a settings table that is passed into the pure functions. | Approve. The domain functions take thresholds as parameters with the current constants as defaults. |

---

## 4. Implementation plan

The build order follows HANDOFF §7, reordered so that the work needing no migration and no decision comes first. Each increment is one PR-sized vertical slice with unit tests, an updated e2e spec, i18n keys in all three catalogues, and a line in the handoff.

**The e2e suite asserts on English copy**, so an increment that adopts design copy updates its specs in the same PR.

### Phase 0: Intake (no product code)
1. Send D1–D8 to the design team. Ask for the missing tokens (Q2), the corrected T-Matrix and T-Assets, page 06 PDFs, and acceptance of row 11.
2. Get answers to Q1–Q4 and Q11. Commit the design package as decided.
3. Write ADR 0006 (design system v1.1). Replace `docs/design.md` with a pointer to the canvas and the token contract. Update AGENTS.md §C (owner edit).

### Phase 1: Foundations (no migration)
1. **Tokens:** `packages/theming` emits the 83 tokens in 3 tiers from a `vereda` preset; the tenant manifest overrides primitives. The Tailwind preset maps onto the alias tier. Remove `--ota-*` and the HSL-triple helpers. Tests cover token output and the contrast pairs from A-A11y.
2. **Fonts:** self-host Fraunces, Inter and IBM Plex Mono (Latin + Latin Extended, `font-display: swap`) via `next/font/local`; remove Bricolage. Low-bandwidth mode falls back to system stacks.
3. **Brand:** the wordmark and mark SVGs go to `tenant/assets/brand/`; SVG favicon now, raster icons when Vereda exports them (T-Signoff §03). The header wordmark is 28 px on web and 26 px on admin and mobile.
4. **Icons:** the sprite (Q4) with an `<Icon name>` component and an accessible-label rule.
5. **Components** in `packages/ui`, from DS 02–05 and A-States:
   - Button and the field pattern from T-Forms §00 (error under the field, summary links, focus on the first error).
   - Select, checkbox, radio, counter, stepper, tabs, accordion, modal/sheet/drawer, toast.
   - Status badge, crisis banner, cards, price block, timer pill (amber/red), table.
   - Empty, loading, denied and degraded states.
   - Focus ring: teal on light surfaces, ochre on the dark sidebar.
6. **Status vocabulary (DS 03):** a pure `travelerStatusLabel()` in `packages/domain` with tests, used by both apps. Admin keeps the system enum; travelers see the label.
7. **Copy pipeline:** a `tools/` script that imports a screen's strings from `copy-inventory.json` into `packages/i18n` namespaces (chrome de-duplicated by `en`). Strings are imported per screen as each screen is built, never in bulk. ES/FR translation runs alongside; the parity test stays green.

### Phase 2: Shells (no migration)
1. **Web header and footer:**
   - Nav: Destinations · Packages · Events · Travel info · Blog & guides · Support.
   - Footer: About, Cookie settings and Accessibility link to Legal; licence line from the manifest; one WhatsApp link from config.
   - xs bottom nav: Home · Search · Trips · Support.
2. **New storefront URLs**, with redirects: `/catalog` → `/destinations`, `/build` → `/custom`, `/join-our-network` → `/join`.
3. **Admin shell:** 240 px dark sidebar with the 10-item nav. Existing pages are re-homed under it (redirects from the old paths).
4. **Error pages:** 404, 500, offline, maintenance, compliance hold.
5. **Manifest additions** (packages/config, additive): WhatsApp number, per-province emergency numbers, legal identity (tax ID, address), concierge policy. Bracketed values are config and never shown in production (HANDOFF §5).

### Phase 3: Customer pages on today's data (no migration)
1. Home, Destinations (map layers driven by `provinces.json` + `destinations.json` in `tenant/`), Destination detail.
2. Packages listing with filters and Compare (client-side). Package detail restyled; tiers and departures hidden until M1.
3. Account restyle with its tabs; Auth restyle (magic link until Q5); Join restyle; wire Payment page restyle.
4. Static content pages: Travel info, About, Support, Legal, Blog. Served from catalogue/config until A-Content.

### Phase 4: Booking domain (migrations M1–M5, ask per batch)
- **M1 Package v2:**
  - departures (date, seats, price), accommodation tiers with deltas, extras, insurance plans;
  - booking model (instant/request), group size, lead time, tax classification;
  - cancellation and deposit policy references, included/excluded, Cuba notes, SEO;
  - per-locale fields, media with alt text and consent (`PackageMedia`), publish status, slug redirects.
  - This closes the open `PackageService.tier` and package-media items.
- **M2 Party and travelers:**
  - a `ReservationTraveler` row per traveler: names, date of birth, nationality, passport number (encrypted; key-management decision), emergency contact;
  - room set-up, tier, extras, and price lines.
  - This closes the open party-size and per-service-price items.
- **M3 Compliance:** OFAC affidavit (category, signature, IP, timestamp; 5-year retention, which must be reconciled with the retention purge) and consent records with text-version ids.
- **M4 Payment schedule:** deposit/balance instalments, due dates, proof-of-transfer uploads, fees, refunds with approval chain.
- **M5 Proposal:** custom-trip proposal entity (D-Proposal).
- **Domain (pure, tested):**
  - pricing v2: tiers, child bands, single supplement, per-night seasons, fees;
  - deposit eligibility (departure more than 60 days away);
  - jobs: auto-cancel after 48 h unpaid; auto-cancel after 72 h in ACTION_REQUIRED with no fallback; auto-dispatch within 3 min.
- **Screens:**
  - Booking (5 steps, guest provisioning, server price and availability re-check);
  - Payment (deposit or full; wire + proof; card and open banking shown disabled until Q10);
  - Confirmation (with CSAT);
  - Account trips, documents and payments;
  - Custom builder → proposal requested.

### Phase 5: Admin redesign and new modules
Ordered by value to the operations desk. Batches M6–M9 are asked for as they come up.
1. Dashboard (board, escalation and dispatch merged; aging buckets).
2. Bookings and Booking detail.
3. Suppliers (applications folded in; reliability; backup power, **M6**).
4. Payments (reconciliation, proofs, refunds within thresholds, payouts by province).
5. Customers (OFAC, retention, communication history).
6. Packages + editor v2 (publish checks).
7. Reports (analytics, regulatory and quality merged).
8. Content (**M7**: advisories with two approvals, blog, conditions, FAQ, media).
9. Disruption (**M8**: cases, playbooks, traveler options with deadline).
10. Settings (**M9**: thresholds Q13, invites, permission overrides with expiry, currencies, manifest view).
11. Assistant, once accepted.

Every new route goes into `apps/api/test/authorization.e2e.test.ts`.

### Phase 6: Documents and notifications
1. Restyle the voucher (2 pages), work order and invoice. Add the proposal, offline kit (2 pages) and MINTUR summary. Embed Fraunces and Inter in the PDF renderer; the licence footer goes on every page; QR codes per Q10.
2. Ten 600 px email templates with plain-text versions, on the C-Spec triggers (payment reminder at 2 h, T−7 reconfirmation, NPS at +24 h, advisory, options, OFAC).
3. SMS and push behind a `NotificationChannel` interface with a console mock until a provider is chosen.

### Phase 7: Worker app and Ops Lite (after Q7)
1. **W-* (Spanish):** sign-in, home (availability, offer timer), offer accept/decline, calendar, credentials, earnings. The APIs exist. The offline job screen needs the G-Sync outbound queue.
2. **AL-*:** alerts with one-click re-dispatch, pipeline and inbox, on the existing `/ops` and `/conversations` sockets.

### Phase 8: Instrumentation and hardening
1. **T-Events taxonomy** (once accepted): a consent-gated client that hashes identity, plus the sink from Q10.
2. **PWA:** manifest and service worker for vouchers and the offline kit; low-bandwidth mode; large-text preference.
3. **Responsive and accessibility:** Playwright projects at the DS 07 test widths (320, 375, 414, 768, 1024, 1440). An accessibility audit against A-A11y; an axe integration is a new dependency (ask).
4. **Concierge** (once accepted): events and requests migration (**M10**) with its screens.

### Sequencing summary

| Phase | Blocked by | Migrations | New third parties | Relative size |
|---|---|---|---|---|
| 0 Intake | — | — | — | S |
| 1 Foundations | Q1–Q4 | — | fonts (OFL), icon sprite | M |
| 2 Shells | Phase 1 | — | — | M |
| 3 Customer pages | Phase 2 | — | — | L |
| 4 Booking domain | Q5, Q6, Q9 | M1–M5 | — (card/open banking stay mocked) | XL |
| 5 Admin | Phase 2, Q9, Q12, Q13 | M6–M9 | — | XL |
| 6 Documents and notifications | Phase 1 | — | QR library, SMS provider | L |
| 7 Worker app and Ops Lite | Q7 | — | possibly Expo | L |
| 8 Instrumentation | D4, Q10 | M10 | analytics sink, Sentry | M |

Phases 1–3 need no migration and no third-party account. They can start as soon as Q1–Q4 are answered.

---

## 5. How each increment is verified
- **Values:** the `.dc.html` source is authoritative. Visuals are checked against the canvas in Play mode, version "Handoff v1.1". Tickets cite the artboard name and the version label (T-Signoff §05).
- **Tests:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, plus the e2e specs touched by the increment. Every new pure rule (pricing v2, status labels, deposit eligibility, auto-cancel timers) gets unit tests.
- **Copy:** the strings come from the copy inventory, keyed in all three catalogues. A string with a bracketed value goes into the manifest, never into the UI.
