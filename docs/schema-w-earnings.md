# W-Earnings payouts: schema diff for review

**Status:** proposed 2026-11-11, **awaiting the owner's decisions (E1–E8)**. Nothing in §6 is
applied.
**Date:** 2026-11-11
**Scope:** the parts of the W-Earnings board (`design/vereda-v1.2/project/W-Earnings.dc.html`)
that the read-only slice could not build on the existing tables: recording a payout, its date,
method and receipt, the next pay day, and ratings. The read-only slice landed on 2026-11-11
without a migration (§7, `docs/worker-app-plan.md` §7, ADR 0007's 2026-11-11 amendment).

## 1. What the board asks, and what exists

| Item | Today | Where it lands |
|---|---|---|
| Tu fiabilidad: score, Aceptados / Rechazados / Sin respuesta, the floor | Built (2026-11-11) from the dispatch-offer ledger, all offers, the desk's live floor | Unchanged, unless E8 changes the window |
| "subió desde 93 en julio" | Not built | E8 (derived, no column) |
| Cancelaciones de última hora | Not built: nothing records a worker cancelling a job they accepted | With W-Job (not here) |
| Pendiente, Este mes, Pagado en 2026 | Built from `service_items.payout_rate` and `payout_status` over finished jobs | "Pagado en" by the paid date once E1 lands; until then, by the job's end |
| Historial with "Pagado 28 sep" | Built without the date: "Pagado" / "Pendiente" / "Incidencia" | The date with E1 |
| **Recording a payout** | **Missing**: no code ever sets `payout_status = SETTLED`, so "Pagado" stays 0 | E1 |
| Efectivo EUR · oficina Vedado, "Cambiar a transferencia" | **Missing**: no payout method anywhere | E2, E3 |
| Próximo pago Sáb 10 oct 10:00–13:00, "5 días hábiles" rule | **Missing**: no pay rule or office hours | E4 (settings, no column) |
| Recibos (PDF): "Firmas un recibo por cada pago" | **Missing** | E5 |
| Valoraciones 4,8 ★ and a comment | **Not attributable**: a review rates the whole booking; `reviews.supplier_id` exists but nothing writes it | E6 (no column) |
| Notificaciones, Idioma de la app | Out of scope: SMS/push wait on the provider; the app is Spanish only (ADR 0007) | Not here |

## 2. Data changes (this is why it is Article 2)

With the recommendations below:

- **One new table** `supplier_payouts` (one payment to a worker, covering one or more jobs),
  **one new enum** `PayoutMethod`, **one nullable column** `service_items.payout_id` (FK, `ON
  DELETE SET NULL`), and **one nullable column** `supplier_profiles.payout_method`.
- All additive. No backfill: the dev DB has 6 service items, all `ACCRUED`, and no `SETTLED`
  row, so no existing payout lacks a record. Dropping the table, the columns and the type undoes
  it.
- After it, the desk's "Record payout" writes a `supplier_payouts` row and sets the chosen
  jobs `SETTLED` with its id, in one transaction, audited.

## 3. Decisions (options and recommendation)

| # | Question | Options | Recommendation |
|---|---|---|---|
| E1 | How a payout is recorded | (a) a `supplier_payouts` row per payment (date, method, amount, who recorded it) that the paid jobs point to; (b) a `payout_settled_at` column on each job, marked one by one | **(a)**: the board pays several jobs at once ("€ 360 · 2 trabajos") with one signed receipt, so the payment is the thing to record |
| E2 | Payout method | (a) `CASH_OFFICE` or `BANK_TRANSFER` per worker (`supplier_profiles.payout_method`, null = not set) and per payment; (b) per payment only | **(a)**: the app shows the worker's method; each payment records the one used |
| E3 | "Cambiar a transferencia" | (a) the button calls the desk (no bank details in the app); (b) the worker types an account number in the app | **(a)**: bank details are new PII at rest (`docs/pii-at-rest-review.md`) and need counsel; the desk changes the method |
| E4 | Next pay day | (a) a rule in the thresholds: jobs are paid N business days after they end (placeholder 5, the board's), at the office hours in the tenant manifest; computed, no column; (b) the desk types a date per worker | **(a)**, with N and the hours as placeholders until the owner gives the real ones |
| E5 | Receipts | (a) the API renders a receipt PDF per payment (`packages/documents`, the existing renderer), which the worker downloads; the signed paper stays at the office; (b) the desk uploads a scan of the signed receipt | **(a)**; a signed scan (b) can follow with the same storage path as credentials |
| E6 | Ratings | (a) the traveler's review form rates each worker of the booking (writes the existing `reviews.supplier_id`; no migration, but one review per booking becomes one per worker); (b) the booking's rating is shown to every worker on it; (c) not shown | **(c) for now, (a) later**: (b) blames a driver for a casa; comments shown to a worker need a real translation and a privacy line in the review form (counsel) |
| E7 | Who records a payout | (a) Operations Admin and Super Admin, an RBAC matrix row; (b) Super Admin only | **(a)**, as the other supplier writes |
| E8 | Reliability window | (a) keep every offer, as the desk's floor reads it today (as built); (b) the last 12 months for the floor, the inspector and the app together (the board's "últimos 12 meses") | **(a)** until the owner wants the floor changed; never the app alone, or the number the worker sees would not be the one that decides |

## 4. Not in this batch

- A gateway or bank transfer from the platform: a payout is recorded after it happens.
- Bank account numbers (E3), push or SMS notices of a payment (no provider yet).
- Cancellations of accepted jobs (W-Job).

## 5. What lands once approved

- Domain: the payout rule (E4: next pay day from a job's end, business days, office hours),
  the record's refusals (a job not finished, not this worker's, already paid, a booking
  cancelled), and "Pagado en" by the paid date.
- API: `POST /suppliers/:id/payouts` (E7; jobs, method, date) and `GET
  /suppliers/:id/payouts`; `GET /worker/earnings` gains the method, the next pay day, the paid
  date per job and the payments with their receipt; `GET /worker/payouts/:id/receipt` (own
  only). RBAC matrix rows for each.
- Desk: on the supplier page, "Record payout…" (pick the pending jobs, method, date), the
  payments list; Thresholds gain the pay rule (en/es/fr).
- App: Próximo pago, the method line with "Llamar a la central para cambiarlo", "Pagado 28
  sep" in the history, Recibos (PDF).
- Tests: unit (rule, refusals), the API with a fake Prisma, a live test of the transaction, the
  worker-app e2e records a payout on the desk and reads it in the app.

## 6. The diff

```prisma
/// W-Earnings: how a worker is paid.
enum PayoutMethod {
  CASH_OFFICE
  BANK_TRANSFER
}

/// One payment to a worker, covering one or more finished jobs (E1).
model SupplierPayout {
  id           String       @id @default(uuid()) @db.Uuid
  supplierId   String       @map("supplier_id") @db.Uuid
  method       PayoutMethod
  currency     String       @default("EUR")
  amount       Decimal      @db.Decimal(10, 2)
  paidAt       DateTime     @map("paid_at")
  recordedById String?      @map("recorded_by_id") @db.Uuid
  createdAt    DateTime     @default(now()) @map("created_at")

  supplier     SupplierProfile @relation(fields: [supplierId], references: [id], onDelete: Cascade)
  recordedBy   User?           @relation(fields: [recordedById], references: [id], onDelete: SetNull)
  serviceItems ServiceItem[]

  @@index([supplierId, paidAt])
  @@map("supplier_payouts")
}

model ServiceItem {
  // …existing fields…
  /// The payment that settled this job; null until paid (E1).
  payoutId String?         @map("payout_id") @db.Uuid
  payout   SupplierPayout? @relation(fields: [payoutId], references: [id], onDelete: SetNull)
}

model SupplierProfile {
  // …existing fields…
  /// Null until the desk sets it (E2).
  payoutMethod PayoutMethod? @map("payout_method")
}
```

```sql
CREATE TYPE "PayoutMethod" AS ENUM ('CASH_OFFICE', 'BANK_TRANSFER');
CREATE TABLE "supplier_payouts" (
  "id" UUID NOT NULL,
  "supplier_id" UUID NOT NULL,
  "method" "PayoutMethod" NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "amount" DECIMAL(10,2) NOT NULL,
  "paid_at" TIMESTAMP(3) NOT NULL,
  "recorded_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_payouts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "supplier_payouts_supplier_id_paid_at_idx" ON "supplier_payouts"("supplier_id", "paid_at");
ALTER TABLE "supplier_payouts" ADD CONSTRAINT "supplier_payouts_supplier_id_fkey"
  FOREIGN KEY ("supplier_id") REFERENCES "supplier_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_payouts" ADD CONSTRAINT "supplier_payouts_recorded_by_id_fkey"
  FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_items" ADD COLUMN "payout_id" UUID;
ALTER TABLE "service_items" ADD CONSTRAINT "service_items_payout_id_fkey"
  FOREIGN KEY ("payout_id") REFERENCES "supplier_payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "supplier_profiles" ADD COLUMN "payout_method" "PayoutMethod";
```

The SQL is what `prisma migrate dev` is expected to generate; the generated file is reviewed
against it before it is applied.

## 7. The read-only slice (built 2026-11-11, no migration)

- Domain `packages/domain/src/worker/earnings.ts` (`93b7ccb`): `isFinishedJob` (taken, ended,
  booking not cancelled; nothing sets `FULFILLED`, so the end of the service decides),
  `workerPayoutState` (`ACCRUED`/`PROCESSING` → pending, `SETTLED` → paid, `FAILED` → issue),
  `workerEarnings` (cents; this month and year on Havana's calendar; the newest 20 jobs) and
  `workerReliability` (every offer, the thresholds' floor and minimum).
- API (`d6d17b1`): `GET /worker/earnings` (`SERVICE_WORKER`, own profile; RBAC matrix +1);
  `SupplierDetailDto.payouts` through `SuppliersService.payouts`, the same rule.
- App (`e1d890c`): "Fiabilidad y pagos" from W-Home; reliability, payouts, history; needs a
  connection, like the calendar. Desk (`42e827e`): the supplier page's Payouts panel (en/es/fr).
- e2e (`93baf7d`): `worker-app.spec.ts`'s fifth test.
