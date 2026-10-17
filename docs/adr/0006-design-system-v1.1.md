# ADR 0006 — Design system v1.1: the Vereda canvas replaces docs/design.md

- **Date:** 2026-10-13
- **Status:** Accepted; amended 2026-10-14 for handoff v1.2, for change request 02 and for Phases 3 and 5 (see the end)
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


## Amendment, 2026-10-14: Phase 3 customer pages, resolved by the build

Phase 3 built Home, Destinations, Destination, Packages, Compare, Package,
Account, sign-in, Join and the bank transfer page on today's data. As the
owner asked, the build resolved what the boards leave open with the existing
tokens; no token was added.

- **Sizes (B2 snaps, applied):**
  - 44 px titles (Destinations, Package) → 48 (`display-2`); Destination's 48
    is already `display-2`;
  - 36 px figures and headings (Why tiles, custom band) → 40 (`h1`);
  - 28/36 section headings → `h1-compact` (28/34); 24/28–30 destination names
    → `h3` (24/32) in the display face;
  - 15 px running text (Why points, conditions rows, filter labels) → 16
    (`body`);
  - the map's 11 and 12 px labels stay in map units: they scale with the
    drawing, so they are geometry, not a type size.
- **Radii:** 16 px (hero photo, custom band) → `lg`.
- **Colours:**
  - the photo tints (`#B9CFD6`, `#E3B9A6`, `#DCC9B6`) → `bg-sunken` with the
    "Photo to come" slot Phase 2 uses, until photography exists;
  - map layers: coverage per B1 (`success-200`, `warning-100` dashed, hatched
    `neutral-100`/`neutral-300`), conditions on the `-100` tones with `-600`
    strokes, route stops `secondary-600`;
  - Join's figure tiles: `neutral-0` at 10 % on `primary-700`, an opacity of an
    existing token.
- **Interaction:** Package uses the DS 03 tabs; Destination's section row is
  anchors (no scroll spy yet); Account sections are links (`?tab=`), a sidebar
  from `lg` and tabs below it; the Compare selection lives in the tab's session
  storage; the DS 03 Stepper's phone bar fills to the furthest step reached.
- **One copy set per route.** The M-* boards' shortened strings are not used;
  a phone shows the desktop copy.
- **Not drawn, because the data or a decision is missing:**
  - reviews and testimonials (the boards' are samples; real ones need consent);
    hosts' portraits (written consent); the 30-day power history (a conditions
    feed, A-Content);
  - Search's "When" and "Travelers", package categories, pace, group size,
    tiers, departures and Save (M1, M2, saved trips);
  - deposit or full, deadline, proof upload, sanctions notice and the card and
    open-banking rails (M4, counsel, Q10);
  - Join's national ID, municipalities, languages and licence photo (M-batch, a
    public upload);
  - Events links and "Request event access" to Concierge (M10; the request goes
    to the Support form);
  - passkey, Google and Apple sign-in (Q5).
- **Truth over sample.** Copy that states how the system behaves says what it
  does today: sign-in links expire "after a few minutes" (Better Auth's 300 s,
  not the board's 15 minutes) and the data note follows the retention lifecycle
  (ADR 0004). The booking pill reads "Request to book", which Vereda's tenant
  overrides with its own "Request · 24 h".

## Amendment, 2026-10-14: Phase 5 admin, resolved by the build

Phase 5 built the admin surfaces on today's data, where no migration is needed;
only A-Packages v2 waits on M1. The Dashboard (A-Dashboard), Bookings and
Booking (A-Bookings/A-Booking) and the merged Reports (A-Reports) are done. As
the owner asked, the build resolved what the boards leave open with the existing
tokens; no token was added.

- **Dispatch matrix (A-Dashboard).** The timer column sits right after the
  booking, not last as the board draws it, so the time left stays in view where
  the table scrolls; **Open** sits under the timer. Re-dispatch shows on amber,
  red and unassigned items only, because a green row has nothing to re-dispatch.
  Ops clocks are Havana time (`OPS_TIME_ZONE`, `@ota/domain`
  `time/ops-calendar`). The dashboard merges the pre-redesign escalation and
  dispatch pages; `/dashboard/dispatch`, `/escalation` and `/dispatch` redirect.
- **A-Bookings.** The saved views are a row (All · Needs attention · Arriving
  soon), each with its count; the state machine is a chip row with per-state
  counts; the list orders by urgency and is a table from `md`, cards below it.
  The money column is the total with the paid amount under it (total · paid).
- **Who-acts legend.** Copy that describes behaviour follows the system: the
  desk starts dispatch (no auto-dispatch yet), a decline or timeout makes
  ACTION_REQUIRED, and there is no 48 h payment window, audio cue or 72 h SLA
  yet.
- **A-Suppliers.** The list is the compliance register: category chips (All ·
  Casas · Drivers · Guides · Translators), province and verification filters, and
  a table with each worker's credential state, reliability (the acceptance rate
  over the dispatch-offer ledger) and auto-dispatch state. "Add supplier" is not
  a create form: recruitment is the `/suppliers/applications` path, so the header
  links there. The board's **Power** and **Last job** columns wait for M6
  (backup-power fields) and a job-history source; they are not shown. The detail
  is the credential inspector: the profile, the auto-dispatch state, the
  reliability score and the availability calendar. Its backup-power, vehicle and
  payout fields wait for M6 and the payments module.
- **A-Payments.** The read-only ledger becomes the A-Payments transactions view:
  a header with the paid total and the pending/refunded counts, status filter
  chips, and a rail-labelled table that links each receipt to its booking. The
  refund queue, the payout liabilities by province, the next payout runs and the
  rails health wait for M4 and a payouts source; the page says so in a note.
- **A-Customers.** The account list (`/customers`) shows each traveler's trip
  count, last activity and GDPR retention state; the profile (`/customers/[id]`)
  shows identity, the trips and the retention lifecycle. The read model is
  `GET /customers` + `GET /customers/:id` (ops-only). The OFAC certification,
  preferences, passport documents and the communication history wait for M2/M3;
  the profile says so.
- **A-Package-Edit (Phase 5 item 6).** The package editor edits the M1 details
  and the accommodation tiers, departures, optional extras and day texts as
  inline lists, saved in one PATCH through the M1 write path. Publishing runs the
  domain `packagePublishIssues` first and blocks with the reasons. Package photos
  are uploaded and served behind packages/storage (`POST /packages/:id/media`,
  `GET /catalog/packages/media/:id`), and the public catalog overlays a locale's
  published translation (`?locale=`). Since 2026-10-16 the editor is three tabs
  (Details, Photos, Translations; every panel stays mounted, so unsaved edits
  survive a switch). Photos label the first "Hero" and the rest "Gallery n", as
  the board does; a photo that shows people carries a consent badge, warning-toned
  while the reference is missing. The board's "WebP ≤ 300 KB" and low-bandwidth
  variant are not enforced (the API takes JPEG, PNG or WebP up to 5 MB): resizing
  needs an image library, a dependency question. Translations show one status per
  locale (source, not yet, draft, outdated, in sync) from the source-text
  timestamp; the board's per-field "day 4 pending" is not tracked. Each field
  shows the source text as its placeholder, and a blank field falls back to it.
- **A-Booking travel party (M2, 2026-10-16).** Two sections join the booking page
  after the services: **Travelers** (tier and departure, the travelers, the rooming
  list and the extras, edited in place and saved in one PUT) and **Price breakdown**
  (the frozen price lines and their total, the lines the invoice prints). The
  board's "CA passport ending 4471" is not drawn: no list carries the number or its
  tail, so a traveler reads "Passport on file · expires …" and **Show passport
  number** fetches it for one traveler from the audited vault route (operations and
  Super Admin; support sees the status only). The board's Needs, OFAC and traveler
  documents rows wait for preferences, M3 and the traveler document uploads; the
  deposit and balance line waits for M4; "Locked to package v3.2" waits for package
  versions (M1 D3c). Once a payment link exists the section says the price is
  locked and only corrections that leave it unchanged save.
- **M3 compliance surfaces (2026-10-17).** The booking page gains an **OFAC
  certification** section: each US traveler certified (category, online or paper,
  date) or "Not certified", a warning that payment and vouchers are held, the
  board's "Upload signed affidavit" as **Record a paper affidavit** (category,
  name, date, scan) and "View affidavit (logged)" as **View record** (signature,
  IP, browser, statement; the read is audited). A-Dashboard's alert reads
  "N bookings · OFAC missing" and opens a **Missing OFAC** saved view on
  A-Bookings. A-Customers shows an OFAC column on the trips and the **Consent
  log** (purpose, granted or withdrawn, text version, when, source); the board's
  cookies/marketing/terms/region summary is the log itself, newest first. "Send
  certification reminder" waits for the E-OFAC email (Phase 6). On the
  storefront the Booking form's step 4 does not exist yet, so the certification
  step sits on the account trip page above Payment, which shows the locked notice
  instead of "Proceed to payment" until every US traveler has signed. Account
  gains **Preferences** with the board's two consent-based notifications as
  switches, each with the words it records; the board's language, currency,
  travel-style and accessibility rows and the transactional booking updates are
  not consents and wait for a preferences model.
- **A-Reports (merge).** One `/reports` page carries the spec §4.9 sections as
  anchors (financial, regulatory, dispatch, quality, geography), and
  `/analytics`, `/regulatory`, `/quality`, `/reports/regulatory` and
  `/reports/quality` redirect there (307). The window is a preset (mtd,
  lastMonth, ytd, all); `?year=` is still accepted for old links.
- **Charts are one-hue bar lists.** Every chart is a `BarList` (primary-600)
  named by its label and value in text, so colour carries no identity. No token
  triplet passes the categorical palette check (the dataviz validator rejects
  the board's three rail colours; the teal is too low in chroma).
- **Not drawn, because the data or a decision is missing:** payment windows,
  owner/My queue, OFAC, disruption, the audio cue and mute, the on-the-ground
  panel, search, CSV export, version locks, internal notes, travelers and
  itinerary on the booking, the GBV-by-month chart, the reinvestment ledger and
  NPS.

## Amendment, 2026-10-17: Phase 4 Booking form, resolved by the build

The storefront Booking form (Booking / M-Booking boards) is built at
`/packages/<slug>/book` on M1–M3, with the existing tokens and no new one. The
owner chose sign-in first (2026-10-17): a signed-out visitor signs in by magic
link and returns to the form, so the board's "You don't need an account: we
create one with a sign-in link" is not drawn and the lead's email is the
account's, read-only. This amendment supersedes the Phase 5 amendment's note
that the certification step lives only on the account trip page; that step
stays there for bookings made before the form.

- **Frame and values.** The site header stays (no checkout-only header, no
  "Save & exit": drafts are not saved). The DS 03 `Stepper` sits above, at the
  board's 760 px; its dots are not buttons, so going back is the Back buttons
  and the review's Edit links. Step titles are `text-h2` (Fraunces 32/40) and
  `text-h2-compact` below `md`; panels are `rounded-lg` (12 px) with 28 px
  padding (20 px on phones); the summary is a 360 px sticky aside from `lg`,
  stacked under the step below it.
- **Travelers and kinds.** The counters read adults 18 and over, children 2 to
  17 and infants under 2, and the API reads each traveler's kind from the date
  of birth on the departure day; a date of birth that contradicts the counted
  kind holds step 4. The board's "2–12 pay 60 %" comes from the manifest's
  child bands, listed under the counters. The 10 % group rate for six or more
  is not shown: pricing has no group rule.
- **Rooms.** "Share" puts two to a room and makes the last a triple for an odd
  party, with no supplement; "A private room for each traveler" gives every
  traveler with a bed a room of one, and the tier's single supplement is
  charged per such room (the board labels it "pp"). A traveler alone sees "a
  room of your own" with the roommate request, which is stored for the desk
  and not priced.
- **Stay and extras.** A tier card shows its name, its per-person price
  (departure or base plus the delta) and its description; the board's casa
  names and backup-power lines per tier wait for tier content. Insurance plans
  are not modelled, so step 3 shows a **Required** card saying the traveler
  brings their own policy, and the insurance acknowledgement is recorded at
  review. "Already in your price" lists the package's included items.
- **Travelers step.** Every traveler may give a passport number (the board
  shows it for the lead only), because a traveler cannot edit the party after
  booking. Country names are formatted on the server. The lead's mobile and
  emergency contact are required, as the board does not mark them optional.
  The US certification sits inline under each US traveler with the account
  OFAC copy; "Answer three questions" and "Read more" are not drawn.
- **Review.** "What happens next" follows the system: no 24 h answer, no 20 %
  deposit, no 48 h window and no deposit or balance lines until M4; the
  summary's note says the price is fixed when the payment link is sent (it
  locks at PENDING_PAYMENT). "Cancellation, in short" is not drawn until the
  manifest has the scale (M4 D2). The consent boxes show the tenant's legal
  texts, one box per distinct text (terms, privacy and cancellation share one
  today); only the privacy notice is linked, as the other pages wait for
  counsel. The submit label wraps on phones instead of widening the page.
- **Request received.** The panel shows the booking code, "Nothing has been
  charged", the four-step timeline and "Go to My trips". "We've emailed a copy
  and sent you a sign-in link" is not drawn (no email is sent at submit and the
  traveler is signed in), nor is "How was this?", which belongs to the
  Confirmation screen.
- **Package page.** The sticky summary keeps the price, the booking-model pill
  and the support links; its date inputs are gone and "Check availability &
  request" opens the form.

## Amendment, 2026-10-17: M4 payments, resolved by the build

M4 (deposit and balance, proofs of transfer, refunds) is built on the Payment,
A-Booking and A-Payments boards with the existing tokens. The owner approved
D1–D8 as recommended; the agency's terms are manifest placeholders until
counsel and the owner confirm them.

- **Payment page.** The board's standalone Payment page is the trip page's
  payment section plus the bank-transfer instructions page. Before the first
  payment the traveler chooses **Deposit · 20 %** (with the balance and its
  date) or **Pay in full**, as radio cards; bank transfer is the only method,
  and "Card payments are not available yet" stands in for the card, wallet,
  open-banking and invoice tabs. The board's "46 h 12 min left" countdown, the
  sanctions checkbox (a PAYMENT_TERMS consent, waiting for counsel on the
  deposit's refundability) and the "+3 %" card copy (the card fee is 0 % until
  counsel rules, PSD2 art. 62(4)) are not drawn.
- **Schedule and proof.** After the choice, each instalment shows its amount,
  due date and a Due, Overdue or Paid chip. A balance falls due on a calendar
  day, read in UTC on both sides; a payment window ends at an instant, shown in
  UTC on the storefront and Havana time on the desk. The proof upload sits on
  the trip page behind sign-in, not on the public instructions page (a
  capability URL), which points to it; a rejected proof shows the desk's note
  and can be replaced. The board's 7, 3 and 1-day reminders wait for Phase 6.
- **A-Booking.** The payment panel shows the schedule with **Give 24 h more**
  on each instalment due, the plan choice on the first link and "Next link"
  after it, the receipts with their card fee and proofs (view, logged; accept,
  which extends the window a business day; reject with a note), and the
  refunds with a request form whose **Suggest from the policy** fills the
  cancellation scale's amount.
- **A-Payments.** "Proofs to check" and "Refunds" are lists above the ledger
  rather than the board's tabbed transaction table. "Confirm now on proof
  (override)" is not drawn (D5b waits for a bank feed), nor are the
  bank-statement import, "Record a payment", the ONAT button, the KPI tiles,
  payout liabilities, payout runs, rails health and the travel-credit offer.
  The approval limits line comes from the manifest.
- **Alerts.** A-Dashboard adds "payment window over" and "balances overdue",
  both opening a new **Payment due** saved view on A-Bookings; neither changes
  a booking's status (D3, D4).

## Amendment, 2026-10-17: Phase 6 notifications, resolved by the build

The E-Received, E-OFAC and 7/3/1 instalment emails are built on the existing tokens, the tenant
`EmailBranding` and the traveler's locale. No token was added.

- **Email shell.** Email clients do not load the web token stylesheet, so the templates keep the
  existing inline Arial/neutral shell and use the tenant's `branding.primaryColor` for the heading,
  button and links. The new templates live in `packages/email` and take `locale` (en/es/fr), the
  same `EmailBranding` and plain-text bodies. This is the email counterpart of the token rule, not a
  second visual system.
- **E-Received.** The Booking form's "Request received" panel now says a copy was emailed
  (`sent.emailed`, `text-body-sm text-muted`). The email follows the board's facts (booking code,
  nothing charged, package, dates, total, track link) in the traveler's locale. The board's
  host-confirmation promises and the 24-hour reply are tenant copy, not hard-coded: the email says
  the dates are being confirmed without promising a specific hour.
- **E-OFAC.** The board is Spanish; the template is localized en/es/fr and uses the board's
  two-minute form, the 31 CFR § 515.561 reference, the five-year retention note and the account
  link. The desk action lives on each A-Customers trip row with missing certifications, using the
  existing DS Button (tertiary, sm); a send is audited and changes no OFAC record.
- **Balance reminders.** The E-Confirmed board promises reminders 7, 3 and 1 day before the balance;
  the template carries the amount, the UTC calendar due date and the days left. The board's live
  countdown, the 24 h/2 h E-Reminder and the SMS channel are not drawn: they need a different
  trigger and a provider.
- **Not resolved here.** The M5 D-Proposal screen is drafted in `docs/schema-m5-proposal.md` and is
  not built, so its document layout stays a Phase 6/M5 design task.

## Amendment, 2026-10-17: M5 custom proposals, resolved by the build

M5 (custom request → priced proposal → acceptance) is built on the existing tokens and the
D-Proposal board. No token was added.

- **The builder is now a request, not a booking.** `/custom` keeps the five-step shape but sends a
  `CustomRequest`; its success panel is **Proposal requested** with the reference and a link to the
  proposal. The designed builder's provinces, pace, interests, per-stop stays and activities are
  not drawn yet; the current picker, dates, party and notes are what the desk prices.
- **The traveler proposal page** (`/account/proposals/<id>`, sign-in required) uses the DS 03 badge
  for the status, `text-h1-compact` for the reference, a `Table` for the price lines, the display
  face for the summary, and the usual primary button for **Accept this proposal**. The planning fee
  is a caption under the total: shown for transparency, never added to the amount due.
- **The desk queue** is a **Proposals** tab under Bookings, not a new sidebar section, so the
  A-Dashboard ten-section navigation is unchanged. The detail page shows the request, the current
  version and a composer: a summary, a validity date and a price-line table with literal class names
  and the existing `Select`/`Input` components. Publishing a version sends the proposal email and
  marks it SENT; the previous version stays readable.
- **Not drawn:** the D-Proposal PDF, structured stops/days/options editing, the provider-request
  step and the anonymous proposal link. They are recorded in `docs/schema-m5-proposal.md` §8.
