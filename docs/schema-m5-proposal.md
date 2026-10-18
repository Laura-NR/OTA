# M5 Custom-trip proposal: schema diff for review

**Status:** **Approved 2026-10-17 and generated.** The owner took the recommendations in §3 and the
answers in §7. Migration `20261017181739_custom_proposals` was applied: `CustomRequest`, `Proposal`,
`ProposalVersion`, `ProposalPriceLine`, four enums, and the `User`/`Reservation`/`InventoryItem`
relations. Additive; no backfill. Implementation notes are in §8.
**Date:** 2026-10-17
**Scope:** `docs/design-v1.1-plan.md` Phase 4, M5; the `Custom` / `M-Custom` builder boards and the
`D-Proposal` document board in `design/vereda-v1.2/project/`. It builds on M1 (package pricing and
policy keys), M2 (travelers, rooms and frozen price lines), M3 (OFAC) and M4 (deposit, balance and
refunds). It does not change the curated-package path.

## 1. What M5 covers

| Board / plan item | Where it lands in M5 |
|---|---|
| Five-step Custom builder: dates, route/provinces, pace, interests, transport, stays, activities and guides, contact details, proposal language, budget, must-haves | `CustomRequest.payload`, validated by a schemas type; no price is promised yet |
| "Request my priced proposal · free", reference `VX-C-4R8T`, "submitted / in review / proposal sent / revisions / accepted" | `CustomRequest` + `Proposal` status and the request timeline |
| D-Proposal: version, "prices held until", route and stops, day-by-day plan, price lines by category, per-person and total, deposit terms, options | `ProposalVersion` (immutable), `ProposalPriceLine`, and a validated `ProposalVersion.document` snapshot |
| "Accept the proposal online: nothing is charged" | an audited acceptance that creates the booking request, never a payment |
| "We send 11 requests to your hosts, guides and driver; they answer within 24 h" | the existing dispatch flow, started by the desk after acceptance |
| Planning fee, response time, validity | manifest `proposals` terms (no migration) |
| Proposal PDF | a stored `pdfKey` per version (Phase 6 renders it) |

The existing `/custom` builder posts to `POST /me/reservations`, which creates an `ITINERARY_SUBMITTED`
booking immediately with the sum of the chosen catalog items. That path has no priced proposal and no
version to accept. M5 keeps that path working for existing bookings and moves new custom requests to
the request → proposal → acceptance flow below.

## 2. Data changes (this is why it is Article 2)

Four new tables and four enums:

- `custom_requests` — the builder's answers and the 90-day request record;
- `proposals` — the thread: status, current version, assignment, acceptance and the booking it created;
- `proposal_versions` — an immutable priced version with its validity, terms and document snapshot;
- `proposal_price_lines` — the version's money, in the categories the D-Proposal prints.

Additive only. No backfill: existing `Reservation` rows with `customItineraryPayload` keep working and
are not turned into proposals. A new nullable `Proposal.reservationId` (unique) links the accepted
proposal to the booking it creates; `Reservation` gains the reverse relation.

New personal data: the request payload holds the traveler's name, email, phone, nationality, notes and
route; a proposal version holds their names, dates and priced itinerary. Both must join
`docs/pii-at-rest-review.md` and the retention purge (Tier 1): free text and names are redacted when
the traveler is anonymized, while totals, dates and categories stay for fiscal and BI aggregates.
Proposal PDFs are payment/commercial evidence and follow the invoice tier; they are not deleted by the
traveler purge.

The agency's proposal terms (planning fee, validity days, response hours, default policies) go into the
tenant manifest, not the database, as with M1/M4.

## 3. Decisions (options and recommendation)

**D1. Where a custom request lives**
- **(a) A new `CustomRequest`, separate from `Reservation` (recommended).** The builder writes a
  request with a reference and a payload, not a booking. Only acceptance creates a `Reservation`. This
  matches the boards ("this proposal is not a booking") and keeps My trips, the state machine and the
  ops board free of requests that nobody has accepted.
- (b) Reuse `Reservation` at `ITINERARY_SUBMITTED` and attach proposals to it. Less new code, but a
  request appears as a booking before it has a price or an acceptance, and the state machine has no
  honest state for it.
- (c) Store the proposal in `Reservation.customItineraryPayload`. No migration, but no versioning, no
  acceptance trail and no queryable price lines.

**D2. Proposal and versions**
- **(a) `Proposal` + immutable `ProposalVersion` rows (recommended).** A revision creates a new
  version; the previous one stays readable. The accepted version id is the source of truth.
- (b) One `Proposal` row overwritten on every revision. Simple, but the accepted words and prices can
  disappear and a revision race is invisible.
- (c) One row with a JSON history. No relational integrity for price lines and awkward queries.

**D3. The proposal document's shape**
- **(a) Normalised `ProposalPriceLine` for money + a validated `document` JSON for the narrative
  (recommended).** Route, stops, days, options and the "what happens next" copy are a snapshot; the
  price lines stay queryable and are copied into the invoice. The JSON is parsed by a schemas type, so
  a malformed proposal fails at write time.
- (b) Fully normalised `ProposalStop`, `ProposalDay` and `ProposalOption` tables. More CRUD and more
  migration for content that is printed, not queried; revisit if the desk needs structured editing.
- (c) A single JSON document including money. The invoice would recompute from JSON and lose the
  reproducible lines M2 established.

**D4. What acceptance copies into the booking**
- **(a) Price lines 1:1, and service items for lines that are bookable (recommended).** Each accepted
  line becomes a `ReservationPriceLine` (same label, quantity, unit and amount), so the invoice adds
  up. Lines with a `serviceType`, a province and dates (transport, lodging, guide, experience) also
  become `ServiceItem` rows for dispatch; meals, insurance, tourist cards and fees are price-only.
- (b) Copy only the total and let the desk re-enter the lines. Faster to build, but the invoice can
  disagree with the accepted proposal.
- (c) Auto-price everything from the catalog. The catalog has no private driver, meal or guide-day
  products, so the custom proposal would lose its main lines.

**D5. Validity and revisions**
- **(a) `validUntil` on each version; expiry derived on read (recommended).** "Prices held until 21
  Oct" is a version property. An acceptance after that date is refused with a 409 and a new version is
  sent. No scheduled job is needed, matching the M4 read-time alerts.
- (b) A scheduled expiry job that mutates `Proposal.status`. More moving parts for a value that only
  matters when someone tries to accept.
- (c) No expiry. The board promises held prices; without a date the promise is false.

**D6. How the traveler views and accepts**
- **(a) Sign-in required at `/account/proposals/<id>`; the email carries a magic link (recommended).**
  The proposal shows names, dates and prices, so it stays behind the traveler's session like the trip
  page and documents. Acceptance is a POST with the version id; a stale version is refused.
- (b) The board's public `vereda.travel/p/VX-C-4R8T`. The reference is short and the page is personal;
  a public URL would need a long random token, rate limiting and an audit of every view. Defer unless
  the owner wants anonymous sharing.
- (c) A public PII-free summary plus sign-in to accept. More surface for little benefit in M5.

**D7. What acceptance creates**
- **(a) A `Reservation` at `ITINERARY_SUBMITTED`, with the accepted price lines, the party/traveler
  data from the request, `customItineraryPayload` pointing at the proposal version, and service items
  for bookable lines (recommended).** The desk then dispatches as today; nothing is charged. The M4
  invoice and deposit flow follows once the booking is secured.
- (b) Create the booking at `DISPATCH_IN_PROGRESS` and auto-dispatch. The board says the desk sends the
  provider requests after acceptance; auto-dispatch is a later M8 decision.
- (c) Create the booking only after every provider accepts. The traveler would have no booking to
  track during the 24-hour confirmation window.

**D8. Proposal terms and the planning fee**
- **(a) A manifest `proposals` block (recommended): planning fee, validity days, response hours and the
  default deposit/cancellation policy keys.** The fee is a `FEE` price line shown on the proposal;
  whether it is added to the total or absorbed when the traveler books is the owner's pricing call.
  The deposit and cancellation keys are snapshotted into `ProposalVersion.terms` so a later manifest
  change cannot rewrite an accepted proposal.
- (b) Hard-code the board's € 140 and 21-day validity. Not tenant-agnostic.
- (c) No terms. The D-Proposal and the Booking board need them.

**D9. The proposal PDF**
- **(a) A nullable `ProposalVersion.pdfKey`, generated best-effort when the version is sent
  (recommended).** It stays behind `packages/storage` like package media and proofs; the email links to
  the account and the PDF. No `DocumentType` change, because `Document` is reservation-scoped.
- (b) Make `Document.reservationId` nullable and add `PROPOSAL` to `DocumentType`. Broader than M5 and
  better done with the Phase 6 document restyle.

**D10. Expiry, decline and revision notifications**
- A sent proposal emails the traveler; acceptance notifies the desk; a decline records the reason and
  notifies the desk. These use the existing mailer and audit log. They are Phase 6 work and do not
  change the M5 schema beyond the status fields below.

## 4. Deferred, not in M5

- Provider-level request/response tracking per proposal line (the "11 requests" step). M5 hands the
  accepted proposal to today's dispatch; a provider-request entity belongs with the disruption work
  (M8) or a later increment.
- Anonymous proposal sharing and a public link.
- Online payment of the planning fee. The board says the fee comes off the price when booking; no
  separate charge is modelled.
- Currencies other than the tenant's EUR base and FX locks.
- Structured editing of days/stops in the desk (the JSON document is edited as a whole).
- A proposal audit export for MINTUR/ONAT.

## 5. The proposed diff

```diff
--- a/packages/db/prisma/schema.prisma
+++ b/packages/db/prisma/schema.prisma (M5 draft)

+enum CustomRequestStatus {
+  OPEN        // waiting for the desk
+  CONVERTED   // a booking was created from an accepted proposal
+  CLOSED      // withdrawn, duplicated or past its retention
+}
+
+enum ProposalStatus {
+  DRAFT       // the desk is pricing it
+  SENT        // the traveler can review and accept until the version's validUntil
+  ACCEPTED    // an accepted version created a booking
+  DECLINED    // the traveler said no
+  EXPIRED     // derived on read from validUntil; stored only when a job closes it
+}
+
+enum ProposalLineKind {
+  TRANSPORT
+  LODGING
+  GUIDES
+  ACTIVITIES
+  MEALS
+  INSURANCE
+  FEE
+  OTHER
+}
+
+enum ProposalLineUnit {
+  PER_PERSON
+  PER_BOOKING
+  PER_NIGHT
+  PER_DAY
+  PER_GROUP
+}
+
+/// The Custom builder's request. It is not a booking and holds no price.
+model CustomRequest {
+  id        String              @id @default(uuid()) @db.Uuid
+  userId    String              @map("user_id") @db.Uuid
+  /// The visible reference (VX-C-XXXXXXXX), unique across requests and bookings.
+  reference String              @unique
+  status    CustomRequestStatus @default(OPEN)
+  locale    String?
+  /// The builder's answers, validated by the ProposalRequest schema.
+  payload   Json
+  notes     String?
+  createdAt DateTime            @default(now()) @map("created_at")
+  updatedAt DateTime            @updatedAt @map("updated_at")
+
+  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
+  proposals Proposal[]
+
+  @@index([userId, createdAt])
+  @@map("custom_requests")
+}
+
+/// The proposal thread: one reference, a current version, and its acceptance.
+model Proposal {
+  id                String         @id @default(uuid()) @db.Uuid
+  requestId         String         @map("request_id") @db.Uuid
+  status            ProposalStatus @default(DRAFT)
+  currentVersion    Int            @default(0) @map("current_version")
+  assignedToId      String?        @map("assigned_to_id") @db.Uuid
+  acceptedVersionId String?        @map("accepted_version_id") @db.Uuid
+  /// The booking this proposal created; one proposal creates at most one.
+  reservationId     String?        @unique @map("reservation_id") @db.Uuid
+  sentAt            DateTime?      @map("sent_at")
+  acceptedAt        DateTime?      @map("accepted_at")
+  declinedAt        DateTime?      @map("declined_at")
+  declineReason     String?        @map("decline_reason")
+  createdAt         DateTime       @default(now()) @map("created_at")
+  updatedAt         DateTime       @updatedAt @map("updated_at")
+
+  request         CustomRequest     @relation(fields: [requestId], references: [id], onDelete: Cascade)
+  assignedTo      User?             @relation("ProposalAssignedTo", fields: [assignedToId], references: [id], onDelete: SetNull)
+  acceptedVersion ProposalVersion?  @relation("ProposalAcceptedVersion", fields: [acceptedVersionId], references: [id], onDelete: SetNull)
+  reservation     Reservation?      @relation(fields: [reservationId], references: [id], onDelete: SetNull)
+  versions        ProposalVersion[] @relation("ProposalVersions")
+
+  @@index([status, createdAt])
+  @@index([requestId])
+  @@map("proposals")
+}
+
+/// One immutable priced version sent to the traveler.
+model ProposalVersion {
+  id           String   @id @default(uuid()) @db.Uuid
+  proposalId   String   @map("proposal_id") @db.Uuid
+  version      Int
+  currency     String   @default("EUR")
+  total        Decimal  @db.Decimal(10, 2)
+  perPerson    Decimal? @map("per_person") @db.Decimal(10, 2)
+  validUntil   DateTime @map("valid_until")
+  /// Route, stops, days, options and the "what happens next" copy; validated by ProposalDocument.
+  document     Json
+  /// The deposit/cancellation policy keys and the words shown, snapshotted.
+  terms        Json?
+  /// The generated D-Proposal PDF, behind packages/storage.
+  pdfKey       String?  @map("pdf_key")
+  createdById  String?  @map("created_by_id") @db.Uuid
+  createdAt    DateTime @default(now()) @map("created_at")
+
+  proposal   Proposal            @relation("ProposalVersions", fields: [proposalId], references: [id], onDelete: Cascade)
+  createdBy  User?               @relation("ProposalVersionCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)
+  priceLines ProposalPriceLine[]
+  acceptedIn Proposal?           @relation("ProposalAcceptedVersion")
+
+  @@unique([proposalId, version])
+  @@map("proposal_versions")
+}
+
+/// One money line of a version; copied 1:1 into ReservationPriceLine on acceptance.
+model ProposalPriceLine {
+  id           String           @id @default(uuid()) @db.Uuid
+  versionId    String           @map("version_id") @db.Uuid
+  kind         ProposalLineKind
+  unit         ProposalLineUnit @default(PER_BOOKING)
+  label        String
+  description  String?
+  quantity     Decimal          @default(1) @db.Decimal(6, 2)
+  unitAmount   Decimal          @map("unit_amount") @db.Decimal(10, 2)
+  amount       Decimal          @db.Decimal(10, 2)
+  currency     String           @default("EUR")
+  position     Int              @default(0)
+  /// Set when the line becomes a dispatchable ServiceItem on acceptance.
+  serviceType      ServiceType? @map("service_type")
+  province         String?
+  serviceDateStart DateTime?    @map("service_date_start") @db.Date
+  serviceDateEnd   DateTime?    @map("service_date_end") @db.Date
+  /// The catalog item chosen for the line, when there is one.
+  inventoryItemId String?       @map("inventory_item_id") @db.Uuid
+  createdAt    DateTime         @default(now()) @map("created_at")
+
+  version       ProposalVersion @relation(fields: [versionId], references: [id], onDelete: Cascade)
+  inventoryItem InventoryItem?  @relation(fields: [inventoryItemId], references: [id], onDelete: SetNull)
+
+  @@index([versionId, position])
+  @@map("proposal_price_lines")
+}
+
@@ model User (relations)
+  customRequests       CustomRequest[]
+  proposalsAssigned    Proposal[]        @relation("ProposalAssignedTo")
+  proposalVersionsMade ProposalVersion[] @relation("ProposalVersionCreatedBy")
+
@@ model Reservation (relations)
+  proposal Proposal?
+
@@ model InventoryItem (relations)
+  proposalLines ProposalPriceLine[]
```

The manifest (no migration; sample values to confirm, D8):

```json
"proposals": {
  "validityDays": 21,
  "responseHours": 4,
  "planningFee": 140,
  "defaultDepositPolicy": "standard",
  "defaultCancellationPolicy": "standard"
}
```

## 6. The path in words

1. The signed-in traveler completes the Custom builder. The API validates the payload, allocates a
   reference and writes `CustomRequest` + a `Proposal` in `DRAFT`. Nothing is priced or charged.
2. The desk opens the request, builds the route and days, adds `ProposalPriceLine`s and publishes
   version 1. `validUntil` is set from the manifest. The version is immutable.
3. Sending emails the traveler a magic link to `/account/proposals/<id>` and (Phase 6) the D-Proposal
   PDF. The proposal shows the version, route, days, price breakdown, per-person total, options and
   deposit terms.
4. The traveler asks for changes: the desk creates version 2; version 1 stays `SUPERSEDED` and cannot
   be accepted. Accepting an expired version is refused.
5. Acceptance records the version, time, IP/browser and actor, audits `proposal.accepted`, and creates
   the `Reservation` at `ITINERARY_SUBMITTED` in one transaction: the request's party data, the
   accepted price lines, `customItineraryPayload = { proposalId, proposalVersionId }`, and service
   items for bookable lines. The desk dispatches exactly as it does for any other booking.
6. The M4 flow takes over: securing the providers, the invoice, the deposit and the balance. The
   proposal itself never charges anything.

## 7. Owner decisions (2026-10-17)

1. **Acceptance creates a request to book**, not a confirmed trip. Acceptance creates a
   `Reservation` at `ITINERARY_SUBMITTED` with the accepted version's price lines and service items
   for the chosen catalog items; the desk dispatches next. Nothing is charged.
2. **Sign-in required.** The proposal page is `/account/proposals/<id>` behind the traveler's
   session; the email carries a magic link. The short reference is never a capability URL.
3. **Planning fee is transparency only.** The manifest value is snapshotted in
   `ProposalVersion.terms` and shown on the proposal, but it is not added to the amount due. No
   separate fee or credit line exists.
4. **Validity is 21 days** by manifest placeholder, and expiry is derived on read. Acceptance of an
   expired version is refused with a 409; no scheduled expiry job.
5. **Normalised price lines plus a validated JSON document.** Money is copied 1:1 into
   `ReservationPriceLine`; the route/days/options narrative is a `ProposalDocument` snapshot.
6. **Retention keeps the commercial skeleton.** Totals, dates, categories, price lines and the
   accepted-version metadata are kept; names, free-text notes, the request payload's personal
   content and the proposal PDF are redacted or removed on anonymization.

## 8. What landed, and what did not

Landed: the migration; the manifest `proposals` block; the pure `@ota/domain` proposal rules
(line amount, total, per-person, derived expiry, price-line mapping); `@ota/schemas` request,
document, version, acceptance and DTO schemas; the API (`POST /me/custom-requests`,
`GET /me/proposals`, `GET /me/proposals/:id`, `POST /me/proposals/:id/accept|decline`,
`GET /proposals`, `GET /proposals/:id`, `POST /proposals/:id/versions`); the branded proposal
email; the traveler proposal page and account list; the desk proposal queue and composer; the
retention scrub; the authorization matrix; a live-DB integration test; and the browser e2e flow
(request → desk prices → traveler accepts).

Not built in this increment:

- the full designed Custom builder (provinces, pace, interests, transport styles, per-stop stays,
  activities and guides). The existing builder still collects dates, party, catalog items and
  notes; the desk prices the rest.
- provider request/response tracking after acceptance (the board's "11 requests"); the desk uses
  today's dispatch.
- an anonymous proposal link, planning-fee charging, and a proposal audit export.

Landed after the first cut (2026-10-18, no migration):

- the D-Proposal PDF. Publishing a version renders it (`@ota/documents`, en/es/fr), stores it in
  object storage under `ProposalVersion.pdfKey` (`proposals/<id>/v<n>.pdf`) and attaches it to the
  proposal email, best-effort. The traveler reads it at `GET /me/proposals/:id/versions/:vid/pdf`
  (owner only) and the desk at `GET /proposals/:id/versions/:vid/pdf`; the version DTO carries
  `hasPdf`.
- structured editing of stops, days and options in the desk composer, seeded from the current
  version so a revision keeps them; the traveler's proposal page and the PDF show them. A day's
  date is counted from the trip's start, so the document's optional free-text `date` is not
  written by the composer.

The proposal reference is `VX-C-` plus the existing 8-character booking code, unique on
`CustomRequest.reference`.

The six questions answered above were the review gate; the original wording is in the git history.
