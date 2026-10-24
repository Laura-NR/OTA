# M10 Events (ticket concierge): schema diff for review

**Status:** **Draft 2026-10-24, for the owner's decision.** Nothing is generated or applied until
D1–D10 are answered.
**Date:** 2026-10-24
**Scope:** `docs/design-v1.1-plan.md` Phase 8 item 4 (Concierge: events and requests, **M10**),
read against the Concierge and M-Concierge boards (event access, a three-step request, trip
paths, "All events"; accepted 11 Oct 2026, change response 01 B4) and the Home board's event
strip. It builds on M5 (custom requests and proposals), M2 (frozen price lines), M4 (the payment
schedule), M7 (per-locale text, province codes) and M9 (runtime thresholds). The storefront has
no Events page today: the nav omits the link (Phase 2: a link renders only when its page
exists), and the Home strip's "Request event access" goes to the Support form
(`apps/storefront/src/components/site-strips.tsx`).

## 1. What M10 covers

| Board item | Today | Where it lands |
|---|---|---|
| "All events": name, dates (or "dates tbc"), place, access status | The Home strip's words in `tenant/messages` | `events` with nights and seat categories, edited on the desk (D1, D2) |
| Event page: hero, three steps, the honest notes | None | `/events/[slug]`, per-locale text (D1) |
| Step 1: festival nights, seats (1–8), category (general, numbered, all-festival pass) | None | `event_requests` (D3) |
| Step 2: where the tickets go (build a trip / attach to my booking / tickets only), arrival, nights, after the festival | None | The request's path; a derived M5 custom request, or a link to the traveler's booking (D5) |
| Step 3: name, email, phone, nationality, notes, "keep it 90 days" | None | Sign-in first; the account's details (D4) |
| "Request received", nothing charged, status in the account | None | Request statuses (D3); the account and the trip page list them |
| "Confirmed seats are added to your invoice at price + fee per seat" | None | Price lines on the booking at confirmation; a ticket instalment once the price is locked (D6) |
| "The desk confirms availability within 48 hours" | None | Derived on read; the hours join the M9 thresholds (D7) |
| "If tickets fall through, [rule]"; "[confirmation date]"; "[fee per seat]" | None | Manifest `concierge` block and tenant copy, as placeholders (D8) |
| "We hold a room at Casa Lis until [hold date]" | None | **Deferred**: room holds are not modelled anywhere (§4) |
| Event photos | None (no photography yet) | **Deferred**: alt text only, as destinations (§4) |

There is no admin board for events or requests. The desk surfaces (D10) are resolved from the
existing tokens and the A-Content and A-Bookings patterns, and recorded in the ADR 0006 amendment
when built (the owner's rule of 2026-10-14).

## 2. Data changes (this is why it is Article 2)

- **Five new tables:** `events`, `event_nights`, `event_seat_categories`, `event_translations`,
  `event_requests`.
- **Five new enums:** `EventStatus` (DRAFT, PUBLISHED, ARCHIVED), `EventAccess`
  (ALLOCATIONS_OPEN, REQUEST_ONLY, PASSES, GUIDE_ONLY), `SeatCategoryKind` (GENERAL, NUMBERED,
  PASS), `EventRequestStatus` (SUBMITTED, REQUESTING, CONFIRMED, UNAVAILABLE, CANCELLED) and
  `EventRequestPath` (BUILD, EXISTING, TICKETS_ONLY).
- **Three enum values added:** `PriceLineKind.EVENT_TICKET` and `PriceLineKind.CONCIERGE_FEE`;
  `InstalmentKind.TICKETS` (D6).
- **Nothing is backfilled.** No existing row changes.
- **Manifest (no migration):** a `concierge` block (fee per seat, maximum seats, payment days),
  placeholders (D8). **Thresholds document (no migration, JSON):** `conciergeAnswerHours` (D7).
- **Behaviour changes that need your approval even without a migration:** a price-locked booking
  accepts desk-confirmed ticket lines and a new instalment (D6); the storefront gains an Events
  nav link and the Home strip links to an event page.

## 3. Decisions (options and recommendation)

**D1 · Where events live.**
(a) In the database, edited on the desk (Content › Events): an `events` row with its nights and
seat categories, the text in a source locale plus one `event_translations` overlay per locale
(nights and categories keyed by id inside it), the pattern M1 uses for packages. Publishing
checks the source text and, for the storefront's locales, a published translation or a fallback
to the source, as packages do.
(b) In tenant files (`tenant/events.json` for dates and statuses, `tenant/messages` for the
words), changed by a commit; only the requests go in the database, holding the event's key and a
snapshot.
**Recommend (a).** The board's statuses move as organisers release allocations ("status changes as
allocations open"), monthly and without a release; a request needs a stable foreign key to the
night and category it asked for; and the desk already edits packages and advisories this way. (b)
is lighter but makes "allocations open" wait for a deploy.

**D2 · Dates, access and status.**
(a) `startsOn`/`endsOn` are calendar dates (UTC days, like balance due dates) and always set, at
least to the month's bounds; `datesConfirmed` false shows "Feb 2027 · dates tbc" from the start
month. `confirmBy` (nullable) is the date by which the desk confirms seats ("we confirm seats by
[confirmation date]"). `access` is the board's status chip: ALLOCATIONS_OPEN, REQUEST_ONLY,
PASSES ("passes via concierge") and GUIDE_ONLY ("free events · guide only": no seats; the page
offers the custom builder instead of the request form). `status` is the publication state; the
storefront lists PUBLISHED events whose `endsOn` is today or later, soonest first, and an event
past its end leaves the list without anyone archiving it. The province is a code (CU01…), as in
M7.
(b) Free-text "when" per locale.
**Recommend (a).** Dates the code can read sort the list, hide past events, prefill a trip and
check that a night lies inside the event; free text can do none of these.

**D3 · The request and its life.**
(a) A separate `event_requests` table: the traveler, the event, a reference (`VX-E-XXXXXXXX`, the
M5 generator; the board's "CR-2027-0007" is a sample format), the chosen nights (night ids; empty
for a pass), the seat category, seats (1–8; "groups over 8 talk to a specialist"), the path (D5),
the link (D5), optional notes, and the status:
SUBMITTED → REQUESTING (the desk confirmed it can request these seats) → CONFIRMED (seats secured,
on a booking) or UNAVAILABLE (the desk cannot get them, or they fell through before
confirmation); CANCELLED (the traveler withdraws before confirmation, or the linked booking is
cancelled). Ticket count = seats for a pass, otherwise seats × nights (the board's formula), in
`@ota/domain`. Every move is audited (`event_request.*`).
(b) Store event requests as M5 custom requests with an event payload.
**Recommend (a).** A request with seats, nights and a confirmation date has its own life, and
mixing it into the builder's payload would make the proposal desk and the retention redaction
branch on the kind. (a) reuses M5 where the trip is built (D5).

**D4 · Sign-in.**
(a) Sign in first, as the Booking form and the builder (owner decision 2026-10-17: no public route
creates users or bookings). Step 3 shows the account's name and email and asks only the phone
and nationality when the account lacks them, stamping them on the user as booking does. No
90-day consent record: the request belongs to the account (as decided for the builder,
2026-10-18), and the 90 days become a retention rule (D9).
(b) A guest request with name and email, as the board draws it.
**Recommend (a).** (b) needs a public write route that stores a stranger's details, which you
refused for bookings. The magic link comes before the form, with `?next=` back to the event.

**D5 · Where the tickets go (the three paths).**
(a)
- **BUILD** ("build a trip around the festival"): the request carries the board's step 2 (arrival
  date, total nights, the place after the festival). In the same transaction the API creates an
  M5 custom request derived from it (dates; adults = seats; a route of La Habana for the festival
  nights, then the chosen place for the rest; a note naming the event request), and links it.
  The desk then answers with a proposal as it does today.
- **TICKETS_ONLY**: "not offered on its own; we propose the smallest trip". The same derived
  custom request with La Habana only, marked tickets only, so the desk proposes the one-night
  package the board mentions.
- **EXISTING**: the traveler picks one of **their own** open bookings (not cancelled or
  completed, ending after the event starts) or open custom requests from a list; no free-text
  code (they are signed in, so a list is safer and cannot point at someone else's trip).
When a proposal on the linked custom request is accepted, the acceptance's transaction links the
request to the booking it creates. Seats are confirmed only onto a booking (D6). The board's
"Keep building the trip" is not drawn: the builder cannot edit an existing request yet.
(b) Only EXISTING: a request must name a booking.
(c) Open the full custom builder with the dates prefilled and link whatever it submits.
**Recommend (a).** It follows the board's three paths with the M5 desk unchanged. (c) leaves an
unlinked request whenever the traveler abandons the builder.

**D6 · How confirmed seats reach the bill.**
The board says nothing is charged until seats are confirmed, and that confirmed seats are added
to the invoice and paid with the deposit. Seats are often confirmed after the deposit (the
organiser releases allocations a few weeks before), when M2/M4 have locked the price
(`PRICE_LOCKED_STATUSES`, from PENDING_PAYMENT).
(a) At confirmation the desk enters the seat price actually paid (prefilled from the category)
and the API freezes it with the manifest fee on the request, then writes two price lines on the
booking (`EVENT_TICKET` × tickets, `CONCIERGE_FEE` × tickets). If the price is not locked, they
simply join the total and the schedule built at the payment link (the board's "paid with your
deposit"). If it is locked, they are the one exception to the lock: the total rises by exactly
those lines and a `TICKETS` instalment for that amount is appended, due in the manifest's payment
days or on the balance's due date, whichever comes first; the existing payment-due alert and
reminders cover it. All audited. The documents are regenerated; whether a regenerated invoice is
enough or a supplementary invoice is required is a **finance/counsel question**, recorded as
such.
(b) Tickets are accepted only before the price locks; later confirmations are settled outside the
platform.
(c) Raise the balance instalment's amount instead of adding one.
**Recommend (a).** It keeps "added to your invoice" true at every stage with one money path. (b)
fails the board's usual case. (c) edits an instalment in place, and fails when the balance is
already paid.

**D7 · The 48-hour answer and dispatch.**
(a) The 48 h answer is derived on read: a SUBMITTED request older than `conciergeAnswerHours` is
an alert on the desk's dashboard, as payment alerts are. The value joins the M9 thresholds
document (default 48, edited with the second-Super-Admin apply). Tickets are bought by the desk
from licensed sellers, so they are **not** a supplier service item and never enter dispatch; the
voucher lists confirmed tickets from the request, and the trip's guide stays an ordinary service
item.
(b) A ticket ServiceItem per night, dispatched like any service.
**Recommend (a).** Dispatch offers jobs to suppliers with a timer; a ticket bought by the desk has
no supplier to answer it, so a service item would sit unassigned and raise false escalations.

**D8 · Terms and fall-through.**
(a) A manifest `concierge` block: `feePerSeat` and `currency`, `maxSeats` (8) and
`ticketPaymentDays` (7). The fall-through rule, the confirmation wording and the arrival advice
are tenant copy (`tenant/messages`). All are placeholders until the agency and counsel publish
them, shown with the sample notice. A seat that falls through **before** confirmation costs
nothing (UNAVAILABLE). An event cancelled **after** confirmation is refunded through the M4
refund flow under its existing FORCE_MAJEURE reason; no new refund reason.
(b) Per-event fees and rules on the event row.
**Recommend (a).** The board names one agency fee. A per-event fee can be added to the category
later without a migration of the requests, because the fee is frozen on each request at
confirmation.

**D9 · Retention.**
(a) Event requests follow the traveler lifecycle (ADR 0004, the Tier 1 purge): on anonymization
the notes are redacted, and the event, nights, seats, category and frozen amounts stay for the
fiscal and BI aggregates. A request that ended without a booking (UNAVAILABLE or CANCELLED, never
linked) is deleted 90 days after it closed by the existing daily retention scan; this is what the
board's "keep it for 90 days" becomes. Events hold no personal data.
(b) Keep closed requests until the account's own purge.
**Recommend (a).** It keeps the board's promise without a consent record (D4).

**D10 · Desk surfaces, roles and notifications.**
(a)
- **Content › Events**: the list (status, dates, access, request count) and the editor (details,
  nights, categories with the indicative seat price, translations, publish/archive), beside the
  advisories tab.
- **Bookings › Event requests**: a queue like Proposals (status, the 48 h alert, the event, seats,
  the path and the link); the request page acknowledges (REQUESTING), marks unavailable with a
  reason, cancels, and confirms onto the booking with the seat price (D6). The linked booking
  shows its requests.
- Writes are Operations Admin and Super Admin only; reads are the ops roles (support stays
  read-only, as decided 2026-10-20). Every route goes into the RBAC matrix.
- Storefront: `/events` (All events), `/events/[slug]` (the Concierge board), the nav link, the
  Home strip pointing at an event chosen by the tenant copy (an optional `eventSlug` in the strip's
  content; no column), the account and trip page listing requests.
- Emails in the traveler's locale (en/es/fr), best-effort after the transaction: received,
  requesting, confirmed (with the amounts and the instalment if any), unavailable.
(b) The same without the emails.
**Recommend (a).** The board promises "you see the status in your account"; the emails follow the
Phase 6 pattern and need no provider.

## 4. Deferred, not in M10

- Room holds for festival weeks ("we hold a room at Casa Lis until [hold date]"): no hold model
  exists; the desk keeps doing it by hand.
- Event photos and media storage (alt text only, as destinations, until photography exists).
- "Keep building the trip" (editing an existing custom request in the builder).
- The board's US note ("concerts count as Support for the Cuban People…"): shown only as tenant
  copy marked for counsel; the OFAC certification stays at booking (M3).
- Groups over 8 (the request refuses them and points at a specialist).
- SMS for request updates (waits for the SMS provider, Q10).

## 5. What lands with M10 once approved

- Migration `events_concierge` (§6) and the manifest's `concierge` block (placeholders, recorded
  in `tenant/README.md`); a seeded sample event with nights and categories (dev only).
- `@ota/domain`: ticket count; the request's status moves; the night-inside-event and seat limits;
  the derived custom-request payload for BUILD and TICKETS_ONLY; the "linkable booking" rule for
  EXISTING; the ticket price lines and the locked-price instalment (D6); the answer-SLA alert.
- `@ota/schemas`: event (editor and public, per locale), request create/DTO, desk actions,
  `concierge` manifest block, `conciergeAnswerHours` in the thresholds document, the strip's
  optional `eventSlug`.
- API (every route in the RBAC matrix): public `GET /catalog/events`, `GET /catalog/events/:slug`
  (published only, `?locale=`); ops `GET|POST /events`, `GET|PATCH|DELETE /events/:id`,
  `PUT /events/:id/translations/:locale`, `POST /events/:id/publish|archive`; traveler
  `POST /me/event-requests`, `GET /me/event-requests`, `POST /me/event-requests/:id/cancel`; ops
  `GET /event-requests`, `GET /event-requests/:id`,
  `POST /event-requests/:id/requesting|unavailable|confirm|cancel`. Proposal acceptance links the
  request; the retention scan and the Tier 1 purge cover requests.
- Desk and storefront as D10, in en/es/fr; the voucher's ticket lines; the four emails.
- e2e: publish an event on the desk; a traveler requests seats with the BUILD path and sees it in
  the account; the desk confirms onto a priced booking and the price lines and the ticket
  instalment appear; an UNAVAILABLE request charges nothing.

## 6. The diff

```prisma
/// M10: an event's publication state (D2).
enum EventStatus {
  DRAFT
  PUBLISHED
  ARCHIVED
}

/// M10: the board's access chip (D2).
enum EventAccess {
  ALLOCATIONS_OPEN
  REQUEST_ONLY
  PASSES
  GUIDE_ONLY // free events: no seats, the page offers the builder
}

enum SeatCategoryKind {
  GENERAL
  NUMBERED
  PASS // every night; one ticket per seat
}

/// M10: a request's life (D3).
enum EventRequestStatus {
  SUBMITTED
  REQUESTING  // the desk confirmed it can request these seats
  CONFIRMED   // seats secured and priced on a booking
  UNAVAILABLE // not obtainable, or fell through before confirmation
  CANCELLED
}

enum EventRequestPath {
  BUILD
  EXISTING
  TICKETS_ONLY
}

model Event {
  id             String      @id @default(uuid()) @db.Uuid
  slug           String      @unique
  status         EventStatus @default(DRAFT)
  access         EventAccess
  /// Province code (CU01…), as M7 regions.
  province       String
  /// UTC calendar days; at least the month's bounds until datesConfirmed (D2).
  startsOn       DateTime    @map("starts_on") @db.Date
  endsOn         DateTime    @map("ends_on") @db.Date
  datesConfirmed Boolean     @default(false) @map("dates_confirmed")
  /// The date by which the desk confirms seats.
  confirmBy      DateTime?   @map("confirm_by") @db.Date
  sourceLocale   String      @default("en") @map("source_locale")
  name           String
  place          String
  summary        String
  notes          String?
  publishedAt    DateTime?   @map("published_at")
  createdAt      DateTime    @default(now()) @map("created_at")
  updatedAt      DateTime    @updatedAt @map("updated_at")

  nights       EventNight[]
  categories   EventSeatCategory[]
  translations EventTranslation[]
  requests     EventRequest[]

  @@index([status, endsOn])
  @@map("events")
}

model EventNight {
  id       String   @id @default(uuid()) @db.Uuid
  eventId  String   @map("event_id") @db.Uuid
  date     DateTime @db.Date
  label    String   // "opening gala"
  venue    String?
  position Int

  event Event @relation(fields: [eventId], references: [id], onDelete: Cascade)

  @@unique([eventId, position])
  @@map("event_nights")
}

model EventSeatCategory {
  id           String           @id @default(uuid()) @db.Uuid
  eventId      String           @map("event_id") @db.Uuid
  kind         SeatCategoryKind
  name         String
  description  String?
  /// Indicative; null until the organiser announces it. The paid price is frozen on the request.
  pricePerSeat Decimal?         @map("price_per_seat") @db.Decimal(10, 2)
  currency     String           @default("EUR")
  position     Int

  event    Event          @relation(fields: [eventId], references: [id], onDelete: Cascade)
  requests EventRequest[]

  @@unique([eventId, position])
  @@map("event_seat_categories")
}

model EventTranslation {
  id              String   @id @default(uuid()) @db.Uuid
  eventId         String   @map("event_id") @db.Uuid
  locale          String
  name            String?
  place           String?
  summary         String?
  notes           String?
  /// { [nightId]: { label, venue } } and { [categoryId]: { name, description } }.
  nights          Json?
  categories      Json?
  published       Boolean  @default(false)
  sourceUpdatedAt DateTime @map("source_updated_at")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  event Event @relation(fields: [eventId], references: [id], onDelete: Cascade)

  @@unique([eventId, locale])
  @@map("event_translations")
}

model EventRequest {
  id              String             @id @default(uuid()) @db.Uuid
  /// The visible reference (VX-E-XXXXXXXX).
  reference       String             @unique
  userId          String             @map("user_id") @db.Uuid
  eventId         String             @map("event_id") @db.Uuid
  categoryId      String             @map("category_id") @db.Uuid
  /// EventNight ids; empty for a pass.
  nightIds        String[]           @default([]) @map("night_ids") @db.Uuid
  seats           Int
  path            EventRequestPath
  status          EventRequestStatus @default(SUBMITTED)
  /// BUILD / TICKETS_ONLY: the derived M5 request; EXISTING: the one picked, if a request.
  customRequestId String?            @map("custom_request_id") @db.Uuid
  /// EXISTING: the booking picked; set on proposal acceptance for the other paths.
  reservationId   String?            @map("reservation_id") @db.Uuid
  locale          String?
  notes           String?
  /// Frozen at confirmation (D6).
  pricePerSeat    Decimal?           @map("price_per_seat") @db.Decimal(10, 2)
  feePerSeat      Decimal?           @map("fee_per_seat") @db.Decimal(10, 2)
  currency        String             @default("EUR")
  /// Why the desk marked it unavailable or cancelled it.
  closedReason    String?            @map("closed_reason")
  answeredAt      DateTime?          @map("answered_at")
  confirmedAt     DateTime?          @map("confirmed_at")
  closedAt        DateTime?          @map("closed_at")
  createdAt       DateTime           @default(now()) @map("created_at")
  updatedAt       DateTime           @updatedAt @map("updated_at")

  user          User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  event         Event             @relation(fields: [eventId], references: [id], onDelete: Restrict)
  category      EventSeatCategory @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  customRequest CustomRequest?    @relation(fields: [customRequestId], references: [id], onDelete: SetNull)
  reservation   Reservation?      @relation(fields: [reservationId], references: [id], onDelete: SetNull)

  @@index([status, createdAt])
  @@index([userId, createdAt])
  @@index([reservationId])
  @@map("event_requests")
}

// Added enum values:
//   PriceLineKind  += EVENT_TICKET, CONCIERGE_FEE
//   InstalmentKind += TICKETS
// Back-relations: User.eventRequests, CustomRequest.eventRequests, Reservation.eventRequests.
```

Database checks the migration would add by hand: `seats` between 1 and 8; `ends_on >= starts_on`;
a CONFIRMED request has a reservation, both frozen prices (≥ 0) and `confirmed_at`; an UNAVAILABLE
or CANCELLED request has `closed_at`; a seat price is ≥ 0. The API checks the same first, and also
that each night and the category belong to the request's event (a cross-row rule the database
cannot express without a trigger). Deleting an event with requests is refused (RESTRICT);
archiving is the path.

**Retention.** As D9: notes redacted on anonymization; never-linked closed requests deleted 90 days
after closing by the daily scan; events hold no personal data.

The migration would be generated with `pnpm --filter @ota/db exec prisma migrate dev
--create-only --name events_concierge` (never `prisma format`), the checks appended to its SQL,
and then applied with `prisma migrate dev`, as M3, M6 and M9 did. Adding enum values in
PostgreSQL cannot run inside the same transaction that uses them; the generated SQL only adds
them, so this is safe.
