# ADR 0006 — Design system v1.1: the Vereda canvas replaces docs/design.md

- **Date:** 2026-10-13
- **Status:** Accepted; amended 2026-10-14 for handoff v1.2, for change request 02 and for Phases 3 and 5, and through 2026-10-28 for Phase 4, M4, M5, Phase 6, the Confirmation screen, M6–M10, Phase 8, the staff passkeys and the Plausible hosting plan (see the end)
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

## Amendment, 2026-10-20: M6 supplier resources, resolved by the build

The owner approved M6 as recommended (D1a–D9a). The register columns, the inspector cards and the
console card are built on the existing tokens; no token was added. This supersedes the M8
amendment's note that the "Resources in the province" card is not drawn.

- **Register.** Power and Last job follow Auto-dispatch, in the board's order; Status and the
  verification action stay last. Power is the board's label ("Solar", "Generator 6 h", "Fuel
  40 L", "None") on one line; a casa or driver never confirmed reads "Not confirmed" in muted
  text, and guides and translators read "—". A stale confirmation keeps its label, greyed, with
  "Confirmed {date} · stale" under it rather than leaving the list (D2). Last job is "3 Oct ·
  Transport · Pinar del Río": no route is stored (D3). The table's minimum width is 960 px so the
  eight columns fit the 1280 content area; narrower, it scrolls inside its card as before.
- **Filter.** "Backup power only" is the board's checkbox beside the province and verification
  selects, kept in the URL (`?power=1`). The board's "Expiring ≤ 30 d" checkbox is not built: the
  rule strip already names the paused suppliers.
- **Inspector.** "Jobs · 12 m" and "Last job" join the reliability card, with or without dispatch
  history. The casa card holds the board's "Backup power & resilience" fields as a form (generator
  none/own/shared, hours per day, the hours as the host gives them, fuel days, solar battery kWh,
  water tank litres, rooms, guest capacity); the board's yes/none selects for solar and water
  became amounts, which is what the row stores. The driver card shows only the fuel reserve
  (vehicle, plate, insurance and routes wait, D7); the guide specialities and payouts cards are not
  drawn. A channel select (phone, WhatsApp, visit) and "Confirm" stamp the row; the line under the
  fields says when, by which channel and who, and a confirmation older than 7 days adds the
  `attention` badge "Older than 7 days · confirm by phone". Support sees the fields disabled with no
  Confirm (D4). The board's line about "the 'backup power' filter travelers see" is reworded:
  there is no traveler filter (D6).
- **A-Disruption.** "Suppliers involved: N" joins the header tags. "Resources in {province}" is a
  full-width card after the status board with the board's pill rows: Backup power (`success`)
  lists the casas with their power, schedule, fuel days and capacity; Standby drivers (`success`)
  their litres and provinces; Official (`secondary`) the manifest's emergency contacts. Each entry
  links to its inspector and its phone; flags are "Confirm by phone" (`attention`), "Not free
  today" (`outline`) and "Paused · expiry" (`warning`). "2 rooms free tonight" becomes the rooms
  and guest capacity plus the day's availability (D5); the board's "Cash" row is not drawn (M6 §4).

## Amendment, 2026-10-23: M6 follow-ups, resolved by the build

The owner asked for D6(b) and D7(b). Built on the existing tokens; no token was added.

- **Vehicle & fuel.** The driver card takes the board's title and holds two forms: the vehicle
  (model, seats, plate, an A/C checkbox, extras, insurance cover and end date, routes one per
  line) with "Save vehicle", then the fuel reserve with its Confirm. The board's static `dl`
  became a form, as on the casa card. The insurance end date shows the credential badges' tones
  (`warning` within 30 days, `destructive` once ended) but, unlike a credential, never pauses
  dispatch.
- **Packages filter.** The board's "Backup power guaranteed" checkbox with its count sits in a
  new last "Conditions" group of the filter panel (and drawer), with a one-line note on what the
  claim rests on; its chip reads like the label. "Guaranteed" is not written: the platform can
  only say what a casa confirmed in the last 7 days. The board's other type, sleep and pace
  filters stay undrawn.
- **Package page.** A stay with a fresh confirmation adds a line under it in the itinerary,
  "Backup power: generator, 6 h a day" or "…: solar and battery", in `success-700` text. Stays
  without one say nothing rather than "no backup power", because the absence of a confirmation is
  not a fact about the casa.
- **Copy found stale.** The supplier register's reliability footnote claimed a supplier below
  85 % drops out of auto-dispatch; dispatch never reads reliability, so the footnote now says the
  rate turns amber for review (M9 D2 holds the enforcement question). The storefront's
  placeholder "Cuba right now" banner still says every stay has backup power; it is tenant
  sample copy for the agency to word.

## Amendment, 2026-10-23: dispatch reliability and calendar, resolved by the build

The owner had dispatch enforce the reliability floor and the workers' availability calendar. No
token was added.

- **Re-dispatch drawer.** Each worker shows "{n} % acceptance" (or "No answered offers yet")
  under the name; a worker below the floor gets the `attention` badge "Below 85 % · manual only"
  beside "Verified" and keeps the Offer button, because the board lets the desk assign by hand.
  Workers who blocked a day of the service are not listed. The rule line above the list says
  both.
- **Register and inspector.** The Auto-dispatch badge reads "Paused · reliability" (`warning`,
  like the expiry pause) for a verified worker below the floor; the inspector explains it. The
  register footnote and the calendar caption state the enforced rules. The register's summary
  count of paused workers still counts the expiry pause only, as the rule strip beside it does.

## Amendment, 2026-10-23: M9 Settings, resolved by the build

The owner approved M9 as recommended (D1a–D9a). Built on the existing tokens; no token was added.

- **Tabs.** The board's six tabs are links (`/settings?tab=…`) under the page header, in its
  order; the row scrolls on its own below `xl`. Users & roles, Permissions and Security & audit
  are for Super Admins; the rest of the desk sees the thresholds (read-only), languages and the
  manifest. The board's "Super Admin only" header note became the tab rule.
- **Users & roles.** The board's table (user, role, passkeys, last sign-in, status, act); "Edit"
  became the actions themselves: a role select (Operations Admin ↔ Administrative Support),
  "Sign out everywhere" and Deactivate/Reactivate (`destructive`). The board's "Require a passkey"
  checkbox, recovery codes and "Revoke all sessions of a user…" menu are not drawn (D5, D9).
  Invitations list beside the invite form with their state badge and Confirm (another Super
  Admin), Send again and Revoke. Promotion to Super Admin is the invite form's third role.
- **Permissions.** The board's matrix, read-only, showing what the code enforces (Yes / View / No
  badges) rather than the board's values where they differ.
- **Currencies & languages.** EUR only, with the reason; languages show the platform texts'
  coverage and whether each is offered. The board's rate table, spread and lock fields and the
  detection selects are not drawn (D7).
- **Manifest & feature flags.** Read-only facts, the flags as badges and a JSON preview, with the
  note that changes are a commit and a deploy (D8). The board's editable fields and "Save
  manifest" are not drawn.
- **Approvals & thresholds.** The board's table (rule, value, used by) plus a Default column; the
  unenforced rows are named in a note instead of shown empty. Below it, for Super Admins, the
  proposal form in the board's groups with "Reset to spec defaults" and a reason, or, while a
  proposal waits, a `warning` card listing each change as before → after with Apply/Reject (others)
  or Withdraw (proposer). History lists the versions.
- **Security & audit.** Sessions and sign-in as facts (the values in force), integrations as
  configured/not set badges (Q12, no values), and the latest 50 audit events. The board's IP
  allowlist, new-device email and idle-lock controls are not drawn.
- **/invite.** A centred card outside the desk shell: sign in with the invited address, then
  "Accept the invitation"; on success, "Open the desk".

## Amendment, 2026-10-24: DS 07 test widths, resolved by the build

Phase 8 item 3 started with the DS 07 checks the code can make: `e2e/responsive.spec.ts` runs at
320, 375, 414, 768, 1024 and 1440 (one Playwright project per width) and asserts that no page
scrolls sideways and that body text stays 16 px on customer pages and 14 px on the desk. It
found one break (Home's conditions/why grid at 320, an implicit min-content column) and that was
fixed with `grid-cols-1`. No token was added.

- **The desk under 560.** DS 07 says the desk points to Ops Lite below 560 px. Ops Lite does not
  exist yet (Phase 7), so no pointer is drawn (copy follows the system); the desk keeps
  reflowing and the spec checks it from 768, DS 07's tablet width, up.
- **Not automated yet.** The table/matrix "stacked cards under sm", sticky first columns and the
  print stylesheet are visual rules the spec does not assert; the accessibility audit waits for
  the axe dependency decision.

## Amendment, 2026-10-24: M10 events and the ticket concierge, resolved by the build

The owner approved M10 as recommended (D1a–D10a). Built from the Concierge and M-Concierge
boards on the existing tokens; no token was added. There is no admin board for events.

- **Storefront.** The nav's Events link now renders (Phase 2 rule). `/events` is the board's "All
  events" as cards (dates or "month · dates tbc", place, access badge, summary, one action);
  `/events/[slug]` is the board's hero with the three steps as a numbered card beside it (from
  `lg`), the programme, the request and the honest notes. The three steps state the answer time
  in force (the M9 threshold, sent with the public event) and the manifest fee, not the board's
  "48 hours" text. Sign-in comes first: signed out, the request card holds a "Sign in to request"
  link back to the event. The form is the board's three steps on the DS 03 Stepper; the board's
  name/email fields are replaced by "We confirm to <email>", and phone and nationality show only
  when the account lacks them (D4). The board's "after the festival" chips are a select of the
  tenant's served provinces; "Keep building the trip", the room hold and the photos are not drawn
  (§4 of the doc). While the form is shown the separate programme is not, since the form lists
  the nights. A guide-only event shows "Plan a trip around it" (the builder) instead of a form.
- **Home strip.** Its action opens the event the tenant copy names (`eventSlug`), else `/events`.
- **Account.** The Trips tab and the trip page list the traveler's requests with their status,
  the trip they go on and, once confirmed, what they added; open ones can be withdrawn.
- **Desk.** Content gains a tab row (Advisories · Events); Bookings gains "Event requests". The
  event editor follows the advisory editor's cards (details, dates, nights, categories, then the
  other languages as tabs with the source as placeholders) with a Publishing card beside it
  listing the publish checks. The request queue tints a request past the answer threshold
  (`attention`, as the boards' late rows) and filters by status chips; the request page puts the
  answer actions in a side card and shows, before confirming, what the seats add and whether
  they become their own instalment. Overdue requests are a dashboard task, not a new alert in
  the live strip.
- **Documents.** The voucher gains an "Event tickets" table (event, seats, nights); the invoice
  labels the two new price lines.

## Amendment, 2026-10-24: Phase 8 item 2 (PWA, low bandwidth, larger text), resolved by the build

The owner chose this batch and that the preferences live per device (a cookie), not per
account. No migration, no dependency, no token added. Sources: the Account board's
"Accessibility & data" and "Documents & offline kit", DS 05 (offline and text-only mode) and the
Phase 1 note that low-bandwidth mode falls back to system stacks.

- **Type in rem.** The Tailwind preset's type sizes and line heights are the tokens' pixels in
  rem (16 px = 1 rem), in both apps: identical at the browser default, and a reader's browser text
  size now scales them ("also respects your browser setting"). The tokens stay in px.
- **Larger text (18 px)** sets the root to 112.5 %, so the body reads 18 px and every rem value,
  spacing included, scales as it would with the browser setting. The header wordmark stays 28 px
  (a logo, not text) and the header gap tightens below `sm` in this mode; from `lg` to `xl` the
  header keeps the drawer instead of the full nav, and from `xl` it drops "Talk to a specialist"
  (Support carries it), since the scaled nav does not fit 1024–1279 px; four long nowrap items
  were fixed for 320 px (Home tiles and Packages sort `min-w-0`, the package page's single column
  `grid-cols-1`, and long button labels that wrap: `WRAPPING_BUTTON`). `e2e/responsive.spec.ts`
  checks every customer page at the six DS 07 widths with the mode on (18 px body, no sideways
  scroll).
- **Low-bandwidth mode** (DS 05 text-only): catalogue photos become "Load photo" buttons in the
  photo's place until tapped; the board's size ("38 KB") is left out because no byte count is
  stored. The brand fonts become system faces, and to make that save bytes the fonts are no
  longer preloaded (`display: swap` and the metric-matched fallbacks keep the default mode's
  first paint steady). There is no video to drop. A dark strip above the header says the mode is
  on, with "Turn off". A slow connection (save-data, 2G or under 200 kbps by the Network
  Information API) offers the mode once in the same strip; "Not now" is remembered.
- **Where they are switched.** Account › Preferences gains a Display card under Notifications;
  the menu drawer (below `lg`) carries the same two switches for signed-out visitors. A signed-out
  desktop visitor has the browser's own setting and the slow-connection offer. The board's
  "Reduce motion" (already honoured globally from the system setting) and "High contrast" are not
  built.
- **Offline kit.** Saved only when the traveler asks ("Save on this device" on the trip page):
  the trip page, every document and the build assets the page needs, in Cache Storage; the size
  is stated after saving, since it is not known before. The service worker refreshes the saved
  page on each online visit, and the card flags documents issued since the save ("Update kit").
  Signing out deletes every kit. The board's maps, briefing and insurance additions are not
  drawn (the platform holds none), and the D-OfflineKit PDFs (Phase 6) are not built.
- **Offline mode.** The service worker answers from a cache only when the network fails: a saved
  trip or document, else the offline page of the request's locale or of one the device has
  visited (what still works, the saved trips, the tenant's emergency numbers). It registers after
  the page's `load` and keeps only the visitor's locale's offline page, so a first visit on a slow
  link downloads one page, not three. The DS 05 pill is dark at the top; on a saved trip it
  says "showing your saved trip, updated <age>" (the board's copy), elsewhere what does not work
  offline. Offline is read-only: writes are not queued ("will send when online" is not built), so
  a message sent offline fails as before.
- **Manifest.** Named and coloured from the tenant manifest (primary 600, page background); the
  icon is the SVG mark until raster icons are exported (T-Signoff §03).

## Amendment, 2026-10-25: reduce motion, high contrast and the axe audit, resolved by the build

The owner chose this batch (the two remaining "Accessibility & data" switches with the Phase 8
item 3 audit) and the `@axe-core/playwright` 4.13.0 pin (dev only). No migration, no token added.

- **Reduce motion** and **High contrast** join the device cookie `ota_display`
  (`reduce-motion`, `high-contrast`) and the Account › Preferences card and menu drawer, in the
  board's order: Larger text, Reduce motion, Low-bandwidth mode, High contrast.
- **Reduce motion** applies the override the system setting already gets (`@ota/ui/styles.css`):
  motion tokens, animations and transitions at 0 ms, scrolling not smooth; scripted smooth
  scrolls (the message thread) check it too. The board's help line "No animations; cross-fades
  only" became "No animations or transitions", because nothing cross-fades once every
  transition is 0 ms.
- **High contrast** has no tokens on the canvas; the build resolves it with existing ones
  ("Darker text and borders"): secondary text neutral 700 → 900, muted text 500 → 700, borders
  neutral 200 → 500 (3:1 non-text contrast), input borders 300 → 700, and the switch's off track
  300 → 500. They are the alias tokens, so a tenant's palette still supplies every step. The
  system's `prefers-contrast: more` applies the same overrides, as reduced motion does.
- **The axe audit** (`e2e/accessibility.spec.ts`, WCAG 2.2 AA tags, per A-A11y) covers every
  customer page signed out, the same pages at 390 px with larger text, reduced motion and high
  contrast (and the open menu), the traveler account, a trip, a package booking and the builder,
  and 26 desk pages; each page must also have unique ids. It found three problems, all fixed:
  content tables that scroll at 390 px with larger text could not be reached by keyboard
  (`Table` gains `scrollRegionLabel`: a named, focusable region with an inset ring), the desk
  package forms had unlabelled checkboxes, inputs and a select, and the menu's display switches
  repeated their ids in the header's and the bottom bar's drawers. axe's "needs review"
  colour-contrast items are text over photography or gradients (home and destination tiles), left
  to the manual checks with keyboard paths and reading order.

## Amendment, 2026-10-25: Phase 8 item 1 (T-Events and the cookie choice), resolved by the build

The owner chose T-Events against a mock sink, behind a public API route that only logs, on the
storefront funnel first. No migration, no new dependency (the user hash is Node's HMAC; the
session id is Web Crypto). The real sink (self-hosted Matomo or Plausible) stays Q10.

- **The taxonomy is a contract.** `packages/domain/src/telemetry/taxonomy.ts` lists every event
  the storefront sends with its own parameters and their kinds (id, ids, count, amount, bool,
  host, token, enumerations). `POST /telemetry/events` refuses an unknown event, an undeclared
  parameter or free text where an id belongs, rather than dropping it, so nothing outside the
  table reaches the sink. Events not sent yet (sort, tiers, departures, galleries, OFAC gate,
  payment attempts, the desk and worker events) join the table with their components.
- **Common parameters** follow T-Events §02 with three resolutions: `funnel_stage` is derived by
  the sink from the screen, not trusted from the client; `user_id` is an HMAC of the user id
  keyed by `AUTH_SECRET`, attached by the API only to analytics events of a signed-in visitor;
  `market` (country of the visitor) is left out until the sink can geolocate. `currency` is EUR
  until display currencies (M9 D7). `app` is `mobile_web` below md, else `web`.
- **Consent (DS 04).** The banner shows until the visitor chooses for the words in force; each
  purpose's words and version are the tenant's consent texts (`COOKIES_ANALYTICS`,
  `COOKIES_MARKETING`), so new words ask again. Vereda offers analytics only: there are no
  marketing cookies, so the marketing row renders only when a tenant has words for it. Reject
  and Accept are the same secondary button (equally weighted); "Save my selection" is tertiary.
  The banner is a labelled region, not a dialog, first in the DOM and fixed above the phone's
  bottom bar, at most 60 % of the viewport with its actions pinned while the rows scroll. Legal ›
  Cookie settings (`/legal/cookies`, footer) shows when the choice was saved, the same controls
  and every cookie and storage key; the board's "CCPA variant" is not built (no geolocation).
- **Essential events** (`booking_*`, `payment_*`, `client_error`, and `consent_set`, the choice
  itself) go out whatever the choice, without the session id or user id. Withdrawing consent
  also drops queued analytics events and the tab's session id.
- **Evidence.** A signed-in traveler's choice is also written to the M3 consent log
  (`COOKIE_BANNER` source, which the record request had refused; fixed). The cookie is what the
  device obeys; a failed log write leaves the choice in force.
- **Entry and identity.** The tab's session id lives in sessionStorage; the page view that starts
  it is the entry, and only an entry carries the referrer host and `utm_*`. A locale switch
  remounts the layout, so the shell sends its queue as a beacon first.
- **Privacy notice.** The tenant's draft cookies paragraph said there were no analytics cookies;
  it now says what is set (placeholder words, for counsel with the rest of the notice).

## Amendment, 2026-10-25: T-Events follow-ups (desk events and the missing storefront events), resolved by the build

The owner chose the T-Events follow-ups next, and for the desk chose **operational events only**:
the tenant's analytics words are written for travelers, so the desk shows no cookie banner and
sends no page views or nav clicks until counsel decides on staff analytics. No migration, no new
dependency.

- **Surfaces.** Each taxonomy entry now names its surface: `storefront` (`web`, `mobile_web`),
  `desk` (the new `admin` app) or `any` (`client_error`). The sink refuses an event from the
  wrong surface, a desk event on a storefront screen and the reverse.
- **Desk events are essential operational records**: `booking_state_changed`,
  `redispatch_triggered`, `document_generated`, `import_committed`, `approval_decided`,
  `ai_draft_used` and `admin_state_shown`. They carry no session id, no user id and nothing
  stored on the device; the desk sends `consent: essential` and the sink refuses any other
  level from the desk. Each fires once the API has accepted the operator's action, so the
  server's own transitions (system, traveler) are not counted yet.
- **`role` comes from the session, never the client.** The public intake reads the session for
  a desk event and admits it only for a live staff session (not deactivated, within the 12 h
  staff limit, the guard's own rule, now shared as `sessionRefusal`), then stamps
  `super_admin`, `ops_admin` or `support`. A client-sent `role` is refused. `worker` waits for
  the worker app.
- **Desk screens** are the admin artboard names (`A-Dashboard`, `A-Booking`, …); a section's
  sub-pages report the section's artboard, and an unmatched path is `A-States`. They have no
  funnel stage.
- **Board parameters adapted to what the desk knows:** `redispatch_triggered.mode` is `manual`
  only (the drawer is a pick from the candidates; there is no one-click fallback);
  `document_generated.trigger` is `manual` (automatic generation on CONFIRMED is server-side);
  `import_committed` reports `rows`, `errors` and `duration_ms` (the commit is atomic, so errors
  above 0 imported nothing; there are no warnings or reverts); `approval_decided.kind` is
  `advisory`, `refund` or `proof` (the desk's three approval surfaces; no discount or manifest
  approvals exist), with no amount or hours waiting; `ai_draft_used` reports the word-level
  `edited_ratio` of the sent reply, never the words, and no locale (the draft does not say which
  it chose). `admin_state_shown` covers the empty dispatch matrix, a 403 from the API (`denied`)
  and a lost live feed (`degraded`); "locked PC" has no trigger.
- **Storefront events added:** `search_submitted` (Home; the search is free text, so no
  destination), `sort_changed` (field and direction), `departure_selected` (with the
  departure's `capacity`, since seats left are not known before the server's check),
  `tier_selected` (tier id and a signed `delta`, a new parameter kind, as a tier may be cheaper
  than the base), `ofac_gate_shown` (on adding a US traveler, and `blocked` when Continue is
  refused for the signature), `ofac_category_selected`, `affidavit_signed` (on the booking's
  submit or the trip page's signature, when the affidavit is recorded),
  `payment_plan_selected`, `payment_attempted`, `payment_failed` (`error_code` `http_<status>` or
  `network`) and `proof_uploaded`. Payment events are essential like the board says. There is
  no `payment_succeeded`: a transfer has no gateway result and the desk's confirmation is
  reported as `booking_confirmed`. `gallery_opened` is not built: the package gallery is a
  fixed grid with no viewer to open.
- **A form declares its event for its submit**, and the shell sends an event at once (a
  keepalive fetch) when the page is about to be left: the Home search and the redirect to the
  wire page. The leave-time beacon stays for whatever else is queued.

## Amendment, 2026-10-25: server-side T-Events (transitions and offers), resolved by the build

The owner chose the server-side events next, still against the mock sink (the real sink stays Q10;
the owner prefers Plausible CE when it is built). No migration, no new dependency.

- **A `server` surface.** The API records these events itself, from state it holds, after the
  change is stored. Their context is `{ app: 'server', consent: 'essential' }`: no screen,
  device, session, user or worker id. No client may send them: the intake refuses a server
  event from any app (`wrong_surface`), and `server` is not a client app.
- **`booking_state_changed` is now the API's, for every transition**, as the board defines it
  ("any state-machine transition"): the desk's transition buttons, the payment link
  (SECURED_AND_INVOICED → PENDING_PAYMENT), the payment confirmation, starting dispatch, a
  re-dispatch, every item accepted, a decline, a timeout and no eligible supplier. The desk no
  longer sends its own copy, so each move is counted once.
- **`actor`** is the account role of the request that caused the move (`traveler`, `support`,
  `ops_admin`, `super_admin`), or `system` when no request did (a timeout). The board lists no
  worker, but a worker's accept or decline moves the booking, so `worker` is added.
- **`reason` is a trigger code** (`manual`, `payment_requested`, `payment_confirmed`,
  `dispatch_started`, `redispatch`, `all_accepted`, `offer_declined`, `offer_timeout`,
  `no_supplier`), never the free-text reason an operator or worker may type.
- **Offers:** `offer_sent` and `offer_timeout` carry `timer_h` (the time the supplier had, in
  hours to two decimals); `offer_accepted` and `offer_declined` carry `minutes_to_answer`. All
  four carry `service_item_id` and `service_type`. The board's hashed `worker_id` is left out
  (reliability already comes from the dispatch ledger), and so is `decline_reason` (free text).
  `offer_viewed` waits for the worker app.
- **Never in the way of the change:** the events are sent after the write and not awaited; a
  refused or lost event is logged, never an error for the request.
- **Inspection:** with `TELEMETRY_SINK_FILE` set, the mock sink also appends each event as a
  JSON line; the e2e stack sets it so specs can read the events the API recorded itself.

## Amendment, 2026-10-26: staff passkeys (M9 deferred item), resolved by the build

The owner approved `docs/schema-m9-passkeys.md` as recommended (P1a–P6a). The board shows
"passkeys required" as a Sessions & sign-in row and a passkeys column on Users & roles, with no
enrollment or sign-in screens, so the build drew them from existing components and tokens.

- **Login:** "Sign in with a passkey" is a full-width secondary button above the email form,
  separated by a caption ("or get a link by email"). The magic-link button stays primary, so
  the page reads as before while the rule is off. `?passkey=required` adds a neutral alert.
- **`/passkeys`** is a card page outside the desk shell, like `/invite`, because a staff
  member the rule holds back must reach it before the desk opens. It has three states: setup
  (heading, explanation, optional name, primary "Set up a passkey", then "Sign in with your
  passkey"), sign in with an existing passkey, and the list. List rows show the name, the date
  added and "Synced across devices" or "This device only", with Rename (inline field) and
  Remove (destructive), followed by the add form and two caption notes.
- **The shell:** a "Passkeys" link beside "Sign out" under the person's name, in the same
  caption-link style, so every staff role reaches it (the Security tab is Super Admin only).
- **The switch** is the thresholds document's first boolean. It is a Select with Off/On
  (es Sí/No, fr Oui/Non) in a new "Security" group, matching the existing level Select rather
  than adding a toggle component. The in-force table reads it as On/Off. Proposing or
  reviewing a switch to On shows a neutral alert with the number of active staff without a
  passkey.
- **Reset passkeys** opens an inline reason field (required, 3–500 characters) under the row's
  actions, with a destructive "Reset and sign out" and a secondary Cancel. It is offered only
  when the user has passkeys and is active.
- **Security tab:** a "Staff passkeys" fact (Required at sign-in / Optional), read from the
  rule in force (it reflects the break-glass). "Mandatory passkeys" left the not-built line.

## Amendment, 2026-10-27: the real analytics sink (Plausible CE), resolved by the build

The owner chose the real analytics sink next (Q10), with Plausible CE as the preferred
one. This increment builds the adapter only; where Plausible CE runs is still the hosting
decision, so the stack adds no image and the mock stays the default.

- **Selection.** `TELEMETRY_SINK=plausible` builds `PlausibleTelemetrySink`; `mock`
  (the default) is unchanged and remains the e2e's file sink. A missing or invalid
  Plausible setting logs an error and falls back to the mock, so analytics can never
  stop the API from starting or a booking from moving.
- **Transport.** Plain `fetch` to the deployment's `POST /api/event`, one request per
  admitted event (Plausible has no batch endpoint), a three-second per-request timeout,
  and no SDK. A non-2xx answer, a network error or `x-plausible-dropped: 1` is logged as
  a warning and swallowed: the public intake still answers 202 and a transition is never
  delayed or undone.
- **Mapping.** The Plausible event name is the taxonomy name, except `page_view`, which becomes
  Plausible's built-in `pageview` so the page reports fill. Because the taxonomy
  carries a screen id rather than a path, the reported URL is a stable synthetic path:
  `/en/<Screen>` on the storefront, `/admin/<A-Screen>` on the desk, and `/server` for
  the API's own events. `domain` and the site URL come from the environment. The custom
  properties are the event's context (without `session_id`), its `essential` flag and
  its parameters; a list parameter is comma-joined because Plausible values are
  scalar. The HMAC `userId` is not sent either: Plausible derives its own visitor id, so
  the sink stores no second identifier.
- **Visitor counting and the bot filter.** The intake forwards the visitor's IP as
  `X-Forwarded-For` (only when `isIP` accepts it), because Plausible counts a visitor by
  user agent and IP and silently drops a backend or datacenter IP. The API's own
  (`server`) events have no visitor IP. The live hosting decision therefore has to
  forward the real client IP at the proxy, or accept that server events stay on the
  mock/file sink; the adapter checks `x-plausible-dropped` so a silent drop is visible in
  the API log.
- **Settings:** `TELEMETRY_SINK`, `TELEMETRY_PLAUSIBLE_ENDPOINT` (the full `/api/event`
  URL), `TELEMETRY_PLAUSIBLE_DOMAIN` (or `TELEMETRY_PLAUSIBLE_SITE_URL`), and the
  optional `TELEMETRY_PLAUSIBLE_SITE_URL`, `TELEMETRY_PLAUSIBLE_USER_AGENT` and
  `TELEMETRY_PLAUSIBLE_TIMEOUT_MS`. Turbo passes them through to `pnpm dev`.
- **Still open:** hosting and retention (Q10), the reverse proxy that forwards the client
  IP, whether server events go to Plausible, and counsel's review of the analytics words
  for this processor. No new dependency, no migration, no image.

## Amendment, 2026-10-28: the Plausible CE hosting plan, approved by the owner

The owner chose the live hosting decision next and approved `docs/plausible-hosting-plan.md`
as recommended (H1a, H4a, H5, H6a, H7). The build changes the adapter, but nothing visible:

- **Hosting (H1–H3).** CE runs on its own small EU VPS, outside the platform, from the
  upstream compose repository at a pinned tag; buying it is the owner's step, and no image
  enters this repository. The live setup needs an edge proxy that sets `X-Forwarded-For`
  plus `TRUST_PROXY=1` on the API, because Next's `/api/ota/*` rewrite neither adds nor
  appends the header (`docs/runbook.md` "Going live"). The same fix gives the rate limiter
  each storefront visitor's real IP.
- **Routing (H4a).** `TELEMETRY_SINK=plausible` builds a `ConsentRoutedTelemetrySink`: an
  event reaches Plausible only when its `consent` is not `essential`
  (`mayReachAnalyticsStore`, `packages/domain`). Desk events, the API's own events and a
  refusing visitor's essential events stay on the mock, which keeps its file. So the
  earlier caveat (with `plausible`, the e2e loses its server events) no longer holds, and
  server events can never be dropped as datacenter traffic.
- **User-Agent (H5).** The intake passes the visitor's User-Agent to the sink next to the
  IP, and `TELEMETRY_PLAUSIBLE_USER_AGENT` becomes the fallback for a request without one.
  Plausible's visitor id and its browser, OS and device reports need it.
- **Identifiers (H6a).** `LINKABLE_TELEMETRY_PARAMS` (`booking_code`, `request_id`,
  `from_path`) never reach Plausible, so it holds no identifier and its data is kept
  without a retention limit (counsel confirms).
- **Words (H7).** `COOKIES_ANALYTICS` is a new placeholder version,
  `cookies-analytics@2026-10-28`, which mentions the approximate location derived from the
  connection; the privacy notice's cookies paragraph says the same. English only, like the
  other legal words. The new version asks every visitor for consent again.


## Amendment, 2026-10-29: the desk's manual accessibility pass (A-A11y), resolved by the build

The owner chose the manual keyboard and screen-reader pass next. The rule-by-rule record is
`docs/a11y-desk-manual-pass.md`; no migration, dependency or spend. Where the board was
silent or could not be built yet, the build decided:

- **Shortcuts can be turned off.** A-A11y lists single-key shortcuts (R, G then D/B/P, ?)
  but no off switch; WCAG 2.1.4 needs one. The shortcut list (`?`, or the header's
  "Keyboard shortcuts" button, which also makes the keys discoverable without a keyboard)
  has a "Single-key shortcuts" switch, kept per device like the storefront's display
  preferences. Keys never fire in a text field or select, with Ctrl, Cmd or Alt held, or
  while a dialog is open. `R` acts on the red item of the focused row, else its amber one.
- **Deferred from the board:** `A` (acknowledge, undo 6 s), the audio cue with its 60 s
  repeat and the logged "Mute 15 min". They depend on what acknowledging means (one person
  or the whole desk) and where it is recorded, which is a product question for the owner.
  `/` (jump to search) waits for a desk search field.
- **Announcements.** The visible strip is no longer a live region. Two always-mounted,
  visually hidden regions announce each threshold crossing once (`alertCrossings`): red as
  `role="alert"`, amber as `role="status"`. The words follow the board's example, with the
  service and worker as the matrix shows them ("Red alert. Booking VX-3PA8ZT: Guide, Osvaldo
  Ruiz, timed out at 13:40. Press R to re-dispatch."). "Press R" is added only when the item
  can be re-routed and the keys are on. What the page shows on load is the starting point,
  not news, so it is not announced.
- **The matrix's first column is sticky at every width**, not only under 1024 px: the
  matrix already scrolls at 1024 beside the sidebar, and sticky changes nothing where the
  table fits. The column is 11.5 rem and the scroll box keeps that padding, so a focused
  cell never scrolls under it (2.4.11).
- **Names.** Repeated actions carry what they act on, starting with the visible label
  (2.5.3): "Re-dispatch Guide · <code>", "Open <code>", "Offer · 2 h timer to <worker>",
  "Call <worker>". The re-dispatch drawer opens on its title (`Drawer focusTitle`); when the
  offer removes the button that opened it, focus goes to the row's booking link.
- **State filters stay links** with `aria-current`, not buttons with `aria-pressed`: they
  change the URL, which keeps a filtered view bookmarkable and shareable.
- **Unavailable actions.** `Button unavailableReason` replaces a silent native `disabled`
  wherever an action waits on input or on a second approver: `aria-disabled`, still
  focusable, refuses to act (implicit form submission included), with the reason as a
  caption beside it and as its description. A busy action stays natively disabled. The
  reasons live in `backoffice.unavailable` (en/es/fr).
- **Targets.** Standalone controls meet the desk's 44 px (the sidebar's Passkeys and Sign
  out were 16 px). Text links inside table cells keep their line height under 2.5.8's
  inline exception rather than 44 px rows.
- **Also fixed, not on the board:** a skip link as the first stop of every shell page
  (2.4.1); an `<h1>` on the sign-in, invitation and passkeys pages; an empty link for a
  customer whose name is an empty string.
- **Not verified:** a run with a real screen reader. The pass read Chromium's
  accessibility tree.

## Amendment, 2026-10-29: the storefront's manual accessibility pass (DS 02–05), resolved by the build

The owner chose the same manual pass for the storefront next. The rule-by-rule record is
`docs/a11y-storefront-manual-pass.md`; no migration, dependency or spend. Where the boards
were silent or could not be built yet, the build decided:

- **"On touch screens" means `(pointer: coarse)`.** The preset gains a `pointer-coarse:`
  variant (Tailwind 4's name for it). On a touch screen md buttons grow to 44 px as DS 02
  says, and so do text fields and selects (DS 05's minimum), so a field and its button stay
  level. A mouse keeps 40 px. The link variant keeps its line height.
- **Stand-alone text links are not controls.** On a touch screen the footer's links and the
  header's logo, language and strip links become 44 px rows. Other text links (a back link,
  "Download PDF", a phone number) keep their line height: every page passes WCAG 2.5.8 by
  size or spacing, as the desk's table links do. Tall rows everywhere would double the
  phone footer's length.
- **The language links stay in the phone header.** DS 05 moves language and currency into
  the drawer. Currency waits for M9 D7, and three short links fit the header. On touch each
  takes taps 44 px tall around an unchanged pill. Each is named in its own language
  ("Español", which contains the visible "es"), with `lang`, `hreflang` and `aria-current`.
- **Sticky and fixed bars keep focus clear.** The root's scroll padding is the sticky
  header (4 rem, 72 px from lg), plus a destination's "On this page" row when it is present
  (`data-sticky-subnav`). Below md it also clears the bottom bar (4 rem). The compare tray
  adds its measured height (`--fixed-tray`). Sections' `scroll-mt-*` were reduced by the
  same amount, so in-page anchors land where they did.
- **Scrolling tables are named "<section> · table"** (`pages.common.table`), not by the
  section's own name, so a screen reader's landmark list never shows two "Itinerary"
  regions.
- **Destructive storefront actions confirm** (DS 02) with the DS 06 dialog at 480 px: a
  title that asks, the consequence (final; nothing charged; how to start again), "Keep the
  …" and the destructive confirm. The ✕ is "Close". The copy is placeholder wording, like
  the other M5/M10 texts.
- **Unavailable, not disabled** (DS 05's disabled state), as on the desk: actions waiting on
  input keep their focus and give their reason. A full compare selection points to a note
  in the tray ("You can compare up to 4 trips"). A full route points to the builder's
  existing "A route holds up to 6 stops". A counter's bound stays natively disabled.
- **The 404 titles itself twice.** `generateMetadata` gives the server's HTML "Page not
  found". Hydrating a 404 restores the layout's title, so the page also renders a React
  `<title>`, which React keeps first in `<head>`.
- **Deferred:** the date-range picker (native date fields stand in), stacked table cards on
  a phone, and room for the cookie banner on a phone (focus can go behind it until a
  choice is made). These are design changes, not fixes.
- **Not verified:** a run with a real screen reader.


## Amendment, 2026-10-29: the desk's alert acknowledgement, audio cue and mute

The owner chose the items the desk pass had deferred, with acknowledging decided as **per
desk, audited**: one operator's acknowledgement stops the cue for everyone, and
acknowledgements and mutes go to the audit log. No migration, dependency or spend. Where
the boards (A-A11y 01, A-Dashboard, A-States, AL-Alerts, T-Events) were silent, the build
decided:

- **What an alert is.** A red alert is one service item's offer gone red (declined, timed
  out, or past its deadline before the timeout job fires). It is keyed by the item and the
  offer (`alertKey`), so a re-dispatch raises a new alert that an earlier acknowledgement
  does not cover. It dates from the decline, else the deadline (`redSince`).
- **Only red alerts are acknowledged.** Amber has one cue and nothing repeats, so there is
  nothing to stop; AL-Alerts gives amber "Watch", not "Acknowledge". `A` and the row's
  Acknowledge act on the row's (the booking's) unacknowledged red alerts at once, as the
  toast names the booking ("Alert acknowledged · audio off for VX-3PA8ZT").
- **The undo is local, the record is the desk's.** For 6 s the cue stops on this desk
  only; the toast pauses while hovered or focused (DS-Feedback). When it closes, or the
  operator moves to another desk page, `POST /service-items/:id/acknowledge-alert` writes
  `dispatch.alert_acknowledged` with the offer it covers; a second operator's later
  acknowledgement returns the first. The item then shows "Acknowledged · <name> · <time>"
  on every desk. Closing the tab inside the 6 s drops the acknowledgement, as an undo
  would.
- **The cue** is a two-note Web Audio tone (no sound file): red higher, amber softer and
  lower. A red alert sounds at once when this desk has not cued it, then every 60 s while
  any red alert is unacknowledged. It starts after the operator's first click or key press
  on the page; until then the strip says so beside "Turn on sound". It plays on the
  dashboard, where the live board is; other desk pages do not sound.
- **No per-device sound switch.** "The cue is a desk setting" is read as the desk's mute:
  the only ways to silence it are acknowledging and the logged mute, so nobody turns alerts
  off unseen.
- **"Mute 15 min"** silences the alerts raised before it began (and amber cues) and never a
  newer red alert (`muteSilences`). Muting again starts a new 15-minute window. Unmute is
  logged too (`dispatch.alerts_unmuted`). The strip says "Audio muted until 14:47 by Ana
  Rodríguez (logged)…", with Unmute. The muted line keeps the bell icon: the sprite has no
  `bell-off`, and adding one means rebuilding it from Lucide.
- **Who may act.** Operations Admin and Super Admin acknowledge and mute, as they
  re-dispatch; support sees the state and hears the cue but stays read-only.
- **Events.** `alert_acknowledged` (`service_item_id`, `seconds_to_ack` from `redSince`,
  `channel: desk`) and `alert_muted` (`muted_for_s`, `channel: desk`) are desk events, sent
  once the API accepted them; `ops_lite` waits for Ops Lite.
- **Not built:** Ops Lite's channel and push; `/` (no desk search).

## Amendment, 2026-10-29: the storefront pass's deferred design changes

The owner chose the two design changes the storefront pass had deferred, and kept the
native date fields (no custom date-range picker). No migration, dependency or spend. Where
the boards (DS-Mobile-Patterns 02 "Data tables", DS-Responsive "Tables", DS 04 consent)
were silent, the build decided:

- **Stacked cards are below sm (480 px), as DS-Responsive says** ("md → scroll · sm →
  cards"). From sm to md the table still scrolls in its named box, and from md it is the
  full table. The compare table keeps its own rule (two packages side by side, scrolling
  for three or four).
- **One component, data-driven.** `ResponsiveTable` (`@ota/ui`) takes columns and rows.
  The pages are server components, so a context cannot tell the table primitives to stack.
  The desk's `Table` primitives are unchanged (the desk at phone width is Ops Lite's).
  Converted: the trip's itinerary, a proposal's lines, Legal › Cookie settings' list, a
  destination's "Getting there" and content-block tables (Travel info, Privacy).
- **The card.** The first cell is the key field (16 px semibold), and the others follow as
  label : value pairs in two columns (`minmax(6rem, 2fr) 3fr`), labels in the secondary
  text colour and the body font even when the values are mono. Values are left-aligned on
  a phone, even in a column right-aligned from sm up. "Primary action last" has nothing to
  apply to, because no storefront table has a row action. The cards are divided by the
  table's existing row rule rather than boxed: four of the five tables already sit in a
  card or bordered box, and a box inside a box is not a DS pattern.
- **Semantics.** The roles (`table`, `rowgroup`, `row`, `columnheader`, `cell`) are
  explicit, because some browsers drop a table's semantics once its display changes. The
  header row is visually hidden on a phone but stays for assistive technology. The phone
  labels are `aria-hidden`, so a screen reader hears each header once. The scroll box
  stays a named keyboard stop on a phone, where it has nothing to scroll; this is
  harmless, and the attribute cannot change by width.
- **Room for the cookie banner (WCAG 2.4.11).** The banner reports its measured height as
  `--cookie-banner`, as the compare tray reports `--fixed-tray`. The height joins the
  root's `scroll-padding-bottom`, so the browser scrolls a focused element clear of it,
  and it pads the root's foot, so the end of every page can scroll above it. On Packages
  with both the tray and the banner showing, the two heights add up even though the
  banner covers the tray. That reserves too much rather than too little.
- **The banner on a phone (below md).** The purposes and "Save my selection" wait behind
  "Choose by purpose" (a disclosure: `aria-expanded`, chevron), placed before the rows it
  opens. "Reject non-essential" and "Accept all" stay side by side and equal (a basis of
  8 rem instead of 10 rem, so two fit in a 390 px banner), and the banner takes 36 % of a
  390 × 844 screen instead of about 60 %. Choosing by purpose is one tap away, and nothing
  is pre-ticked. From md the banner is unchanged and shows the rows, as on the board.
- **Sticky actions at the edge.** When the open banner scrolls, the action bar now sticks
  at the scroll box's very edge (`-bottom-5`, matching the box's padding). Before, rows
  showed through the 20 px below it.
- Copy: `cookies.choose` (en "Choose by purpose", es "Elegir por finalidad", fr "Choisir
  par finalité").
- **Not built:** the custom date-range picker (owner: native fields).

## Amendment, 2026-10-31: the desk idle lock

The owner chose the idle lock as the next M9 deferred item and approved
`docs/schema-m9-idle-lock.md` as recommended (L1(b), L2a–L7a): every staff session locks after
the limit with no input unless the person ticked "This is my own device" at sign-in, and the
lock holds on the server. One migration (`session.lastActiveAt`, `session.ownDevice`), no
dependency or spend. Where the boards (A-States 02, A-Login, A-Settings) were silent, the build
decided:

- **Which computer is shared.** The boards lock "the shared desk PC" and give "a personal
  device" 12 h, but nothing tells them apart, so the login page asks: a "This is my own
  device" checkbox (DS 02 `Checkbox`) above the passkey button, with the 12 h and the lock
  explained in its hint. It is remembered in that browser only, so the shared PC keeps it
  unticked, and it is sent once the desk loads, within ten minutes of sign-in. A link opened
  in another browser carries no choice and locks.
- **The lock screen** is A-States 02 as a full-screen native modal `<dialog>` on the page
  background (not the 50 % ink backdrop of DS 06, since nothing behind it may show): a
  384 px card with "Locked · <name>", the board's sentence with the applied limit, "Unlock
  with passkey" (primary, focused), and "Not <first name>? Sign in" (tertiary). Someone with
  no passkey gets "Sign in again" (it returns to the same address) instead of the passkey
  button. When the page itself loaded locked, the desk cannot ask whether the person has a
  passkey, so it shows both. Esc does not close it, and if the browser closes it anyway it
  reopens.
- **The page is kept.** The page stays mounted under the lock, hidden and `inert`; on unlock
  it re-reads its data. Reloading a locked page shows only the lock, at the same address. The
  dashboard's `/ops` feed, the conversation feed and the alert cue stop while locked.
- **What counts as input** is a key, click, touch, wheel or pointer movement in any desk tab
  of the browser. The tabs share it and report it at most once a minute; background refreshes
  never move the clock. Every tab locks together, and an unlock in one tab unlocks the others.
- **Settings.** "Idle lock after no input" joins the Security group of the thresholds (5–240
  min, default 30, two Super Admins). Security & audit lists it with the sessions, and its
  "not built yet" note now names only the IP allowlist and the new-device email.
- Copy: `backoffice.idleLock.*`, `backoffice.login.ownDevice`/`ownDeviceHint`, the threshold's
  label and "Used by", and `settings.security.idleLock`/`idleLockValue`, in en, es and fr.
- **Not built:** changing "own device" after sign-in (sign in again), and an idle lock for
  travelers or suppliers.

## Amendment, 2026-10-31: runtime feature flags (M9 D8b)

The owner chose runtime feature flags as the next M9 deferred item (`docs/schema-m9-settings.md`
D8 (b)) and decided, on 2026-10-31: a flag changes like a threshold (one Super Admin proposes,
a second applies, versioned and audited); switching one off makes the API refuse what it
covers, not only the pages; and `interactiveSvgMap`, which nothing read, now gates the
destinations map. No migration (the flags ride on `operating_settings`), dependency or spend.
Where the boards (A-Settings, Join, Custom, Destinations) were silent, the build decided:

- **Where the flags sit.** A "Features" group after Security in "Approvals & thresholds": the
  seven manifest flags as On/Off selects (the `switch` unit the passkey rule already uses),
  in the table with their "Default" (the manifest's value) and "Used by". A version written
  before the flags existed keeps the manifest's values. The Manifest tab still shows the
  file's flags, now noted as the defaults.
- **What off stops.** The two rails refuse new payment links on their rail (`OTHER` is a
  transfer), desk and traveler; the recruitment portal refuses new public applications; the
  builder refuses new custom requests and the older `POST /me/reservations` itinerary. Each
  refusal is 409 `{code: 'FEATURE_OFF', feature}`, after the body is validated and after a
  traveler's ownership check. What already exists (a pending transfer, its proof, an
  application or request under review, a proposal) goes on. The events strip and the
  "Instant" label change only the pages.
- **The closed pages.** `/join` and `/custom` render a page laid out like the 404 (h1, one
  line, Home / Browse trips or About us / Contact us; `featureOff.*`), `/custom` before
  asking anyone to sign in. Their footer and page links disappear as before. Without the
  map, Destinations keeps the layer chips, the province buttons and the list, and the
  panel's line no longer points at the map (`destinations.panel.textNoMap`).
- **Payments.** The desk panel offers only the rails that are on; with none, it says so and
  where a Super Admin switches one on (`backoffice.payments.noRail`). The traveler's trip
  keeps a transfer already started (bank details, proof) but, with the wire rail off, shows
  an info alert with a contact link in place of the plan chooser or the pay button
  (`account.payment.railOff`).
- **How fast.** The storefront reads the flags from `GET /tenant/config` on every request
  (falling back to the manifest when the API is down); the API applies a version at once in
  the process that applied it and within 60 s in others, as for every threshold.
- Copy: the group, labels and "Used by" lines, the manifest note, `featureOff.*`,
  `account.payment.railOff`/`contactUs`, `destinations.panel.textNoMap` and
  `backoffice.payments.noRail`, in en, es and fr.
- **Not built:** a one-person kill switch (owner: two Super Admins), editing the rest of the
  manifest at runtime (D8 (c)), a desk notice on Applications or Custom requests when
  their flag is off, and Destinations' lede without the map (it is the tenant's content and
  still says "The map shows…").

## Amendment, 2026-10-31: the desk's alerts on every page, and the queues' flag notices

The owner chose the alert cue on desk pages other than the dashboard next, with a notice on
the desk's Applications and Custom proposals while their flag is off. No migration,
dependency, route or spend. The boards draw the strip, the mute and the acknowledgement
only on A-Dashboard; where they were silent, the build decided:

- **One desk, every page.** The board, its clock, the `/ops` socket, the announced
  crossings, the cue, acknowledgements and the mute live in the dashboard layout
  (`DeskAlerts`), which stays mounted while the person moves between desk pages. This
  replaces "other desk pages do not sound" (2026-10-29): a red alert sounds, shows and is
  announced wherever the person is in the shell. Moving between pages keeps the sound on
  (no second "Turn on sound") and does not replay an alert already cued; the 60 s repeat
  runs on. Pages outside the shell (sign-in, invitation, passkeys, the idle lock) stay
  silent, as before.
- **The strip elsewhere** is A-Dashboard's strip, unchanged in tokens (error 600 with
  white text when red, warning 100 with a warning 500 rule when amber, the plain surface
  while only the mute is on), first in the page's `<main>`, under the section tabs and
  above the page title, so the skip link lands on it. "Go to matrix" leads to
  `/dashboard#matrix`. With no matrix row to press `A` on, it carries one "Acknowledge red
  alert · <code>" button per booking with an unacknowledged red alert, with the same 6 s
  undo; focus then moves to the page's start. The dashboard keeps its own strip above the
  matrix, so it never shows twice. On a phone each such button takes a line.
- **The undo outlives a page change.** It was closed (and recorded) on leaving the
  dashboard; now the toast stays up across desk pages and records when it runs out. Leaving
  the shell for a page outside it (Passkeys) records it at once; signing out (the session
  ends first), reloading or closing the tab drops it, as an undo would.
- **Announcements** are the same sentences on every page; "Press R to re-dispatch" is added
  only on the dashboard, where `R` reaches a matrix row.
- **Roles** as before: Operations Admin and Super Admin acknowledge and mute; support sees
  the strip and hears the cue, with no buttons.
- **Telemetry:** `admin_state_shown {kind: degraded}` is still sent only when the
  dashboard's live indicator would show the lost feed; the other events are unchanged.
- **The queues' notices.** While `recruitmentPortal` or `customItineraryBuilder` is off,
  Suppliers › Applications and Bookings › Custom proposals open with an info alert (DS 04):
  the storefront page is closed and new applications, or requests and itineraries, are
  refused; what is already there can still be worked; two Super Admins switch it back on
  under Features in Approvals & thresholds (a link to that tab, which every staff role
  reads). Copy `backoffice.featureOff.*` in en, es and fr; the storefront pages are named as
  the storefront titles them («Únete a nuestra red», « Rejoignez notre réseau »).
- **Not built:** `A` on a booking page's own services (the strip's buttons cover it), and a
  per-page choice to hide the strip.

## Amendment, 2026-11-01: staff recovery codes, and `A` on a booking's services

The owner chose recovery codes next (M9 D5), approved `docs/schema-m9-recovery-codes.md` as
recommended (R1a–R5a, migration `20261101114418_staff_recovery_codes`), and added two small
items. The boards give the rule (A-Settings › Security "Recovery", A-Login's "Lost access to
your email?" line, the permission matrix's "Users, roles, recovery codes" for Super Admins)
but no screen for issuing or using a code. The build resolved them with existing components
and tokens:

- **Where a code is issued.** On the person's row in Users & roles, as A-Login's line says
  ("in Settings › Users"): "Issue recovery code…" (secondary, small) opens a DS 06 dialog
  (the default 640 px from `md`, a bottom sheet on a phone). Step one is a warning alert naming what goes (the person's passkeys, counted, and
  every session) and the reason field, with Cancel and a destructive "Issue code". Step two
  shows the code once, in the mono face at the h3 size on the page surface inside a bordered
  box, then "Read it to <name> by phone or in person. It works once, until <time>, and is not
  shown again." and Done. Closing the dialog forgets the code. Security keeps the board's
  sentence and adds the rule as a fact ("One-time code from a Super Admin, 15 minutes") with a
  link "Issue recovery code…" to Users & roles, since a code needs a person. The board's
  "Revoke all sessions of a user…" there is the row's existing "Sign out everywhere".
- **An open code** shows on the row as a caption, "Recovery code open until 14:32" (desk
  time, Havana), with a tertiary "Withdraw code".
- **Using a code.** On the desk login, under a rule after the email form: the board's line,
  then a tertiary "Use a recovery code" that reveals one field, "Recovery code" (mono,
  one-time-code autocomplete, a hint), which signs in with the work email typed above; the
  submit is secondary and says what is missing while the email is empty. A refusal shows
  beside it, the same words for every cause. The session goes to `/passkeys`, which opens
  with a default alert ("You signed in with a recovery code…") and, once the passkey is added,
  "Your new passkey is ready. Sign in with it to use the desk."
- **Emails.** Two more kinds in the passkey change email (same shell and button): "A
  recovery code was issued…" naming the Super Admin, and "Your recovery code was used",
  in the tenant's primary language like the other staff emails.
- **The permission matrix** row reads "Users, roles, invitations and recovery codes".
- **`A` on a booking page's own services** (listed as not built on 2026-10-31): each red
  service row gets a secondary "Acknowledge" (named "Acknowledge red alert · <service> ·
  <code>") for ops write roles, before Re-dispatch, and `A` with focus in the row presses it.
  It acknowledges that service only, with the same 6 s undo; focus stays on the row's
  Re-dispatch. The shortcut list's "Where" for `A` now reads "Dashboard matrix, a booking's
  services".
- **Applications' empty state** names `/join`, the storefront's address since the redirect.

## Amendment, 2026-11-01: the new-device email

The owner chose the new-device email next (M9 D9) and approved
`docs/schema-m9-new-device-email.md` as recommended (N1a–N6a, migration
`20261101145749_staff_known_devices`). The board draws one ticked checkbox in A-Settings ›
Security, "Email the user on every new device sign-in", beside the IP allowlist, and no email.
The build resolved it with existing components and tokens:

- **The switch** is a threshold, not a checkbox on Security: it sits in Thresholds › Security
  under "Staff sign in with a passkey" and the idle lock, as a switch with the same
  two-Super-Admin save, because every other control on the board's Security card that changes
  how sign-in behaves already lives there. Label "Email staff on every new-device sign-in";
  "used by" reads "Desk sign-ins from a browser not seen before".
- **Security** keeps its facts list: a "New-device email" row ("Emailed on every sign-in from
  a new device", or "Off; new devices are still recorded"), then a caption explaining what a
  new device is and what forgets one, with a link "Thresholds › Security" in the link style of
  the recovery note above it. The "not built yet" caption now names only the IP allowlist.
- **The email** uses the Phase 6 shell: one paragraph, three facts as the shell's points
  (device, IP address, how they signed in), the "if this was not you" paragraph, and "Open the
  desk". The device reads "Chrome · Linux" in every language. It goes out in the tenant's
  primary language like the other staff emails, with the time in UTC.
- No desk page lists a person's known devices; that stays deferred with "forget this device".

## Amendment, 2026-11-01: permission overrides

The owner chose permission overrides next (M9) and approved
`docs/schema-m9-permission-overrides.md` as recommended (O1a–O8a, migration
`20261101202627_permission_overrides`). The board names them in four places: A-Settings ›
Permissions ("overrides are requested per action with a reason and expire after 24 h"),
A-States (a blocked Support member: "Read-only view · Request an override (reason · expires
24 h)"), A-Login ("Overrides outside this role go through Settings › Approvals with a mandatory
reason") and the thresholds table ("Override expiry — Everywhere an override exists"). It draws
no request form, no list of requests and no running override. The build resolved them with
existing components and tokens:

- **The request** sits on the page itself, not on a blocked page: the desk's view-only pages
  are readable, so A-States' block becomes an `Alert` under the page header, in the neutral
  tone, "Your role can view “Packages, catalog and imports” but not act on it here.", with
  "Request an override" as a small secondary button. It opens the small `Dialog` with a
  required reason (`Textarea`) and says the override ends after the threshold's hours and
  never counts as an approval. While the request waits the alert turns info ("… waiting for a
  Super Admin", "Withdraw the request"); while the override runs it turns success ("… active
  until …", "Give it back"). A decline, an end or a lapse is a caption under the offer.
- **Settings › Approvals** is the board's "Approvals & thresholds" tab, which holds only the
  thresholds table. The requests go on Permissions, under the matrix, as three cards in the
  matrix's table style: "Override requests" (person, permission, reason, asked, a note field
  with Approve and Decline), "Active overrides" (until and who approved, End) and "Overrides in
  the last 30 days" (an outline badge with the status, who decided, the note). The request
  email links there.
- **Override expiry** sits in Thresholds › Security, beside the passkey rule, the idle lock and
  the new-device email, rather than in a separate approvals group, with the same two-Super-Admin
  save; "used by" reads "Every permission override, from its approval".
- **Support on Settings** sees the read-only thresholds without the request button the A-States
  drawing shows (O2a): thresholds are a Super Admin row an override never reaches.
- **Approvals stay with the role**: an override holder sees a row's actions but not its refund
  votes, advisory approvals or supplier approvals (O3), so no button offers what the API would
  refuse.

## Amendment, 2026-11-01: display currencies

The owner chose display currencies next (M9 D7) and approved
`docs/schema-m9-display-currencies.md` as recommended (C1a–C7a, migration
`20261101221301_display_currencies`; the ECB reader built but off). The boards draw A-Settings ›
Currencies (a table and the rate source, spread, rounding and lock controls), the currency menu
in DS-Actions-Forms and DS-Handoff, the drawer's currency row in DS-Mobile-Patterns, Account's
"Language & money", and "≈ CA$" lines on Payment, M-Payment, D-Invoice and the emails. The build
resolved them with existing components and tokens:

- **The currency menu** sits right of the header's language links from md to lg, styled as
  they are (12 px uppercase muted, 32 px tall, the code and a chevron). From lg the six links
  leave it no room (measured at 1024 and 1280: Spanish 38–61 px and signed-in English 21 px of
  sideways scroll), so DS-Mobile-Patterns' desktop header loses it and the same menu sits in
  the footer's bottom row, in the footer's link tone, opening upward. It opens DS-Handoff's
  listbox: a 260 px
  `surface` panel with a border, `shadow-md` and `rounded-md`, each option "CAD · Canadian
  Dollar" over "1 € = 1.4891" (the base reads "Prices are set in EUR"), the selected one in
  primary-100 / primary-700 at the board's 10 × 12 px padding, and the note at its foot ("Prices
  are set and charged in EUR; … Your rate is locked when you pay the deposit"). Arrow keys,
  Home/End, Enter and Esc as DS-Handoff lists. Below md the header stays as it is and the
  drawer holds the same choice as a radio group under a "Currency" overline, like its Display
  section.
- **Analytics** sends T-Events' `locale_changed` with `kind: currency`, not DS-Handoff's
  `currency_changed`: the taxonomy already names the language and currency menus together.
- **Account › Preferences** gains a "Display currency" section (h4, a one-line lede, the radio
  group) between the notifications and the display settings; the board's single "Language &
  money" block is split because the language links stay in the header.
- **"Prices set in EUR"** is a caption under the Packages result count, under the Package
  page's price and under the builder's estimate, shown only while another currency is.
- **The "≈" line** is a caption under a payable total: "≈ CA$918 · the rate locks when you pay
  the deposit", or "· rate locked on 14 Oct 2026" once the booking has one. It replaces the
  boards' "about CA$ …" and "Charged in EUR (≈ CA$ …)", so every payable surface reads the same.
- **Settings › Currencies** keeps the board's columns (Currency, Role, Rate today, Shown to,
  On); "Rate today" reads "1.4891 (1.4802 + spread)" and "On" is a badge, with the rate source,
  the rates' day, the spread and the lock point below as facts and a link to Thresholds. The
  switches, the spread and the lock point are a Currencies group on Thresholds with the same
  two-Super-Admin save, as the new-device switch went to Thresholds rather than its own tab.
  USD's "Shown to" is the United States only (C2a); CHF's is "No default region".
- **Not drawn on the desk:** the "Gateway rate" source (no live gateway) and "Absorb rounding
  under € 0.50" (a reconciliation tolerance with nothing to decide until real rails); both stay
  in the doc's §4.
- **The invoice** prints "Prices in EUR. Reference in CAD at the rate locked on 2026-10-12
  (1.489081): 4616.15 CAD. The rate stays the same for the whole payment schedule; your bank sets
  the rate it charges." under the total, rather than D-Invoice's "at the ECB rate", because the
  locked rate includes the spread and the source may be the mock.

## Amendment, 2026-11-02: the Super Admin IP allowlist

The owner chose the IP allowlist next (the last M9 Security control the board draws) and
approved `docs/schema-m9-ip-allowlist.md` as recommended (I1a–I7a; no migration, no
dependency). The board draws one ticked checkbox in A-Settings › Security, "Super Admin sign-ins
only from the allowlisted IPs (Havana office, Spain office, VPN)", and nowhere to edit the
list, the refusal or the login. The build resolved them with existing components and tokens:

- **The switch and the list** are thresholds, as the passkey rule and the new-device email
  are: Thresholds › Security gains "Super Admin sign-ins only from the allowlisted IPs" (an
  On/Off select) and "Allowlisted IPs", a nested fieldset spanning the group's grid (legend in
  the field-label style, 14/20 medium). Each row is two DS 02 fields, "Label" and "Address or
  range" (mono), and a tertiary "Remove" (named "Remove <label>"); rows stack below sm, where
  "Remove" keeps its own width. Below them: the hint caption, a secondary "Add an address" and
  "Add my sign-in address" (with the unavailable reason when the address is listed or the list
  is full), then "Your sign-in address:" in mono. A typo shows the field's error before
  anything is sent. While the proposal switches it on and leaves the person's address out, a
  warning Alert says it would refuse them; the pending version shows the same warning to the
  approver, and the apply's 422 reads as a translated destructive Alert.
- **The thresholds table** reads the list as "Havana office · 203.0.113.0/24, …" or "None".
- **Security** gains a "Super Admin IP allowlist" fact ("On · 2 addresses" / "Off") and a
  caption with a "Thresholds › Security" link in the link style of the notes above it; the
  "not built yet" caption is gone.
- **A refused session** goes to the login page, which signs it out and shows a destructive
  Alert above the form naming the address ("… This one came from 198.51.100.7. Sign in from an
  office or the VPN, or ask another Super Admin to add this address.").
- **IPv6** is shown as the /64 network Better Auth keeps (`2001:db8:4:1::/64`), the same text
  "Add my sign-in address" puts in the list.

## Amendment, 2026-11-04: the emails' "about" lines (display currencies C7b)

The owner chose the display-currency email lines next (C7b, deferred on 2026-11-01; no
migration). E-Received draws "total … (about CA$ 4,588; the rate locks when you pay the
deposit)" and E-Invoice "About CA$ 918 · rate locks at payment" under the deposit due. The build
resolved them inside the Phase 6 email shell (inline Arial, no web tokens):

- **The emails say "about", not "≈"**: the 2026-11-01 "≈" caption is a web pattern; the email
  boards write "about", and a plain-text part reads it better than a symbol. Amounts are whole
  units, rounded up, as the "≈" captions are.
- **E-Received** keeps the board's parenthesis after the total in its table, with the
  storefront's lock words. The table's labels now sit at the top of their row, so a total that
  wraps on a phone keeps "Total" beside its first line.
- **E-Invoice** offers a choice rather than the board's single "Deposit due now" (M4), so the
  guide follows each amount payable now, "(about CA$918)", and one note before the payment
  window says the payments are charged in EUR and when the rate locks. The board's "rate locks
  at payment" becomes "the rate locks when you pay" under DEPOSIT and "when you choose how to
  pay" under INVOICE, which is what the code does. The balance has no guide, as on the board.
- A booking with a locked rate reads "rate locked on {date}" in both, at that rate.

## Amendment, 2026-11-06: the package editor's refusals

The owner chose to refuse a package save that would take a departure, tier or extra from under
its bookings, or cut a departure below its booked seats (no migration). No board draws this.
The build resolved it inside A-Package-Edit with existing components:

- **The refusal** is the form's destructive Alert above the save button: one line saying
  nothing was changed, then a list with a line per row, naming the row, the booking codes and
  what to do. Five codes show, then "and N more". A date reads as the editor's own `YYYY-MM-DD`.
- **A departure's status** is a fifth field in the row, the same `Select` as the package's
  status (Open, Closed, Cancelled), so the advice to close a departure can be followed. The
  row's grid gains a column; below `sm` the fields stack as before.
- **The storefront's package page** lists only open departures, as the Booking page does; a
  closed one drops off the list rather than gaining a label.
