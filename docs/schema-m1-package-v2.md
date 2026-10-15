# M1 Package v2: schema diff for review

**Status:** **Approved and generated 2026-10-15.** The owner took D1–D4 as recommended and the
migration `20261015000000_package_v2` was applied (with the hand-written backfill); commit
`3a6f9ce`. Landed: the schema, the `PackageStatus` lifecycle replacing `active`, the M1 package
read model (`PackageDto` days/tiers/departures/extras/media/translations + the new fields), pricing
v2 and the publish checks in `@ota/domain`, the storefront Package page showing tiers, departures,
extras and the day texts, and the ops write path (`86b76c4`: `create`/`update` replace the
collections; `PUT /packages/:id/translations/:locale`; a slug change leaves a redirect the public
`getBySlug` follows), the A-Package-Edit editor UI (`91a0dbb`), the per-locale overlay and
retired-slug 308 (`12ab551`), and package media storage and serving (`aa07096`). **M1 is complete**
except the editor's media/locale tabs. `docs/schema-m2-travelers.md` is the M2 draft for review.
**Date:** 2026-10-14
**Scope:** `docs/design-v1.1-plan.md` Phase 4, M1, read against the Package, Booking and
A-Package-Edit boards (`design/vereda-v1.2/project/`).

## 1. What M1 covers, and what it leaves to M2

M1 is the **catalog side** of a package: what a package offers and how it is priced. The
**booking side** (the departure, tier and extras a traveler chose, the travelers, price lines and
places taken) is M2, as the plan already says. So M1 changes no reservation column and needs no
reservation backfill.

| Plan item | Where it lands in M1 |
|---|---|
| Departures (date, seats, price) | `PackageDeparture`: start date, capacity, optional price, status |
| Accommodation tiers with deltas | `PackageTier`: per-person `priceDelta`, `singleSupplement`; `PackageService.tierId` closes the open tier item |
| Extras | `PackageExtra`: price per person or per booking, optional catalog item for dispatch |
| Insurance plans | Agency-wide, so in the manifest, not per package (decision D4) |
| Booking model, group size, lead time | `Package.bookingModel`, `groupMin`/`groupMax`, `leadTimeDays` |
| Tax classification | `Package.tourismCategory`, the existing enum; copied onto the reservation at booking |
| Cancellation and deposit policy references | `Package.cancellationPolicy` / `depositPolicy`: keys into the manifest (D4) |
| Included / excluded, Cuba notes, SEO | `Package.included`, `excluded`, `cubaNotes`, `seoTitle`, `seoDescription` |
| Per-locale fields | Source text on the base rows plus a `PackageTranslation` overlay per locale (D1) |
| Media with alt text and consent | `PackageMedia`: required alt text, `showsPeople` + `consentReference` |
| Publish status | `PackageStatus` replaces `active` (D3) |
| Slug redirects | `PackageSlugRedirect` |

The editor and package boards also draw these, which M1 also covers: the itinerary days' words
(`PackageDay`), themes, difficulty and accessibility (the storefront filters and the Package page
use them), and the card summary.

## 2. Data changes (this is why it is Article 2)

Everything is additive with defaults, and the new tables start empty, except one step that
changes existing rows:

```sql
-- hand-written into the migration, between adding status and dropping active
UPDATE packages
   SET status = CASE WHEN active THEN 'PUBLISHED'::"PackageStatus" ELSE 'DRAFT'::"PackageStatus" END,
       published_at = CASE WHEN active THEN updated_at END;
ALTER TABLE packages DROP COLUMN active;
```

The dev database has one package (`trinidad-heritage-trail`, active), which becomes PUBLISHED.
The seed then gains tiers, two departures, an extra and the day texts, so the storefront has
something to draw.

**Contract impact.** `PackageDto.active` becomes `status` (plus `publishedAt`). The only consumers
are the storefront and back-office in this repo, so this is not an external breaking change. The
public catalog filters on `status = PUBLISHED` instead of `active = true`. `POST /packages` creates
a DRAFT instead of a live package (D3).

## 3. Decisions (options and recommendation)

**D1. Per-locale text**
- **(a) Source text on the base rows + one `PackageTranslation` row per locale (recommended).**
  The row overlays any field. Nested words are JSON keyed by stable keys (days by `dayOffset`,
  tiers and extras by `code`, media by id) and validated in `@ota/schemas`. Each locale has its
  own `published` flag and a `sourceUpdatedAt`, which gives the editor's "ES in sync · FR
  outdated · DE not yet" directly. This follows the repo's existing pattern: tenant messages
  overlay the core catalog. Existing readers of `name`/`description` keep working.
- (b) A translation table per entity (package, day, tier, extra, media): six tables. It gives DB
  constraints on every word, but six joins per page.
- (c) A locale map in each column (`name Json`): no new table, but no per-locale review state,
  and every reader must unpack the maps.

**D2. Prices**
- **(a) Package base + tier delta + optional departure price (recommended).** Per person: (the
  departure price, else `basePrice`) + the tier's `priceDelta`. The Package board's season factor
  moves every tier together, which this reproduces. The season label is derived. The editor's
  "was 1,395 → 1,420 from 1 Dec" is a departure price change.
- (b) A tier × season grid with a `PackageSeason` table (the editor's Pricing table, absolute
  prices). It is closer to that one table, but it is a second pricing source next to departures.
- (c) An absolute price per departure × tier: the most rows, and the most room for mistakes.

**D3. Publish model**
- **(a) `status` replaces `active`, backfilled as above; new packages start as DRAFT
  (recommended).** The statuses are DRAFT, IN_REVIEW, PUBLISHED and ARCHIVED. The publish checks
  (alt text, consent for people, INSTANT locked, policy keys exist) run on the move to PUBLISHED.
- (b) Add `status` and keep `active`: two sources of truth for the same fact.
- (c) Immutable versions, as A-Package-Edit draws (v3.2 live, v3.3 draft, roll back, bookings
  locked to a version). Every field moves to a version table. It is large, and M2's price lines
  already freeze what each traveler booked. It is deferred until the editor (Phase 5, item 6)
  shows the need.

**D4. Agency-wide terms** (cancellation scale, deposit plans, child ages and rate, insurance plans)
- **(a) In the tenant manifest, with the words in tenant content; a package stores only policy
  keys (recommended).** These are the agency's terms, not one package's, and the repo already keeps
  the bank details and emergency contacts there. No table is needed, and M4 makes the deposit
  schedule executable. Changing a term is a deploy, which suits terms that counsel signs off.
- (b) Tables, editable in the admin. This needs A-Settings (M9) and an approval trail first.

## 4. Deferred, not in M1

These are drawn on A-Package-Edit but are not in the plan's M1 list:
- versions and approvals (D3c); scheduled publishing;
- promo codes, blackout dates and the group discount (pricing v2 rules, asked for when built);
- the package type (single base, circuit, short break, event); events wait for M10;
- the low-bandwidth image variant, which needs an image library (a dependency question);
- supplier net rates and the margin check (they need cost data per component).

## 5. What lands with M1 once approved

1. The migration (`prisma migrate dev --name package_v2`), with the hand-written backfill above.
2. `@ota/schemas`: the package DTOs and the translation JSON schemas.
3. `@ota/domain`: pricing v2 for packages (departure, tier, child band, single supplement,
   extras) and the publish checks, as pure functions with tests.
4. API: the public catalog reads the published status, translations and slug redirects (308);
   the ops endpoints for tiers, departures, extras, days, media and translations; each route goes
   into `authorization.e2e.test.ts`.
5. The storefront Package page shows tiers, departures and extras (hidden until now). The admin
   editor fields come with Phase 5 item 6; until then the seed and the API supply the data.

## 6. The diff

```diff
--- a/packages/db/prisma/schema.prisma
+++ b/packages/db/prisma/schema.prisma (M1 draft)
@@ -137,6 +137,34 @@
   OPERATIONS
 }
 
+// Publish lifecycle of a curated package. Only PUBLISHED shows on the public
+// catalog; ARCHIVED keeps the row for the bookings that reference it.
+enum PackageStatus {
+  DRAFT
+  IN_REVIEW
+  PUBLISHED
+  ARCHIVED
+}
+
+// REQUEST: hosts confirm within the tenant's response window. INSTANT needs
+// every component allotment-backed; nothing is today, so the publish check
+// refuses INSTANT until allotments exist (A-Package-Edit draws it locked).
+enum BookingModel {
+  REQUEST
+  INSTANT
+}
+
+enum DepartureStatus {
+  OPEN
+  CLOSED
+  CANCELLED
+}
+
+enum ExtraPriceUnit {
+  PER_PERSON
+  PER_BOOKING
+}
+
 model User {
   id            String   @id @default(uuid()) @db.Uuid
   email         String   @unique
@@ -304,6 +332,7 @@
   pricingRules    PricingRule[]
   media           InventoryMedia[]
   packageServices PackageService[]
+  packageExtras   PackageExtra[]
 
   @@index([type])
   @@index([province])
@@ -319,19 +348,56 @@
   name        String
   slug        String   @unique
   description String?
+  // Card text (A-Package-Edit: 160–220 characters).
+  summary     String?
   province    String?
   durationDays Int     @map("duration_days")
   currency    String   @default("EUR")
+  // Per person, before the tier delta, for a date with no departure price.
   basePrice   Decimal  @map("base_price") @db.Decimal(10, 2)
-  active      Boolean  @default(true)
+  status      PackageStatus @default(DRAFT)
+  publishedAt DateTime?     @map("published_at")
+  // Locale of the text on this row and on its days, tiers, extras and media;
+  // PackageTranslation overlays the other locales.
+  sourceLocale     String   @default("en") @map("source_locale")
+  // Set by the API when source text changes; a translation made from an
+  // older value is outdated.
+  contentUpdatedAt DateTime @default(now()) @map("content_updated_at")
+  bookingModel     BookingModel    @default(REQUEST) @map("booking_model")
+  // Departs with groupMin travelers; null bounds mean no limit.
+  groupMin         Int?            @map("group_min")
+  groupMax         Int?            @map("group_max")
+  leadTimeDays     Int             @default(2) @map("lead_time_days")
+  // Copied onto the reservation when a traveler books this package.
+  tourismCategory  TourismCategory @default(GENERAL) @map("tourism_category")
+  // Tenant theme keys, the same vocabulary as tenant/destinations.json.
+  themes           String[]        @default([])
+  // 1 (gentle) to 5 (demanding).
+  difficulty       Int?
+  accessibility    String[]        @default([])
+  // Keys into the manifest's policies; null is the tenant default.
+  cancellationPolicy String?       @map("cancellation_policy")
+  depositPolicy      String?       @map("deposit_policy")
+  included         String[]        @default([])
+  excluded         String[]        @default([])
+  cubaNotes        String?         @map("cuba_notes")
+  seoTitle         String?         @map("seo_title")
+  seoDescription   String?         @map("seo_description")
   attributes  Json?
   createdAt   DateTime @default(now()) @map("created_at")
   updatedAt   DateTime @updatedAt @map("updated_at")
 
-  services     PackageService[]
-  reservations Reservation[]
+  services      PackageService[]
+  reservations  Reservation[]
+  days          PackageDay[]
+  tiers         PackageTier[]
+  departures    PackageDeparture[]
+  extras        PackageExtra[]
+  media         PackageMedia[]
+  translations  PackageTranslation[]
+  slugRedirects PackageSlugRedirect[]
 
-  @@index([active])
+  @@index([status])
   @@index([province])
   @@map("packages")
 }
@@ -342,17 +408,171 @@
   id              String   @id @default(uuid()) @db.Uuid
   packageId       String   @map("package_id") @db.Uuid
   inventoryItemId String   @map("inventory_item_id") @db.Uuid
+  // Null: every tier books this service. Set: only that tier (its casa).
+  tierId          String?  @map("tier_id") @db.Uuid
   dayOffset       Int      @default(0) @map("day_offset")
   position        Int      @default(0)
   createdAt       DateTime @default(now()) @map("created_at")
 
   package       Package       @relation(fields: [packageId], references: [id], onDelete: Cascade)
   inventoryItem InventoryItem @relation(fields: [inventoryItemId], references: [id])
+  tier          PackageTier?  @relation(fields: [tierId], references: [id], onDelete: Cascade)
 
   @@index([packageId])
+  @@index([tierId])
   @@map("package_services")
 }
 
+// The words for one itinerary day. The services the day uses stay in
+// PackageService, keyed by the same dayOffset.
+model PackageDay {
+  id        String  @id @default(uuid()) @db.Uuid
+  packageId String  @map("package_id") @db.Uuid
+  dayOffset Int     @map("day_offset")
+  title     String
+  body      String?
+  meals     String?
+
+  package Package @relation(fields: [packageId], references: [id], onDelete: Cascade)
+
+  @@unique([packageId, dayOffset])
+  @@map("package_days")
+}
+
+// An accommodation tier: it changes the stays, never the route. Its price is
+// a delta over the departure price, so a season moves every tier together.
+model PackageTier {
+  id               String   @id @default(uuid()) @db.Uuid
+  packageId        String   @map("package_id") @db.Uuid
+  code             String
+  name             String
+  description      String?
+  position         Int      @default(0)
+  priceDelta       Decimal  @default(0) @map("price_delta") @db.Decimal(10, 2)
+  singleSupplement Decimal? @map("single_supplement") @db.Decimal(10, 2)
+  isDefault        Boolean  @default(false) @map("is_default")
+  createdAt        DateTime @default(now()) @map("created_at")
+  updatedAt        DateTime @updatedAt @map("updated_at")
+
+  package  Package          @relation(fields: [packageId], references: [id], onDelete: Cascade)
+  services PackageService[]
+
+  @@unique([packageId, code])
+  @@map("package_tiers")
+}
+
+// A fixed departure. It ends on startDate + durationDays - 1. Places left are
+// capacity minus the travelers booked on it, which M2 records.
+model PackageDeparture {
+  id        String          @id @default(uuid()) @db.Uuid
+  packageId String          @map("package_id") @db.Uuid
+  startDate DateTime        @map("start_date") @db.Date
+  capacity  Int
+  // Per person, before the tier delta; null is Package.basePrice. The season
+  // label ("High · +25 %") is derived from the difference.
+  price     Decimal?        @db.Decimal(10, 2)
+  status    DepartureStatus @default(OPEN)
+  createdAt DateTime        @default(now()) @map("created_at")
+  updatedAt DateTime        @updatedAt @map("updated_at")
+
+  package Package @relation(fields: [packageId], references: [id], onDelete: Cascade)
+
+  @@unique([packageId, startDate])
+  @@index([startDate])
+  @@map("package_departures")
+}
+
+// An optional add-on (an activity, an extra night). When it is linked to a
+// catalog item it is dispatched like any service.
+model PackageExtra {
+  id              String         @id @default(uuid()) @db.Uuid
+  packageId       String         @map("package_id") @db.Uuid
+  code            String
+  name            String
+  description     String?
+  durationLabel   String?        @map("duration_label")
+  inventoryItemId String?        @map("inventory_item_id") @db.Uuid
+  dayOffset       Int?           @map("day_offset")
+  price           Decimal        @db.Decimal(10, 2)
+  priceUnit       ExtraPriceUnit @default(PER_PERSON) @map("price_unit")
+  position        Int            @default(0)
+  active          Boolean        @default(true)
+  createdAt       DateTime       @default(now()) @map("created_at")
+  updatedAt       DateTime       @updatedAt @map("updated_at")
+
+  package       Package        @relation(fields: [packageId], references: [id], onDelete: Cascade)
+  inventoryItem InventoryItem? @relation(fields: [inventoryItemId], references: [id])
+
+  @@unique([packageId, code])
+  @@map("package_extras")
+}
+
+// Package photos; position 0 is the hero. The binary is in object storage
+// (packages/<packageId>/<uuid>.<ext>) and the content type comes from the key,
+// as for InventoryMedia. A photo that shows people needs a consent reference
+// before the package can publish.
+model PackageMedia {
+  id               String   @id @default(uuid()) @db.Uuid
+  packageId        String   @map("package_id") @db.Uuid
+  storageKey       String   @map("storage_key")
+  altText          String   @map("alt_text")
+  position         Int      @default(0)
+  showsPeople      Boolean  @default(false) @map("shows_people")
+  consentReference String?  @map("consent_reference")
+  createdAt        DateTime @default(now()) @map("created_at")
+
+  package Package @relation(fields: [packageId], references: [id], onDelete: Cascade)
+
+  @@index([packageId])
+  @@map("package_media")
+}
+
+// One locale's overlay of a package's words; anything missing falls back to
+// the source locale. Nested words are keyed by the source's stable keys: days
+// by dayOffset, tiers and extras by code, media by id. @ota/schemas validates
+// the JSON.
+model PackageTranslation {
+  id              String   @id @default(uuid()) @db.Uuid
+  packageId       String   @map("package_id") @db.Uuid
+  locale          String
+  name            String?
+  summary         String?
+  description     String?
+  included        String[] @default([])
+  excluded        String[] @default([])
+  cubaNotes       String?  @map("cuba_notes")
+  seoTitle        String?  @map("seo_title")
+  seoDescription  String?  @map("seo_description")
+  days            Json?
+  tiers           Json?
+  extras          Json?
+  mediaAlt        Json?    @map("media_alt")
+  // Drafted text waits for a reviewer before travelers see it.
+  published       Boolean  @default(false)
+  // Package.contentUpdatedAt when this translation was last brought in line.
+  sourceUpdatedAt DateTime @map("source_updated_at")
+  createdAt       DateTime @default(now()) @map("created_at")
+  updatedAt       DateTime @updatedAt @map("updated_at")
+
+  package Package @relation(fields: [packageId], references: [id], onDelete: Cascade)
+
+  @@unique([packageId, locale])
+  @@map("package_translations")
+}
+
+// A retired slug that redirects to its package. The API keeps a retired slug
+// from being taken by another package.
+model PackageSlugRedirect {
+  slug      String   @id
+  packageId String   @map("package_id") @db.Uuid
+  createdAt DateTime @default(now()) @map("created_at")
+
+  package Package @relation(fields: [packageId], references: [id], onDelete: Cascade)
+
+  @@index([packageId])
+  @@map("package_slug_redirects")
+}
+
 // Gallery images for a catalog item (spec §4.6). The binary lives in object
 // storage; only the private key is kept here — the content type is derived from
 // the key extension, as with supplier credentials.
```
