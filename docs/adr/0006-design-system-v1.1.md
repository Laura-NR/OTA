# ADR 0006 — Design system v1.1: the Vereda canvas replaces docs/design.md

- **Date:** 2026-10-13
- **Status:** Accepted; amended 2026-10-14 for handoff v1.2, for change request 02 and for Phases 3 and 5, and through 2026-10-18 for Phase 4, M4, M5, Phase 6 and the Confirmation screen (see the end)
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

## Amendment, 2026-10-17: Confirmation screen, resolved by the build

The Confirmation / M-Confirmation boards are built on today's data with the existing tokens; no
token and no migration were added.

- **Where it lives.** `/account/reservations/<id>/confirmation`, a standalone page like the board
  (no Account sidebar): the hero, then the main column and a sticky 360 px summary from `lg`.
  Below `lg` the summary follows the hero, as on M-Confirmation. It opens only when the booking is
  CONFIRMED, IN_PROGRESS or COMPLETED **and** money has been received (`hasConfirmation` in
  `@ota/domain`); otherwise it returns to the trip page. The trip page links to it with a success
  strip once the first payment has confirmed the booking.
- **Sizes.** The 44 px hero title → `display-2` (48) from `md`, `h1-compact` below, as Phase 3
  snapped the other 44 px titles; the 24/32 section headings → `h3`; the 64 px success disc uses
  `success-100`/`success-700`; the first step's number uses `accent-500`, the rest an outlined
  `neutral-300` disc, as drawn.
- **Hero actions.** The board's primary "Download your offline kit" becomes **Download your
  voucher** (the offline kit is not built); "Add to calendar" is an all-day iCalendar file built by
  the pure `tripCalendar`; "Share with David" is replaced by **Message us** (the trip thread). The
  lede does not claim an emailed confirmation or a host who "already knows": E-Confirmed is sent
  best-effort (bookings confirmed before it shipped never got one), and the platform tells no
  host anything; copy that describes the system follows the system.
- **Before you fly.** Only steps backed by data, in order: a missing US certification (M3), the
  next instalment due with the real 7/3/1 email reminders (M4, Phase 6), then **Check the entry
  requirements** pointing to the tenant's Travel info pages. The e-visa status, passport-number
  and Reality Briefing steps are not drawn (no traveler-side passport edit, no e-visa data, no
  pre-trip hub). Once the trip has started the list is gone.
- **Documents.** The traveler's documents only (voucher, invoice, receipt, emergency card), as the
  board's `.doc` tiles with the issue date; supplier work orders are never listed. A voucher held
  by the OFAC gate shows a warning instead. Insurance and e-visa tiles are not drawn.
- **The people expecting you → Your services.** Hosts' names, portraits and phone numbers are not
  shared with travelers today, so the section lists each service by type, province and dates with
  a Confirmed / Being arranged chip, plus an operations-desk tile that opens the trip's messages.
- **CSAT.** The board's "How easy was booking this trip?" measures the booking flow, not the trip;
  the `Review` model is the completed-trip CSAT, and storing a separate booking-ease score needs a
  new field (a migration). So the confirmation shows the existing **Rate your trip** review only
  once the trip is COMPLETED, under its honest title, and never asks the booking-ease question.
- **Summary.** Trip total, each paid instalment with its date and rail, refunds, and the balance
  due (or "Paid in full"), with **Pay early** linking to the trip's payment section. The board's
  cancellation-window line, "Change dates", impact statement and referral link are not drawn: the
  cancellation scale is a placeholder awaiting counsel, and there is no date-change flow, impact
  data or referral programme.
- **Advisory.** The footnote points to Travel info without promising weekly checks or alerts
  (E-Advisory is not sent yet).

## Amendment, 2026-10-18: M5 follow-ups and Phase 6 emails, resolved by the build

The D-Proposal PDF, the composer's structured lists and the remaining Phase 6 emails are built on
the existing tokens and the email shell. No token and no migration were added.

- **D-Proposal PDF.** It uses the same A4 shell as the voucher and invoice (agency header with the
  MINTUR licence, Arial, the tenant primary colour), localized en/es/fr by the request's locale.
  The board's route and day tables, price table, options and "what happens next" are kept; the
  prepared-by name, driver and vehicle line, km estimate, host names and "11 requests" are not
  drawn (no data), and the next steps follow M5 as built (accept → the desk confirms each
  provider → deposit or full on the trip page → documents on the first payment). Each day's
  date is counted from the trip's start.
- **Composer.** Route, Day by day and Options are fieldsets of inline rows (existing `Input`,
  `Textarea`, `Button`) between the summary and the price lines; a day's number is its position.
  The traveler's proposal page shows them as cards around the price breakdown; options say they
  are not in the total and that a revised version is sent on request before acceptance, because
  a proposal has no message thread yet.
- **Email shell.** The new Phase 6 templates share one internal shell (`templates/shell.ts`) with
  the existing inline look; the earlier templates are unchanged.
- **E-Reminder.** 24 h and 2 h before a deposit's or full payment's window closes, with the
  deadline in UTC (as the storefront shows it). The board's "your hosts are automatically
  released" is not written: under M4 D4 the desk decides. The 7/3/1 reminders now cover balances
  only, so a window is not reminded twice. The SMS twin waits for a provider.
- **E-Invoice.** M4 lets the traveler choose deposit or full, and the window starts with that
  choice, so the email lists both amounts and the window length instead of a deadline; no invoice
  is attached because it is issued at confirmation (spec §4.4). The card and FX lines are not
  drawn (card fee 0 %, no FX source).
- **E-Confirmed.** Sent after the documents are issued, with the voucher and invoice attached
  (or the invoice alone and a note while the OFAC gate holds the voucher), the balance and its
  7/3/1 reminders, and a link to the Confirmation screen. Insurance, offline kit, host and
  "Ana calls you" blocks are not drawn.
- **E-NPS → trip review request.** The board's 0–10 recommendation score and per-host ratings
  need fields the schema lacks, so the email asks for the existing `Review` (1–5, comment
  optional) a day after completion, with one reminder five days later; "where your money went",
  public reviews and referral are not drawn.
- **E-Reconfirm.** Seven UTC days before a confirmed trip: the first service's place and time, a
  request to send the arrival flight in the trip's messages, any balance due, the voucher
  attached and the Travel info link. The flight check, desk call, offline kit and morning
  check-in SMS are not drawn (no flight data, no SMS provider).
- **E-Retention.** The notice is now in the traveler's locale and lists what the anonymization
  actually removes (identity and contact details, the party's names, passports and emergency
  contacts, the personal text of messages and reviews) and what is kept anonymised for the tax
  office; one reminder goes out a week before the deadline. "Delete today" and "Download my data"
  are not drawn (no self-service flows).
- **Not built:** E-Advisory (needs an advisory record, M7) and E-Options (needs disruption cases
  and their options, M8).

## Amendment, 2026-10-18: the designed Custom builder and provider progress, resolved by the build

The owner took the recommendations on 2026-10-18: build the full Custom builder without a
migration, and show provider progress from the dispatch ledger. No token was added.

- **Layout.** The booking flow's frame: the DS 03 stepper, the step's overline and heading, cards
  for each group, and a sticky 360 px side panel from `lg` with the estimate and the route; below
  `lg` the panel follows the step, as on the Booking form.
- **Route.** Provinces are the tenant's served provinces (`network` not `none`), west to east,
  as two-column toggle buttons with their destination summary and a Limited badge. Stops reuse
  the Destinations map's route rules (six stops at most, km between stops, the long-leg warning
  over 600 km); nights per stop are − / + icon buttons and the mismatch with the total is a
  warning that blocks Continue. Pace is a radio group; interests are toggle chips.
- **Transport, stays, guiding.** Radio groups and one `Select` per stop, with the manifest's
  prices in the labels. The board's vehicle tags, host examples, power notes ("Generator 4 h")
  and "Viazul is not offered" are not drawn: they are agency facts the platform does not hold.
- **Activities.** The route's catalogue experiences as checkboxes per stop, so the chosen ones
  become the request's catalogue items (and later its service items); a stop without any says to
  use the notes.
- **Estimate.** A per-person range from `customTripEstimate` with its breakdown, and an info
  notice while the manifest's rates are placeholders. The board's € 140 planning fee line is not
  repeated (M5: transparency copy on the proposal only).
- **Summary.** Edit links per section; nationality, proposal language (the tenant's locales, not
  the board's German), budget and notes. The board's name, email and WhatsApp fields are not
  drawn (the builder is behind sign-in, and adding a phone is a PII decision), nor the 90-day
  consent checkbox (no consent purpose fits; a privacy-notice line stands in). The 4-hour reply
  promise and "Ana in Havana" are not written.
- **Provider progress.** A card titled "Your hosts, guides and drivers" with "n of m services
  confirmed", a success-600 bar and the counts of requests sent, awaiting a reply and being
  arranged; no provider is named. It shows on the trip page while the desk confirms the trip and
  on the accepted proposal; the desk's proposal detail carries a one-line summary.


## Amendment, 2026-10-18: M7 advisories, resolved by the build

The owner approved M7 as recommended (D1a–D8a). The desk tab and the storefront surfaces are
built on the existing tokens and DS 03's `CrisisBanner`; no token was added.

- **Desk list (A-Content).** The board's table (advisory with reference and author, severity,
  regions · dates, status), rows awaiting approval tinted with the existing `attention` row tone.
  Only the Advisories tab exists, so the section shows no tab row and `/content` opens on it; the
  board's Blog, Destinations, FAQ and Media tabs wait for a CMS decision (M7 D1).
- **Editor.** The banner preview on top in the travelers' wording (acknowledge, dismiss), then
  severity as radios with the board's rule under each, regions as the 16 province checkboxes plus
  "Whole country" and region shortcuts read from the tenant's `provinces.json` (West, Centre,
  Oriente, Isla) instead of the board's five fixed chips, the window in Havana time (the desk's
  zone), "Shows on" as checkboxes (the worker-app broadcast is not drawn, ADR 0007), the source,
  the source language, and the texts per tenant language as DS 03 tabs marked "missing" until
  filled. The approval card sits beside the editor from `xl` and above it below; it lists who
  approved with role and time, what is still awaited, and the missing translations. "Publish
  now" for a scheduled advisory is not drawn (a new version changes the window); "Unschedule" is
  the lift of a scheduled one.
- **Published view.** The banner as travelers see it, the facts, and the board's live note built
  from data: when it published, approvals, travelers emailed (the delivery ledger) and
  acknowledgements; "Edit (new version)" and "Lift advisory".
- **Site banner.** Every active critical advisory, then the most severe info or caution the
  visitor has not dismissed. It sits above the header in the page flow and scrolls away like the
  other strips, because the header is the sticky element and two sticky bars would overlap; it
  takes the "Cuba right now" strip's place while it shows. Dismissal is a first-party cookie (a
  per-browser convenience the server can read, so a dismissed banner never flashes back); a
  critical banner has no close, a signed-in traveler's acknowledgement is recorded and the banner
  starts collapsed to DS 03's dot afterwards, and an anonymous visitor's collapses for the visit.
  The banner's text keeps a 12 rem basis so a long call to action wraps under it on a phone.
- **Travel info.** "Current advisories" leads the page (`#advisories`, the banner's link target)
  as DS 03 alerts with severity, regions, window and source, then "Earlier advisories" from the
  last year as quiet cards marked Ended, Lifted or Updated. The board's per-region conditions
  table, review cadence and 30-day log are not drawn (no conditions source).
- **Package page and Booking step 1.** The same alert under the title (package) and under the
  step heading (booking) for each active advisory covering the trip's provinces, whole-country
  ones included.
- **E-Advisory.** The shared email shell: severity label, the advisory's own headline, body and
  source in the traveler's language (else the source language), the reached trip, dates and
  regions, a line that the desk contacts them before a service changes, the acknowledgement
  request for critical, the conditions button and the board's footer (published, reference,
  expiry, booking). The board's per-service impact lines ("Cayo Jutías might move"), "no price
  changes" and the SMS/emergency-contact line are not written: the platform holds no such data
  and SMS has no provider.

## Amendment, 2026-10-18: M8 disruptions, resolved by the build

The owner approved M8 as recommended (D1a–D9a). The desk section, the trip-page card and
E-Options are built on the existing tokens; no token was added.

- **Desk list.** The board has no list, so the section opens on a table of cases (title with
  reference, scenario and province; opened time and owner; severity; affected bookings with on the
  ground and arriving in 72 h; status). An open case with a red "Unknown", a call due or a party
  needing help takes the `attention` row tone, and the reason is written in the row.
- **New case.** The scenario picker as radios with each scenario's trigger under it, severity as
  radios with the board's rule under each, the province (16 codes, or "Not regional" for a
  flight), a title and a summary. The sample-framework notice shows while the manifest block is
  `placeholder`. The opener becomes the owner.
- **Case page.** The board's header (reference, severity badge, "Open · 14 h 10 m", opened by,
  owner, province) and its counts as tags; "Escalate to Super Admin" is not drawn (there is no
  paging), "Take over" sets the owner and "Close case" ends the case after a confirmation. Severity
  and the playbook sit side by side from `lg`; the escalation path is the board's text per level.
  Playbook steps show owner and due time and are ticked with "Mark done" (who and when recorded).
  Traveler options are the board's A–D cards with who chose each; they are editable as inline
  fields until sent, then fixed. The send form takes the deadline in Havana time (proposed from the
  manifest's `deadlineHours`), the default and the attached bookings; the board's channel line is
  reduced to email, as SMS and in-app buttons have no provider. "Preview as traveler" is not drawn.
- **Status board.** The board's columns (traveler with nationality and party size, trip, status,
  last contact with the note and who confirmed it, the answer). An overdue "Unknown" is the solid
  `timeout` badge with "Past the contact timer" and the `destructive` row tone; a call due is the
  `attention` tone. The desk's actions (status with how it was confirmed, an answer by phone,
  "Confirm default") sit on a full-width row under each booking, so the five columns stay in view
  at `lg`; the board's "Driver" button is not drawn (no driver contact on the booking).
- **Attach, communications, log.** Attaching lists the suggested bookings as checkboxes plus a
  booking-code field. Communications shows the linked advisories with their M7 status, "Draft site
  banner" (which opens the draft in Content) and the count of E-Options sent; the emergency
  contacts, insurer and supplier broadcast rows are one note that they are not connected yet. The
  board's "Resources in the province" card is not drawn (no data source). The case log is the
  audit trail, newest first, in the desk's language.
- **Dashboard.** The alerts card gains red Unknowns (`timeout`), parties needing help
  (`destructive`) and calls due (`attention`), each linking to Disruptions.
- **Trip page.** The options card leads the trip page while the case is open, framed with the
  `warning-500` border: the case reference as an overline, title, summary, the deadline in Havana
  time, the options as DS 02 radio cards (the default marked), "Confirm option B", the silence rule
  and the compensation text. After an answer, or past the deadline, it shows what stands. There is
  no public short link (D4).
- **E-Options.** The shared shell: booking and case reference, the case title and summary, the
  options as points with their money consequence, the deadline in Havana time, the silence rule,
  the compensation rule, the desk's phone when the manifest has one, and "Choose in your account".
  The board's SMS line, "automatically" for the future-trip discount and the named desk member are
  not written: no SMS provider, no credits model, and the email does not name staff.
