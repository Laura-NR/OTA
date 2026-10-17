# M2 Party and travelers: schema diff for review

**Status:** **Approved and generated 2026-10-15.** The owner took D1–D4 as recommended and the
migration `20261015010000_travelers` was applied (`328cf3c`): `ReservationTraveler` (passport as
AES-256-GCM ciphertext), `ReservationRoom`, `ReservationExtra`, `ReservationPriceLine`,
`Reservation.partySize/tierId/departureId` and `ServiceItem.travelerPrice`. Additive; no backfill.
**Surfaces landed 2026-10-16:** the booking pricing reducer and the passport cipher (`37b5c6e`),
the DTOs (`da24767`), the API routes with the audited passport vault (`482c7c7`), the invoice
amounts and price breakdown (`b392bbc`), the A-Booking travel party and price breakdown
(`ae4ef0b`) and the retention purge of traveler PII (`36ffba1`). **The storefront Booking form
landed 2026-10-17:** the traveler route `POST /me/reservations/package-booking` (`c531266`) prices
the same party with the shared M2 rules and freezes the lines, and the five-step form
(`e7afb49`) submits it.
**Date:** 2026-10-15
**Scope:** `docs/design-v1.1-plan.md` Phase 4, M2, read against the Booking, Account and
A-Booking boards (`design/vereda-v1.2/project/`).

## 1. What M2 covers

| Plan item | Where it lands in M2 |
|---|---|
| A traveler row per person (names, DOB, nationality, passport, emergency contact) | `ReservationTraveler` |
| Room set-up | `ReservationRoom` (+ `ReservationTraveler.roomId`) |
| Tier and departure the traveler chose | `Reservation.tierId`, `Reservation.departureId` |
| Extras chosen | `ReservationExtra` |
| Price lines | `ReservationPriceLine` |
| Per-service traveler price (closes the invoice gap and the "per-service-price" item) | `ServiceItem.travelerPrice` |
| Party size (closes the "party-size" item) | `Reservation.partySize` (the sum of travelers) |

Pricing at booking uses the M1 domain rules: `calculatePackagePrice` (departure/base + tier delta,
child bands from the manifest, single supplement, extras). The booking stores the **result** as
price lines so an invoice is reproducible even if the tier or departure later changes.

## 2. Data changes (this is why it is Article 2)

All new tables start empty and the new columns are additive/defaulted, so existing reservations
need no backfill beyond `partySize` defaulting to 1. The one sensitive column is the passport
number (decision D1).

## 3. Decisions (options and recommendation)

**D1. Passport-number encryption**
- **(a) Application-level AES-256-GCM with a key from `PASSPORT_ENCRYPTION_KEY` (recommended).**
  The API encrypts before write and decrypts only on the logged vault view. No new dependency
  (node:crypto), works with the current Postgres, and keeps the key out of the database. Rotation is
  a deploy with a re-encrypt step. Marked in the PII inventory (`docs/pii-at-rest-review.md`).
- (b) A managed KMS / Postgres column encryption (pgsodium). Stronger key custody but adds
  infrastructure and a dependency; defer until the legal review asks for it.
- (c) Store only the last four digits. Least risk, but a travel agency needs the full number to
  issue the Cuban tourist card; not workable alone.

**D2. Travelers storage**
- **(a) A `ReservationTraveler` row per person plus `ReservationRoom` and `ReservationPriceLine`
  tables (recommended).** Queryable (per-traveler documents, rooming lists, per-person price
  lines), and it is what M3 (OFAC per traveler) and the retention purge (scrub traveler PII) need.
- (b) Travelers as JSON on the reservation. Fewer tables, but no per-traveler query, no FK from
  price lines or OFAC records, and the retention purge cannot target a row.

**D3. Room set-up**
- **(a) `ReservationRoom` rows with `ReservationTraveler.roomId` (recommended).** A rooming list
  ("Double", "Twin", "Single") with its travelers, which the voucher already draws and the hotel
  confirms.
- (b) A free-text `roomSetup` note on the reservation. Simplest, but not structured for the
  voucher or the pricing of a single supplement.

**D4. Per-service traveler price**
- **(a) `ServiceItem.travelerPrice` nullable, alongside the price lines (recommended).** The
  invoice can finally itemise with amounts (today it lists services without unit prices), and the
  price lines hold the booking-level totals (base, tier, child, supplement, extras, fees).
- (b) Price lines only, leaving `ServiceItem` without an amount. The invoice would itemise from the
  lines instead, but per-service cost/margin on the booking would still be missing.

## 4. Deferred, not in M2

- OFAC affidavit per traveler and consent records (M3); deposit/balance instalments and refunds
  (M4); the proposal entity (M5).
- Traveler document uploads (passport images in the vault) — the booking stores the number; the
  vault images are a media increment like M1's package media.

## 5. What lands with M2 once approved

1. The migration, additive (new tables; `Reservation.partySize`, `tierId`, `departureId`;
   `ServiceItem.travelerPrice`).
2. `@ota/schemas`: the traveler, room, extra and price-line DTOs (passport number never in a list
   DTO; the vault view returns it decrypted and audited).
3. `@ota/domain`: a booking-side pricing reducer that turns the M1 `calculatePackagePrice` result
   into price lines, with tests.
4. API: `GET/PUT /reservations/:id/travelers` (+ rooms), `POST /reservations/:id/extras`,
   `GET /reservations/:id/price-lines`, and a logged `GET /reservations/:id/travelers/:id/passport`;
   each route in the authorization matrix.
5. The booking form (storefront) and the A-Booking travel party panel gain the traveler, room and
   child-band inputs; the invoice gains the per-service amounts; the retention purge scrubs the
   traveler PII.

## 6. The diff

```diff
--- a/packages/db/prisma/schema.prisma
+++ b/packages/db/prisma/schema.prisma (M2 draft)
@@ enum-ish additions
+enum TravelerKind {
+  ADULT
+  CHILD
+  INFANT
+}
+
+enum PriceLineKind {
+  BASE
+  TIER
+  CHILD
+  SINGLE_SUPPLEMENT
+  EXTRA
+  SERVICE
+  FEE
+}
@@ model Reservation (additions)
   totalAmount             Decimal           @map("total_amount") @db.Decimal(10, 2)
+  partySize               Int               @map("party_size") @default(1)
+  tierId                  String?           @map("tier_id") @db.Uuid
+  departureId             String?           @map("departure_id") @db.Uuid
   ...
   package     Package?        @relation(fields: [packageId], references: [id])
+  tier        PackageTier?     @relation(fields: [tierId], references: [id], onDelete: SetNull)
+  departure   PackageDeparture? @relation(fields: [departureId], references: [id], onDelete: SetNull)
   serviceItems ServiceItem[]
+  travelers    ReservationTraveler[]
+  rooms        ReservationRoom[]
+  extras       ReservationExtra[]
+  priceLines   ReservationPriceLine[]
@@ index additions
+  @@index([tierId])
+  @@index([departureId])
@@ model ServiceItem (addition)
   payoutRate      Decimal           @default(0) @map("payout_rate") @db.Decimal(10, 2)
+  // What the traveler pays for this service (closes the invoice gap); null until priced.
+  travelerPrice   Decimal?          @map("traveler_price") @db.Decimal(10, 2)
@@ new models
+// One traveler on a booking. `passportNumberEnc` is AES-256-GCM ciphertext
+// (decision D1); the plaintext is returned only by the logged vault route.
+model ReservationTraveler {
+  id                    String        @id @default(uuid()) @db.Uuid
+  reservationId         String        @map("reservation_id") @db.Uuid
+  roomId                String?       @map("room_id") @db.Uuid
+  position              Int           @default(0)
+  kind                  TravelerKind  @default(ADULT)
+  isLead                Boolean       @default(false) @map("is_lead")
+  fullName              String        @map("full_name")
+  dateOfBirth           DateTime?     @map("date_of_birth") @db.Date
+  nationality           String?
+  passportNumberEnc     String?       @map("passport_number_enc")
+  passportExpiresAt     DateTime?     @map("passport_expires_at") @db.Date
+  emergencyContactName  String?       @map("emergency_contact_name")
+  emergencyContactPhone String?       @map("emergency_contact_phone")
+  createdAt             DateTime      @default(now()) @map("created_at")
+  updatedAt             DateTime      @updatedAt @map("updated_at")
+
+  reservation Reservation           @relation(fields: [reservationId], references: [id], onDelete: Cascade)
+  room        ReservationRoom?      @relation(fields: [roomId], references: [id], onDelete: SetNull)
+  priceLines  ReservationPriceLine[]
+
+  @@index([reservationId])
+  @@index([roomId])
+  @@map("reservation_travelers")
+}
+
+// A room on the rooming list; position orders them on the voucher.
+model ReservationRoom {
+  id            String   @id @default(uuid()) @db.Uuid
+  reservationId String   @map("reservation_id") @db.Uuid
+  label         String
+  capacity      Int      @default(2)
+  position      Int      @default(0)
+  createdAt     DateTime @default(now()) @map("created_at")
+
+  reservation Reservation           @relation(fields: [reservationId], references: [id], onDelete: Cascade)
+  travelers   ReservationTraveler[]
+
+  @@index([reservationId])
+  @@map("reservation_rooms")
+}
+
+// An add-on chosen on the booking, priced from the package extra or manual.
+model ReservationExtra {
+  id             String      @id @default(uuid()) @db.Uuid
+  reservationId  String      @map("reservation_id") @db.Uuid
+  packageExtraId String?     @map("package_extra_id") @db.Uuid
+  label          String
+  unit           ExtraPriceUnit @default(PER_PERSON)
+  quantity       Int         @default(1)
+  unitAmount     Decimal     @map("unit_amount") @db.Decimal(10, 2)
+  amount         Decimal     @db.Decimal(10, 2)
+  currency       String      @default("EUR")
+  position       Int         @default(0)
+  createdAt      DateTime    @default(now()) @map("created_at")
+
+  reservation  Reservation   @relation(fields: [reservationId], references: [id], onDelete: Cascade)
+  packageExtra PackageExtra? @relation(fields: [packageExtraId], references: [id], onDelete: SetNull)
+
+  @@index([reservationId])
+  @@map("reservation_extras")
+}
+
+// A frozen price line: the reproducible invoice of what the traveler paid.
+model ReservationPriceLine {
+  id            String        @id @default(uuid()) @db.Uuid
+  reservationId String        @map("reservation_id") @db.Uuid
+  travelerId    String?       @map("traveler_id") @db.Uuid
+  kind          PriceLineKind
+  label         String
+  quantity      Decimal       @default(1) @db.Decimal(6, 2)
+  unitAmount    Decimal       @map("unit_amount") @db.Decimal(10, 2)
+  amount        Decimal       @db.Decimal(10, 2)
+  currency      String        @default("EUR")
+  position      Int           @default(0)
+  createdAt     DateTime      @default(now()) @map("created_at")
+
+  reservation Reservation          @relation(fields: [reservationId], references: [id], onDelete: Cascade)
+  traveler    ReservationTraveler? @relation(fields: [travelerId], references: [id], onDelete: SetNull)
+
+  @@index([reservationId])
+  @@map("reservation_price_lines")
+}
@@ PackageExtra relation
+  reservationExtras ReservationExtra[]
```
