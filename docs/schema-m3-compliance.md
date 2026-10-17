# M3 Compliance: schema diff for review

**Status:** **Approved and generated 2026-10-17.** The owner took D1–D6 as recommended and the
migration `20261017075012_compliance` was applied: `TravelerAffidavit`, `ConsentRecord`, their
enums, `ReservationTraveler.usPerson` and the append-only trigger, proven on live Postgres by
`apps/api/test/affidavits.integration.test.ts`. Additive; no backfill. The trigger also lets the
recording user's link (`recorded_by_id`) turn null, a fourth `ON DELETE SET NULL` the draft
missed. The surfaces in §5 follow.
**Date:** 2026-10-16
**Scope:** `docs/design-v1.1-plan.md` Phase 4, M3: the OFAC affidavit (category, signature,
IP, timestamp; 5-year retention, reconciled with the retention purge) and consent records
with text-version ids. Read against the Booking (step 4), A-Booking, A-Customers,
A-Dashboard, A-Settings, Legal, E-OFAC, E-Retention, T-Forms and T-Events boards
(`design/vereda-v1.2/project/`). It builds on M2 (`ReservationTraveler`).

## 1. What M3 covers

| Plan item / board | Where it lands in M3 |
|---|---|
| OFAC travel-category certification per US traveler (Booking step 4, DS-Actions-Forms) | `TravelerAffidavit` |
| Category, typed signature, timestamp, IP (T-Forms `ofac_affidavit.signature`) | `TravelerAffidavit.category`, `signature`, `signedAt`, `ipAddress` |
| "Payment stays locked until this is complete" (Booking), "vouchers will not generate until the affidavit is on file" (A-Dashboard) | a pure gate in `@ota/domain`, enforced by the payment-link and document routes |
| "Upload signed affidavit", "View affidavit (logged)", "Send certification reminder" (A-Customers) | `TravelerAffidavit.source = PAPER` + `documentKey`; an audited read route; the reminder is Phase 6 (E-OFAC) |
| "OFAC records · sealed store · 5 years · export on legal request only" (A-Settings) | append-only rows, `retainUntil`, a Super Admin export |
| Who is a US person (T-Forms: "United States reveals the OFAC block for that traveler") | `ReservationTraveler.nationality` plus an optional `usPerson` override (D3) |
| Consent with timestamp and policy version (Legal, DS-Cards-Content, T-Forms `consent_required`) | `ConsentRecord` |
| "consent v2.3 · IP country CA" on the booking (A-Booking) | `ConsentRecord.reservationId`, `textVersion`, `ipCountry` |
| Consent log on the profile (A-Customers: cookies, marketing, terms, region) | `ConsentRecord` read by purpose |
| "Invoices and OFAC certifications are kept for the legal period" (Account, Legal, E-Retention) | the purge leaves affidavits alone; a separate sweep deletes them at `retainUntil` (D6) |

## 2. Data changes (this is why it is Article 2)

Two new tables, three enums and one nullable column on `ReservationTraveler`. Everything is
additive and starts empty; nothing is backfilled. Existing bookings with US travelers have no
affidavit, so once the gate (D3) is on, their payment links and vouchers wait for one. The dev
database has no US traveler today.

New personal data: the affidavit's signer name, typed signature, IP address and user agent;
the consent log's user or visitor id and IP country. Both go into `docs/pii-at-rest-review.md`.

## 3. Decisions (options and recommendation)

**D1. Where the affidavit lives**
- **(a) A `TravelerAffidavit` row per US traveler and booking, holding its own snapshot (signer
  name, nationality, booking code, travel dates, statement version and hash) (recommended).**
  The retention purge scrubs `ReservationTraveler` (M2) but must keep the certification for five
  years; a snapshot lets it survive the scrub without keeping the traveler row alive. It is
  append-only: a correction is a new row that supersedes the old one (`supersedesId`), so no
  route ever updates or deletes a certification before `retainUntil`.
- (b) Columns on `ReservationTraveler`. Fewer tables, but the M2 purge would have to skip those
  columns, a correction would overwrite the evidence, and a paper scan has nowhere to go.
- (c) Only the signed PDF in object storage. The evidence is a document, but the gate, the
  dashboard alert and the "Missing OFAC" view would have to open files to know the state.

**D2. What "sealed" means**
- **(a) Append-only by construction, in Postgres (recommended):** no update or delete route; a
  `BEFORE UPDATE` trigger written into the migration refuses any change to a row; the only
  delete is the retention sweep after `retainUntil`. Reads of a full record (signature, IP) are
  audited like the passport vault, and the export is Super Admin only.
- (b) (a) plus WORM object storage (S3 Object Lock) for the signed PDFs. Stronger, but MinIO and
  the production bucket need object-lock configuration; defer until a hosting decision.
- (c) Application convention only, no trigger. Simplest, but a future bug or script can rewrite
  evidence silently.

**D3. Who must certify, and what the gate blocks**
- **(a) A traveler is a US person when `usPerson` is true, or when it is null and the nationality
  is `US`; each such traveler needs a current affidavit before a payment link is created (ops
  and traveler routes, 409) and before vouchers and work orders are generated (recommended).**
  The override covers US residents travelling on another passport, which Legal names
  ("US citizen or resident, or travelling on a US passport"); the desk sets it.
- (b) Nationality only. No new column, but a US resident with a Canadian passport is missed.
- (c) Warn only, never block. The board draws a hard gate ("Payment stays locked"); a warning
  would let a payment clear without the record OFAC asks for.

**D4. Consent records and text versions**
- **(a) One append-only `ConsentRecord` log: subject (user, or a random visitor id from the
  consent cookie before sign-in), purpose, granted or withdrawn, the text version id, the
  source (booking, account, cookie banner, payment, custom request) and, when the booking
  carries it, the reservation (recommended).** A withdrawal is a new row with `granted = false`;
  the current state per purpose is the latest row. The version id is declared by the tenant
  content that holds the text (`content.legal.<text>.version`, e.g. `privacy@2026-10-14`), so
  the text's history is the tenant repo's git history and no text table is needed; a SHA-256
  of the rendered text is stored too, to prove which words were shown.
- (b) Flags on `User` and `Reservation` (`termsVersion`, `marketingOptIn`). No table, but no
  history: GDPR art. 7(1) asks the controller to demonstrate consent, and a withdrawal would
  erase the grant.
- (c) (a) with a `LegalTextVersion` table holding each text's full body. Self-contained proof,
  but it duplicates the tenant content and needs an editor (A-Content, M7).

**D5. IP data**
- **(a) The full IP and user agent on the affidavit only (the board asks for "timestamp and IP
  stored 5 years"); the consent log keeps the country, and only once a geo-IP source exists
  (recommended).** A geo-IP database (e.g. MaxMind GeoLite2) is a new dependency with its own
  licence, so `ipCountry` stays null until that is approved.
- (b) The full IP on every consent row. More evidence, more personal data to purge.
- (c) A keyed hash of the IP. Proves "same address" but not "which address", which is what the
  OFAC record is for.

**D6. Reconciling the five years with the retention purge (spec §3.5, ADR 0004)**
- **(a) The purge leaves `TravelerAffidavit` rows untouched (their snapshot is independent of the
  scrubbed traveler); a daily sweep deletes rows, and their PDFs, once `retainUntil` passes.
  `retainUntil` is the trip's end plus five years (31 CFR 501.601 counts from the date of the
  transaction; the end of travel is the later, safer date). On anonymization, the consent log
  keeps its rows but drops the user and visitor ids and the IP country, so only anonymous,
  versioned counts remain (recommended).**
- (b) `retainUntil` = signing plus five years. Simpler, but shorter than the trip-based count for
  a booking signed months ahead.
- (c) Keep the consent rows identified until a limitation period (counsel to name it) instead of
  anonymizing them with the account.

## 4. Deferred, not in M3

- The E-OFAC reminder email and SMS, and the retention notice wording (Phase 6).
- The storefront Booking form's step 4. Until the Booking screen exists, a traveler signs from the
  account booking page (`/account/reservations/[id]`) before "Proceed to payment".
- The cookie banner itself (Phase 8, T-Events); M3 only stores what it sends.
- The Cuba Restricted List and "no GAESA or Gaviota properties" check on catalog items (a catalog
  flag, asked for with the supplier/inventory work).
- Geo-IP for `ipCountry` (D5, a dependency question).
- PII purge Tiers 2–3 (`docs/pii-at-rest-review.md`).

## 5. What lands with M3 once approved

1. The migration, additive, with the hand-written `BEFORE UPDATE` trigger on
   `traveler_affidavits` (D2).
2. `@ota/domain`, pure and tested: `isUsPerson`, `signatureMatches` (the typed name equals the
   traveler's full name, case-insensitive with accents folded, as T-Forms specifies),
   `affidavitRetainUntil`, `ofacGate` (which travelers still need a current affidavit), and
   `currentConsent` (the latest row per purpose, and whether a newer text version needs a fresh
   consent).
3. `@ota/schemas`: affidavit and consent DTOs; list DTOs carry the status, category and dates,
   never the IP, user agent or signature.
4. API, every route in the authorization matrix:
   - `POST /me/reservations/:id/travelers/:travelerId/affidavit` (the owner signs online; IP and
     user agent from the request, `TRUST_PROXY` respected);
   - `POST /reservations/:id/travelers/:travelerId/affidavit` (the desk records a paper affidavit
     with its scan, stored behind `packages/storage`);
   - `GET /reservations/:id/affidavits` (status per traveler) and `GET /affidavits/:id` (the full
     record, audited); `GET /affidavits/export?from&to` (Super Admin, audited);
   - the gate on `POST /reservations/:id/payments`, `POST /me/reservations/:id/payments` and
     document generation (D3);
   - `POST /me/consents`, `POST /consents` (public, rate-limited, visitor id only) and
     `GET /customers/:id/consents`.
5. Retention: the affidavit sweep (BullMQ daily, same pattern as the retention lifecycle) and the
   consent-log anonymization (D6).
6. Surfaces: the OFAC row and paper upload on A-Booking; the OFAC certification and consent log on
   A-Customers; the "OFAC certification missing" alert on A-Dashboard and a "Missing OFAC" saved
   view on A-Bookings; the signing step on the account booking page; version ids on the Legal
   texts in tenant content.

**Questions for counsel (they do not block the schema):** the certification statement and the
category wording; whether a minor's certification is signed by the lead traveler; whether the
five-year record keeping binds a non-US company (the boards keep five years regardless); the
cookie banner texts and the limitation period in D6(c).

## 6. The diff

```diff
--- a/packages/db/prisma/schema.prisma
+++ b/packages/db/prisma/schema.prisma (M3 draft)
@@ enum additions
+// The twelve general-licence categories of 31 CFR 515.560(a) (counsel to confirm the wording).
+enum OfacCategory {
+  FAMILY_VISITS                  // 515.561
+  OFFICIAL_GOVERNMENT_BUSINESS   // 515.562
+  JOURNALISTIC_ACTIVITY          // 515.563
+  PROFESSIONAL_RESEARCH          // 515.564
+  EDUCATIONAL_ACTIVITIES         // 515.565
+  RELIGIOUS_ACTIVITIES           // 515.566
+  PUBLIC_PERFORMANCES            // 515.567
+  SUPPORT_FOR_THE_CUBAN_PEOPLE   // 515.574
+  HUMANITARIAN_PROJECTS          // 515.575
+  PRIVATE_FOUNDATIONS_RESEARCH   // 515.576
+  INFORMATIONAL_MATERIALS        // 515.545
+  AUTHORIZED_EXPORT_TRANSACTIONS // 515.533, 515.559
+}
+
+enum AffidavitSource {
+  ONLINE
+  PAPER
+}
+
+enum ConsentPurpose {
+  TERMS
+  PRIVACY_NOTICE
+  CANCELLATION_POLICY
+  INSURANCE_ACKNOWLEDGEMENT
+  PAYMENT_TERMS
+  MARKETING_EMAIL
+  TRIP_MESSAGES        // pre-departure briefing and daily WhatsApp check-ins
+  COOKIES_ANALYTICS
+  COOKIES_MARKETING
+}
+
+enum ConsentSource {
+  BOOKING
+  ACCOUNT
+  COOKIE_BANNER
+  PAYMENT
+  CUSTOM_REQUEST
+  DESK
+}
@@ model ReservationTraveler (addition)
   nationality           String?      
+  // M3 D3: null derives US-person status from nationality; the desk sets it for
+  // US residents on another passport.
+  usPerson              Boolean?     @map("us_person")
   ...
+  affidavits            TravelerAffidavit[]
@@ model Reservation (additions)
+  affidavits   TravelerAffidavit[]
+  consents     ConsentRecord[]
@@ model User (addition)
+  consents     ConsentRecord[]
@@ new models
+// One US person's travel-category certification for one booking (M3, D1). It
+// snapshots who signed for what, so it outlives the traveler purge (D6), and is
+// append-only (D2): a correction is a new row that supersedes this one.
+model TravelerAffidavit {
+  id                String          @id @default(uuid()) @db.Uuid
+  reservationId     String?         @map("reservation_id") @db.Uuid
+  travelerId        String?         @map("traveler_id") @db.Uuid
+  supersedesId      String?         @unique @map("supersedes_id") @db.Uuid
+  category          OfacCategory
+  signerName        String          @map("signer_name")
+  signerNationality String?         @map("signer_nationality")
+  bookingCode       String          @map("booking_code")
+  travelStart       DateTime        @map("travel_start") @db.Date
+  travelEnd         DateTime        @map("travel_end") @db.Date
+  statementVersion  String          @map("statement_version")
+  statementHash     String          @map("statement_hash")
+  // The typed name (ONLINE) or the name on the scanned form (PAPER).
+  signature         String
+  source            AffidavitSource @default(ONLINE)
+  // The signed PDF or the scan, behind packages/storage.
+  documentKey       String?         @map("document_key")
+  ipAddress         String?         @map("ip_address")
+  userAgent         String?         @map("user_agent")
+  recordedById      String?         @map("recorded_by_id") @db.Uuid
+  signedAt          DateTime        @map("signed_at")
+  // travelEnd + 5 years (D6); the sweep deletes the row and its document after it.
+  retainUntil       DateTime        @map("retain_until")
+  createdAt         DateTime        @default(now()) @map("created_at")
+
+  reservation  Reservation?         @relation(fields: [reservationId], references: [id], onDelete: SetNull)
+  traveler     ReservationTraveler? @relation(fields: [travelerId], references: [id], onDelete: SetNull)
+  recordedBy   User?                @relation("AffidavitRecordedBy", fields: [recordedById], references: [id], onDelete: SetNull)
+  supersedes   TravelerAffidavit?   @relation("AffidavitSupersedes", fields: [supersedesId], references: [id], onDelete: SetNull)
+  supersededBy TravelerAffidavit?   @relation("AffidavitSupersedes")
+
+  @@index([reservationId])
+  @@index([travelerId])
+  @@index([retainUntil])
+  @@map("traveler_affidavits")
+}
+
+// Append-only consent log (M3, D4): the latest row per subject and purpose is
+// the current state; a withdrawal is a new row with granted = false.
+model ConsentRecord {
+  id            String         @id @default(uuid()) @db.Uuid
+  userId        String?        @map("user_id") @db.Uuid
+  // A random id from the consent cookie, before the visitor signs in.
+  visitorId     String?        @map("visitor_id")
+  reservationId String?        @map("reservation_id") @db.Uuid
+  purpose       ConsentPurpose
+  granted       Boolean
+  // Declared by the tenant content that holds the text, e.g. "privacy@2026-10-14".
+  textVersion   String         @map("text_version")
+  textHash      String?        @map("text_hash")
+  source        ConsentSource
+  locale        String?
+  // Which banner variant applied: "EU", "UK", "US-CA", …
+  region        String?
+  // Null until a geo-IP source is approved (D5).
+  ipCountry     String?        @map("ip_country")
+  createdAt     DateTime       @default(now()) @map("created_at")
+
+  user        User?        @relation(fields: [userId], references: [id], onDelete: SetNull)
+  reservation Reservation? @relation(fields: [reservationId], references: [id], onDelete: SetNull)
+
+  @@index([userId, purpose, createdAt])
+  @@index([visitorId])
+  @@index([reservationId])
+  @@map("consent_records")
+}
@@ User relation for the desk that records a paper affidavit
+  affidavitsRecorded TravelerAffidavit[] @relation("AffidavitRecordedBy")
```

The hand-written part of the migration (D2a). A foreign key's `ON DELETE SET NULL` is performed
as an `UPDATE` of the row, so the trigger lets exactly that through: a change where only the
booking, traveler, superseded-affidavit or recording-user link turns null (the sweep deleting an
old affidavit nulls the newer row's `supersedes_id`). Every other change is refused.

```sql
CREATE FUNCTION traveler_affidavits_append_only() RETURNS trigger AS $$
DECLARE
  links CONSTANT text[] := ARRAY['reservation_id', 'traveler_id', 'supersedes_id', 'recorded_by_id'];
BEGIN
  IF (to_jsonb(NEW) - links) = (to_jsonb(OLD) - links)
     AND (NEW.reservation_id IS NULL OR NEW.reservation_id = OLD.reservation_id)
     AND (NEW.traveler_id IS NULL OR NEW.traveler_id = OLD.traveler_id)
     AND (NEW.supersedes_id IS NULL OR NEW.supersedes_id = OLD.supersedes_id)
     AND (NEW.recorded_by_id IS NULL OR NEW.recorded_by_id = OLD.recorded_by_id) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'traveler_affidavits is append-only; record a superseding affidavit instead';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER traveler_affidavits_no_update
  BEFORE UPDATE ON traveler_affidavits
  FOR EACH ROW EXECUTE FUNCTION traveler_affidavits_append_only();
```

The migration lands with a live-DB test of both paths: a field change is refused, and deleting a
booking, a traveler or a superseded affidavit clears the link.
