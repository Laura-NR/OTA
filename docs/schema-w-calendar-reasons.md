# W-Calendar block reasons: schema diff for review

**Status:** proposed 2026-11-11, **waiting for the owner's approval**. Nothing in §5 is built.
**Date:** 2026-11-11
**Scope:** the one part of the W-Calendar board (`design/vereda-v1.2/project/W-Calendar.dc.html`)
that needs a migration: why a worker blocked a day ("Motivo: Familia · Carro en taller · Otro
trabajo · Otro"). The rest of the board was built on 2026-11-11 without one
(`docs/worker-app-plan.md` §7, ADR 0007's 2026-11-11 amendment).

## 1. What the board asks, and what exists

| Item | Today | Where it lands |
|---|---|---|
| Tap a day to block or free it; several days at once | Built (2026-11-11): `PUT /worker/availability` on the existing `availabilities` rows | Unchanged |
| Days with a job or an open offer | Built: shown as Trabajo / Oferta pendiente, left as they are by a range | Unchanged |
| "Si bloqueas más de 14 días seguidos…" | Built: the app and the desk's supplier page show the long block (derived, no column) | Unchanged |
| Combustible en reserva (drivers, weekly) | Built: `PUT /worker/fuel` writes `supplier_resources.fuel_reserve_litres` as a `WORKER_APP` confirmation (the channel already existed) | Unchanged |
| **Motivo** for a blocked day, four chips | **Not built**: `availabilities` has only `is_available` | A nullable `block_reason` column (K1) |

## 2. Data changes (this is why it is Article 2)

- **One new enum and one new nullable column** on `availabilities`: `block_reason`. Additive;
  existing rows keep `NULL` (no backfill, K6). Dropping the column and the type undoes it.
- No row is changed by the migration. After it, a worker's block writes the reason with the day.

## 3. Decisions (options and recommendation)

| # | Question | Options | Recommendation |
|---|---|---|---|
| K1 | Where the reason lives | (a) a nullable enum column on `availabilities`; (b) only in the audit row's metadata (no migration, but the desk cannot show a day's reason without reading the audit log); (c) a free-text column | **(a)**: one value per day, readable with the day, four fixed values the desk can translate |
| K2 | The reason when the worker blocks a day | (a) `OTHER` until the worker picks a chip, as the board draws it; (b) no reason until picked | **(a)**: the board's toggle stores "otro" and the chips change it |
| K3 | A range ("Bloquear varios días") | (a) the same four chips on the range card, `OTHER` by default (a design resolution with the existing chip style); (b) ranges store `OTHER`, changed day by day afterwards | **(a)**: the board's sample range (25–26 Oct) carries "Carro en taller", which a range without chips could not produce |
| K4 | A block the desk sets on its calendar | (a) no reason (`NULL`); (b) the desk picks one too | **(a)**: the desk calendar stays a single-tap toggle (spec §5.2) |
| K5 | Who sees the reason | (a) the worker (chips) and the desk (the day's tooltip on the supplier calendar, en/es/fr); (b) the worker only | **(a)**: the desk calls about long blocks and should know why |
| K6 | Rows blocked before the migration | (a) left `NULL`, shown without a reason; (b) backfilled to `OTHER` | **(a)**: no data change |

## 4. Not in this batch

- Reasons on the analytics or the dispatch views; the reason does not change dispatch, which
  skips any blocked day.
- Free-text notes on a block.

## 5. What lands once approved

- Domain: `WORKER_BLOCK_REASONS` and the K2 default.
- Schemas: `setWorkerDaysSchema` gains an optional `reason` (blocking only); the calendar's
  days and the desk's `AvailabilityDayDto` gain `reason`/`blockReason` (additive).
- API: `WorkerService.setDays` writes the reason with each blocked day and clears it when a day
  is freed; the audit row records it; the desk's `PUT /suppliers/:id/availability` writes
  `NULL` (K4).
- App: the four chips under a blocked day and on the range card (K3), in the board's order.
- Desk: the reason in the supplier calendar's day tooltip, en/es/fr.
- Tests: unit (reason kept, cleared on free, default `OTHER`), the API with a fake Prisma, the
  worker-app e2e picks "Carro en taller" and the desk reads it.

## 6. The diff

```prisma
/// W-Calendar: why a worker blocked a day.
enum AvailabilityBlockReason {
  FAMILY
  VEHICLE_REPAIR
  OTHER_JOB
  OTHER
}

model Availability {
  // …existing fields…
  /// Null when available, set by the desk, or blocked before the reasons existed.
  blockReason AvailabilityBlockReason? @map("block_reason")
}
```

```sql
CREATE TYPE "AvailabilityBlockReason" AS ENUM ('FAMILY', 'VEHICLE_REPAIR', 'OTHER_JOB', 'OTHER');
ALTER TABLE "availabilities" ADD COLUMN "block_reason" "AvailabilityBlockReason";
```
