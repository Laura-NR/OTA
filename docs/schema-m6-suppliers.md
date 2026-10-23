# M6 Supplier operations: schema diff for review

**Status:** **Approved 2026-10-20 as recommended (D1a–D9a) and built the same day** (§7). The
owner then asked for the D6(b) and D7(b) follow-ups, built 2026-10-23 with no migration (§7).
**Date:** 2026-10-19
**Scope:** `docs/design-v1.1-plan.md` Phase 5 item 3 (Suppliers: backup power, **M6**), read
against the A-Suppliers board (the **Power** and **Last job** columns, the "Backup power only"
filter, the inspector's "Backup power & resilience · casas" and "Vehicle & fuel · drivers" cards)
and the A-Disruption board ("Resources in Pinar del Río": backup power, standby drivers with
fuel). It builds on the supplier register (`SupplierProfile`, `Availability`), the dispatch
ledger (`ServiceItem`, `DispatchOffer`) and M8 (`DisruptionCase.province`). ADR 0006 records
that the two columns wait for "M6 (backup-power fields) and a job-history source".

## 1. What M6 covers

| Board item | Where it lands |
|---|---|
| Casa resilience: generator (none · own · shared), hours per day, fuel on hand in days, solar + battery, water tank, rooms · capacity (A-Suppliers inspector) | `SupplierResources`, one row per supplier (D1) |
| "Last confirmed by phone {when}" | The row's confirmation stamp: when, who, how (D1, D4) |
| Driver "Fuel reserve: 40 L declared 4 Oct", "self-declared weekly" | `SupplierResources.fuelReserveLitres` under the same stamp; stale after 7 days, derived on read (D2) |
| **Power** column: "Solar", "Generator 6 h", "None"; "Fuel 40 L" for drivers | Derived on read from the row (D1) |
| **Last job** column: "3 Oct · HAV→Viñales"; inspector "Jobs · 12 m" | Derived on read from the service items (D3); no column |
| "Backup power only" filter on the register | A query over the row (D1) |
| A-Disruption "Resources in {province}": backup power, standby drivers, official numbers | `GET /disruptions/:id/resources`, derived on read (D5) |
| A-Disruption header "Suppliers involved: 4" | Derived from the attached bookings' service items (D5) |
| "the 'backup power' filter travelers see" | **Owner choice** (D6); recommended desk-only for now |
| Vehicle (model, plate, insurance, routes), guide specialities, payouts | **Deferred** (D7, §4) |

## 2. Data changes (this is why it is Article 2)

- **One new table:** `supplier_resources`, keyed by the supplier (one row at most per supplier;
  no row means "never confirmed").
- **Two new enums:** `GeneratorAccess` (NONE, OWN, SHARED) and `ResourceChannel` (PHONE,
  WHATSAPP, VISIT, WORKER_APP).
- **New relations on `SupplierProfile` and `User`.** Nothing existing changes shape and nothing
  is backfilled. The seed gains placeholder rows for the demo suppliers (dev data only).
- **No manifest change.** The 7-day freshness rule is a domain constant, after the board's
  "self-declared weekly".

## 3. Decisions (options and recommendation)

**D1 · Where the resilience fields live.**
(a) A 1:1 `SupplierResources` table with typed, nullable columns: the casa fields (generator
access, hours per day, the hours as the host words them, fuel days, solar battery kWh, water tank
litres, rooms, guest capacity), the driver's fuel reserve in litres, and one confirmation stamp
(when, which desk user, by which channel). The desk replaces the row wholesale on each
confirmation. The Power column and the "Backup power only" filter are derived from it: solar
(battery > 0) wins, then a generator with its hours, else None; for a driver, the fuel litres.
(b) The same columns on `supplier_profiles`.
(c) A validated JSON column, like the unused `vehicle_details`.
**Recommend (a).** The fields are category-specific and empty for guides and translators. The
stamp sits beside the values it confirms, so "never confirmed" is the absence of a row. Typed
columns keep the console's query (D5) a plain filter. (b) widens the row that dispatch reads on
every offer, and (c) cannot be filtered or validated by the database.

**D2 · Fuel reserve and freshness.**
(a) Litres on the same row, confirmed with the same stamp (a supplier is one category). The desk
records it now. The worker app's weekly self-declaration (Phase 7) writes the same row with
`WORKER_APP` as the channel. A confirmation older than 7 days is **stale**, derived on read: the
register greys it and the console puts it last with "confirm by phone".
(b) A separate declaration time for fuel.
(c) A scheduled job that clears stale values.
**Recommend (a).** One stamp is enough while a casa never declares fuel litres and a driver never
declares a generator. Deriving staleness keeps one source of truth, as M4 and M8 do.

**D3 · Last job and jobs over 12 months.**
(a) Derived on read from `service_items`: the latest item assigned to the supplier whose status is
ACCEPTED or FULFILLED, whose start is in the past, and whose booking is not CANCELLED. The
label is the date, the service type and the province, e.g. "3 Oct · Transport · Pinar del Río".
The 12-month count uses the same filter. No column.
(b) A `last_job_at` column on the profile, updated on accept and completion.
**Recommend (a).** The service items already are the job-history source ADR 0006 asked for, and
`service_items.supplier_id` is indexed. A denormalised column drifts when an item is reassigned
or a booking is cancelled. The board's route text ("HAV→Viñales") is not stored anywhere (a
service item has a province, not a route), so the label does not promise it.

**D4 · Who records resources.**
(a) Operations Admin and Super Admin, through `PUT /suppliers/:id/resources` (the same roles as
availability). Each write stamps the actor and the channel the body names, and is audited as
`supplier.resources_confirmed` with the previous and new values. Administrative Support reads
the fields.
(b) Support may also write (they answer the phone).
(c) A SERVICE_WORKER route for the supplier's own row now.
**Recommend (a).** It matches availability. (c) waits for the worker app (ADR 0007): a write
route with no client would ship untested, which the 2026-10-17 consent-route decision avoided. Choose (b) if support takes the morning
check-in calls; the same question is open for M8's status board.

**D5 · The disruption console's resources.**
(a) `GET /disruptions/:id/resources`, derived on read for the case's province. It lists VERIFIED
suppliers whose provinces include it and whose credential has not expired:
- casas with a generator or solar, with their hours, fuel days, rooms and capacity, today's
  availability (an `Availability` row, or available when there is none) and the age of the
  confirmation;
- drivers with a fuel reserve above zero, with the litres, the age of the declaration and today's
  availability;
- the tenant's `emergencyContacts` as the "Official" line.

  A supplier paused by the 30-day expiry rule is listed with its badge, since manual assignment
  stays possible. The header's "Suppliers involved" counts the distinct suppliers on the attached
  bookings' service items. A case without a province shows no resources and says why.
(b) A desk-curated resource list per case (a new table).
**Recommend (a).** The board's card is a view of the register filtered by place and time. A
curated list would copy facts that are already in it and go stale. "2 rooms free tonight" needs
room-level stock the platform does not have: the card shows capacity and the supplier's
availability for the day instead.

**D6 · The traveler-facing "backup power" filter.**
(a) Desk only in M6.
(b) Also a public, derived `backupPower` flag on catalog stays whose supplier has a fresh
generator or solar confirmation, with a storefront filter.
**Recommend (a).** Telling travelers a stay has power is a claim the agency makes. It needs the
agency's wording and a freshness promise, and the "Cuba right now" copy is still placeholder.
(b) is additive later and needs no further migration.

**D7 · Vehicle and guide details on the inspector.**
(a) Not in M6. The "Vehicle & fuel" card shows only the fuel reserve, and the specialities card
waits.
(b) Validate the existing `vehicle_details` JSON (model, seats, AC, plate, insurance end,
routes) and edit it in the inspector, with no migration.
(c) Typed vehicle columns in `supplier_resources`.
**Recommend (a).** The brief scopes M6 to power, fuel and the last job. Vehicle insurance is a
compliance document: the board blocks an applicant's approval on it, so it belongs with the
credential inspector's rules and is not a free field. (b) remains a no-migration follow-up.

**D8 · History.**
(a) The row holds the current state; the audit log (`entityType: 'SupplierProfile'`,
`supplier.resources_confirmed`, the previous and new values in its metadata) is the history, as
in M4–M8.
(b) An append-only `supplier_resource_declarations` table, so fuel can be charted over time.
**Recommend (a).** Nothing on the boards charts it. (b) can be added later if A-Reports wants
the trend.

**D9 · Retention.**
(a) No retention change. The row describes a business's equipment, not a traveler; it cascades
with the supplier profile; the confirming desk user is ON DELETE SET NULL. The hours text
("06–09, 18–21") is capped at 60 characters and the form says what goes there. Supplier PII
stays Tier 3 of `docs/pii-at-rest-review.md` (deferred).
(b) Redact the row when a supplier is purged.
**Recommend (a).** There is no supplier purge yet. Tier 3 should cover this row when it lands.

## 4. Deferred, not in M6

- Vehicle, insurance and guide specialities (D7); payouts on the inspector (the payments module).
- The board's reliability formula (acceptance × punctuality × (1 − last-minute cancellations),
  85 % threshold): punctuality needs traveler check-ins. Reliability stays the acceptance rate.
- Room-level stock ("2 rooms free tonight") and the "Cash" line (an emergency cash advance logged
  against the case is a money feature: M4 and counsel).
- The worker app's weekly fuel self-declaration (Phase 7, ADR 0007) and the supplier broadcast.
- The storefront "backup power" filter (D6) and an outage feed (no data source, as M8 D3).

## 5. What lands with M6 once approved

- Migration `supplier_resources` (§6 verbatim) and placeholder seed rows for the demo suppliers.
- Pure rules in `@ota/domain` (unit-tested): the Power label (solar, generator with hours, none;
  fuel for drivers), "has backup power", the 7-day staleness, the last-job pick and the 12-month
  count, the console's resource ordering (fresh first, then hours or litres).
- DTOs in `@ota/schemas`: the resources body validated per category (casa fields only for
  HOMESTAY_HOST, fuel only for PRIVATE_DRIVER; hours 0–24; non-negative amounts), the register
  row's `power` and `lastJob`, the console's resources.
- API: `GET /suppliers` gains `power`, `lastJob` and a `backupPower=1` filter; `GET
  /suppliers/:id` gains `resources`, `lastJob` and `jobs12m`; `PUT /suppliers/:id/resources`
  (ops+super, audited); `GET /disruptions/:id/resources` and the case's `suppliersInvolved` (ops
  roles). Every route goes into `authorization.e2e.test.ts`.
- Desk: the register's Power and Last job columns and the "Backup power only" chip; the
  inspector's resilience card (casas) and fuel card (drivers) with "Confirm" (channel, values);
  the A-Disruption resources card and the header count. The copy is in the back-office catalogs
  (en/es/fr).
- e2e: confirm a casa's generator and a driver's fuel, see them on the register, then on a case
  in that province.

## 6. The diff

```prisma
enum GeneratorAccess {
  NONE
  OWN
  SHARED
}

/// How a resources confirmation reached the desk.
enum ResourceChannel {
  PHONE
  WHATSAPP
  VISIT
  /// The worker app's self-declaration (Phase 7).
  WORKER_APP
}

/// M6: a supplier's backup power, water, capacity and fuel, as last confirmed (D1, D2).
/// No row means never confirmed. History is the audit log (D8).
model SupplierResources {
  supplierId           String           @id @map("supplier_id") @db.Uuid
  /// Casas (HOMESTAY_HOST).
  generator            GeneratorAccess?
  generatorHoursPerDay Int?             @map("generator_hours_per_day") @db.SmallInt
  /// The hours as the host words them ("06–09, 18–21"), at most 60 characters.
  generatorSchedule    String?          @map("generator_schedule") @db.VarChar(60)
  generatorFuelDays    Int?             @map("generator_fuel_days") @db.SmallInt
  /// Null or 0 means no solar.
  solarBatteryKwh      Decimal?         @map("solar_battery_kwh") @db.Decimal(5, 1)
  waterTankLitres      Int?             @map("water_tank_litres")
  rooms                Int?             @db.SmallInt
  guestCapacity        Int?             @map("guest_capacity") @db.SmallInt
  /// Drivers (PRIVATE_DRIVER).
  fuelReserveLitres    Int?             @map("fuel_reserve_litres")
  confirmedAt          DateTime         @map("confirmed_at")
  confirmedById        String?          @map("confirmed_by_id") @db.Uuid
  confirmedVia         ResourceChannel  @map("confirmed_via")
  createdAt            DateTime         @default(now()) @map("created_at")
  updatedAt            DateTime         @updatedAt @map("updated_at")

  supplier    SupplierProfile @relation(fields: [supplierId], references: [id], onDelete: Cascade)
  confirmedBy User?           @relation("SupplierResourcesConfirmedBy", fields: [confirmedById], references: [id], onDelete: SetNull)

  @@index([confirmedAt])
  @@map("supplier_resources")
}

// On SupplierProfile:
//   resources SupplierResources?
//
// On User:
//   supplierResourcesConfirmed SupplierResources[] @relation("SupplierResourcesConfirmedBy")
```

Database checks the migration would add by hand (Prisma cannot express them): hours per day
between 0 and 24, and the amounts (`generator_fuel_days`, `solar_battery_kwh`,
`water_tank_litres`, `rooms`, `guest_capacity`, `fuel_reserve_litres`) at least 0. The API
validates the same bounds first, so the checks are a backstop.

The migration would be generated with `pnpm --filter @ota/db exec prisma migrate dev
--create-only --name supplier_resources` (never `prisma format`), the checks appended to its SQL,
and then applied with `prisma migrate dev`, as M3 did with its trigger.

## 7. As built (2026-10-20)

- **Migration** `20261020170618_supplier_resources` (`6ba9154`): §6 verbatim, generated with
  `--create-only`, plus two CHECKs appended by hand (`generator_hours_per_day` between 0 and 24;
  the six amounts at least 0). Proved live: an insert with `generator_fuel_days = -1` and every
  other amount NULL is refused.
- **Rules** (`39661e5`, `packages/domain/src/supplier/resources.ts`): `supplierPower`,
  `hasBackupPower`, `backupHoursPerDay` (solar counts as 24 h), `isResourcesStale` (over 7 days),
  `lastJob` and `jobsInWindow` (12 months), `rankResources`, `resourcesIssue`.
- **Choices the doc left open:**
  - A driver row without litres is **None**; "Fuel 0 L" is shown but is not backup. The "Backup
    power only" filter keeps casas with solar or a generator (OWN or SHARED, whatever the hours)
    and drivers with fuel above 0. A stale row stays in the filter and is greyed (D2).
  - The body is checked per category (422): a casa states its generator, NONE included, and a
    casa without one gives no hours, schedule or fuel days; casa fields are refused on a driver and
    the fuel reserve on a casa; guides and translators record nothing. The desk channels are
    PHONE, WHATSAPP and VISIT; WORKER_APP is refused on the desk route (400). The battery is
    rounded to one decimal; a blank schedule is null.
  - Every confirmation replaces the row (an omitted field becomes null) and restamps it, even with
    unchanged values. Audit `supplier.resources_confirmed` (`entityType: 'SupplierProfile'`) holds
    `via`, `previous` and `next`.
  - **Last job** and the 12-month count read service items assigned to the supplier that are
    ACCEPTED or FULFILLED, have started, and whose booking is not CANCELLED; the query narrows to
    the same filter the domain applies. The label is the date in Havana time, the service type and
    the province.
  - **Suppliers involved** counts distinct suppliers holding an OFFERED, ACCEPTED or FULFILLED
    item on the attached bookings. A declined or timed-out item keeps its supplier until
    re-dispatch, so it is not counted.
  - **Console resources:** VERIFIED casas and drivers with a row whose credential has not expired
    (no expiry tracked counts as valid), working in the case's province (supplier province names
    matched to the case's code through `cubaProvinceCode`), with backup power or fuel above 0.
    "Free today" is the profile's `isAvailable` and no `Availability` row blocking today's Havana
    calendar day. "Paused" is the 30-day expiry rule. Order: fresh first, then hours (casas) or
    litres (drivers), then name. The official line is the manifest's `emergencyContacts`, also
    for a case without a province, which lists no suppliers.
- **API** (`24f2d4f`): `GET /suppliers` returns `SupplierRowDto` (the supplier plus `power` and
  `lastJob`) and takes `backupPower=1`; `GET /suppliers/:id` returns `SupplierDetailDto` (plus
  `resources` and `jobs12m`); the other supplier routes keep `SupplierDto`. `PUT
  /suppliers/:id/resources` (Operations Admin, Super Admin) returns the detail. `GET
  /disruptions/:id/resources` (ops roles) and the case's `suppliersInvolved`. Both new routes are in
  the RBAC matrix.
- **Seed** (`9316f57`, dev data): `casa@example.test` (generator 6 h, Pinar del Río) and
  `driver@example.test` (40 L, La Habana and Pinar del Río), verified, with create-only rows so a
  re-seed keeps a later confirmation.
- **Surfaces:** desk `012713d`, copy `5e4c77c` (en/es/fr), e2e `0aae98b`; resolutions in the
  ADR 0006 M6 amendment.
- **Retention:** unchanged (D9a); `docs/pii-at-rest-review.md` Tier 3 names the row.

### Follow-ups (2026-10-23, no migration)

- **D7(b) vehicle** (`fc22c93`, `2d9b69b`): `PUT /suppliers/:id/vehicle` (Operations and Super
  Admin, drivers only, 422 otherwise) validates model, seats (1–60), A/C, extras, plate,
  insurance cover and end date, and up to 12 routes into the existing `vehicle_details` JSON,
  replacing it; audited `supplier.vehicle_updated` with `previous` and `next`. The inspector DTO
  gains `vehicle`; a stored value that does not match the shape reads as none. The insurance end
  date is **informational**: a badge when it ends within 30 days or has ended, and no effect on
  dispatch (the board's approval block on insurance stays with the credential rules, D7).
  Guide specialities are still not stored.
- **D6(b) traveler filter** (`f6f3a4e`, `86a36f2`): each stay in the public package DTO carries
  `backupPower` (solar, or a generator with its hours) when its casa's confirmation is under
  7 days old; the package's `backupPower` is true when it has a stay and every stay claims it. A
  stale or missing confirmation claims nothing; no supplier field is exposed. The storefront
  Packages filters gain "Backup power at every stay" (count, chip, `?power=1`) and each stay on
  the package page states its backup. The wording avoids the board's "guaranteed" and sits in the
  core catalogs, so the agency can override it in `tenant/messages`.
