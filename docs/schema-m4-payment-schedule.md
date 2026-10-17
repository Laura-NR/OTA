# M4 Payment schedule: schema diff for review

**Status:** **Draft for the owner's review (Q9). No migration is generated until it is approved.**
**Date:** 2026-10-17
**Scope:** `docs/design-v1.1-plan.md` Phase 4, M4: deposit and balance instalments, due dates,
proof-of-transfer uploads, fees, and refunds with an approval chain. Read against the Payment,
Booking (step 5), A-Payments, A-Booking and Account boards (`design/vereda-v1.2/project/`) and
spec §4.2 (the PENDING_PAYMENT window) and §7.1 (invoice-based payment, SEPA first, card second).
It builds on M1 (the package's `depositPolicy` and `cancellationPolicy` keys), M2 (the frozen
price lines) and M3 (the OFAC gate on payment links).

## 1. What M4 covers

| Board / plan item | Where it lands in M4 |
|---|---|
| "Deposit · 20 % · Balance due 14 Jan 2027" or "Pay in full" (Payment) | `PaymentInstalment` rows (DEPOSIT + BALANCE, or FULL), created when the traveler chooses |
| Deposit only when departure is more than 60 days away (plan, domain) | a pure eligibility rule over the manifest's deposit policy (D2) |
| "Pay within 48 hours to lock it in" (Payment), "a set window (e.g., 48 hours)" (spec §4.2) | `PaymentInstalment.dueAt` on the first instalment; the expiry handling is D4 |
| "Vouchers, host contacts and the offline kit unlock when the deposit clears" (Booking) | the first PAID instalment confirms the booking (D3) |
| "Proof of transfer · optional · Upload PDF or photo · up to 10 MB · we reconcile by hand" (Payment) | `PaymentProof` on the receipt, files behind `packages/storage` |
| "Review proof · Accept, extend the window 1 business day · Reject proof" (A-Payments) | `PaymentProof.status`, reviewed by operations (D5) |
| "Bank transfer has no fee; card and wallets add 3 %" (Payment) | `PaymentReceipt.feeAmount` from a manifest rate (D6, a counsel question) |
| Refund queue: "Operations Admin up to € 500 alone · € 500–2,000 dual approval · above € 2,000 Super Admin", reason mandatory, idempotent gateway id (A-Payments) | `Refund` + `RefundApproval`, thresholds in the manifest (D7) |
| "30–15 days → 25 % fee · refundable 75 %" (A-Payments), "full refund minus € 60, then 10 % · 25 % · 40 % · 60 % · 80 %; under 24 h, 100 %" (Booking) | a cancellation scale in the manifest, keyed by the package's `cancellationPolicy` (D2, D7) |
| "Ledger is append-only: a correction is a new entry" (A-Payments) | D8 |

## 2. Data changes (this is why it is Article 2)

Four new tables (`payment_instalments`, `payment_proofs`, `refunds`, `refund_approvals`), five
enums and two columns on `payment_receipts` (`instalment_id`, `fee_amount`). Everything is
additive and starts empty. No backfill: an existing receipt keeps `instalment_id` null and
`fee_amount` 0, and reads as a legacy payment of the full total, so the bookings already in
PENDING_PAYMENT keep today's single full-amount link.

The agency's terms (deposit percent and eligibility, balance due date, payment window,
cancellation scale, refund thresholds, card fee) go into the tenant manifest, not the database
(M1 D4(a)); that part needs no migration.

New personal data: proof files (they show the payer's name, bank and part of an IBAN), the
refund's free-text reason, and which staff member approved what. These go into
`docs/pii-at-rest-review.md` when M4 is built.

## 3. Decisions (options and recommendation)

**D1. Where the schedule lives**
- **(a) One `PaymentInstalment` row per amount owed (recommended).** Created when the traveler
  chooses deposit or full on the Payment page (or the desk chooses for them). Each row has its
  kind, amount, currency, due date and status, and a receipt points at the instalment it pays.
  A reminder job, the A-Booking schedule and the Account payments list all read the same rows.
- (b) Columns on `Reservation` (`depositAmount`, `depositDueAt`, `balanceDueAt`). Fewer tables,
  but it hard-codes two instalments and has nowhere to put a waived or rescheduled one.
- (c) Computed on the fly from the policy. Nothing to store, but a schedule the traveler agreed
  to would move when the manifest changes.

**D2. Where the agency's payment terms live**
- **(a) In the tenant manifest, keyed by the package's `depositPolicy` and `cancellationPolicy`
  (recommended; this is M1 D4(a) made executable).** A `policies` block holds the deposit plans
  (percent, minimum days before departure, balance due days before departure) and the
  cancellation scales (bands of days before departure with the share kept and any fixed fee). An
  instalment and a refund store the policy key and version they were computed from. This also
  gives the publish checks a real list of known policy keys, closing the gap flagged with the
  server-side checks (`03a7f39`: today a package's own keys count as known).
- (b) Tables editable in the admin. This needs A-Settings (M9) and an approval trail first.

  Sample values, to confirm: deposit 20 % when departure is more than 60 days away, balance due
  30 days before departure (the boards' 13 Feb trip has its balance due 14 Jan), a 48 h window
  for the first payment. Cancellation: only "45–31 days: 10 %" and "30–15 days: 25 %" appear
  on the boards with their day ranges; the 40 / 60 / 80 % steps need their ranges, and the
  "full refund minus € 60" needs its cut-off date.

**D3. What confirms the booking**
- **(a) The first instalment paid (the deposit, or the full amount) moves PENDING_PAYMENT →
  CONFIRMED (recommended).** Vouchers issue then, as the Booking board promises. The balance is
  tracked on its instalment; an unpaid balance after its due date raises a desk alert and the
  reminders, and never changes the booking's status on its own. No new reservation status.
- (b) CONFIRMED only once everything is paid. Simpler accounting, but it contradicts the board
  and holds vouchers for weeks.

**D4. When the first payment window runs out**
- **(a) The booking goes to a "Payment window expired" queue on the desk, which extends it (24 h
  and a new link) or cancels it (recommended while bank transfer is the only live rail).** A
  transfer can take a business day and there is no bank feed yet, so an automatic cancel could
  cancel a booking whose money has arrived but is not reconciled.
- (b) Automatic cancel at expiry unless the desk extended it (the plan's "auto-cancel after 48 h
  unpaid", and the board's "Let it cancel"). Revisit once a statement import or a gateway
  confirms payments without a person.

**D5. Proof of transfer**
- **(a) `PaymentProof` rows on a receipt, reviewed by operations (recommended).** The traveler
  uploads a PDF, JPEG or PNG up to 10 MB from the Payment or Account page; files are stored at
  `payment-proofs/<reservationId>/<uuid>.<ext>` behind `packages/storage` and read through an
  audited route. Accepting a proof extends the window by one business day; the receipt is
  still confirmed with today's manual confirm once the money is seen. Rejecting a proof records
  a note the traveler sees. A new upload after a rejection is a new row.
- (b) Also ship the board's "Confirm now on proof (Operations Admin override)". The board makes
  it safe by reversing it if the bank feed shows nothing in three business days; without a feed
  that reversal would be manual, so this waits for the statement import.

**D6. The card fee**
- **(a) A payment-level `feeAmount` on the receipt, from a manifest rate that defaults to 0
  (recommended).** The fee depends on the rail chosen at payment, so it is not a price line of
  the trip; the invoice shows it as a payment fee. Counsel sets the rate: EU rules (PSD2,
  art. 62(4), transposed in Spain) restrict surcharges on consumer cards issued in the EEA,
  which the board's flat "card + 3 %" may not respect.
- (b) 3 % for every card payment, as drawn.

  The card rail stays on the mock provider until TropiPay (ADR 0005), so this only shapes the
  model now.

**D7. Refunds and their approvals**
- **(a) `Refund` rows with `RefundApproval` votes (recommended).** A refund names the receipt it
  returns money from, its amount, a reason category and a mandatory reason text, and the rule it
  was computed with (policy key, band, share kept). The pure rules decide who must approve, from
  manifest thresholds: up to € 500 one Operations Admin; € 500–2,000 two different approvers;
  above € 2,000 a Super Admin. "Force majeure overrides the policy table but not the
  approvals." A refund on the wire rail is paid by the agency's bank and recorded with the bank
  reference; a card refund goes through the provider with the refund id stored before the call,
  so a retry never refunds twice.
- (b) Refunds as negative receipts. Simpler, but there is no approval trail and nowhere to record
  a rejected request.

**D8. Is the payment ledger append-only now?**
- **(a) Not yet: receipts stay mutable as today and every change is audited (recommended).** The
  audit log already keeps who confirmed or failed a payment and when. Refunds and proofs are new
  rows, never edits.
- (b) A separate append-only `PaymentEntry` ledger now, as the board's note describes. It earns
  its keep with bank-statement import and automatic matching, so it belongs there.

## 4. Deferred, not in M4

- Bank-statement import and automatic matching by reference, amount and payer (A-Payments), and
  with it the "confirm on proof" override (D5b) and the append-only ledger (D8b).
- Supplier payout liabilities by province and the payout runs (A-Payments); they need a payouts
  model with the supplier work.
- Rails health, automatic hiding of a failing rail, and fees and FX reporting.
- The card rail itself: FX at today's rate with the rate locked, CAD display, a saved card token
  for the balance, Apple and Google Pay (TropiPay, ADR 0005).
- Open banking (a provider decision).
- Travel credit instead of a refund (+10 %), cash on arrival, and group invoices with 30-day
  terms and VAT ids.
- Supplier penalties on a cancellation (the refund's "Supplier penalties € 0" line).
- The reminder emails 7, 3 and 1 days before a balance falls due (Phase 6, C-Spec); M4 provides
  the due dates they read.

## 5. What lands with M4 once approved

1. The migration, additive (the diff below).
2. The manifest `policies` block and the new `payments` keys in `@ota/config`, with the sample
   values marked as placeholders in `tenant/README.md`.
3. `@ota/domain`, pure and tested: `depositEligible` (departure far enough away),
   `buildSchedule` (deposit plus balance, or full, from the total, the policy, the departure and
   now; amounts rounded so they add up to the total), `paymentWindowEnds`, `cancellationRefund`
   (the band for the days before departure, the share kept, the fixed fee, against what was
   paid) and `refundApprovals` (who still has to approve).
4. `@ota/schemas`: schedule, instalment, proof and refund DTOs; a proof's list entry never
   carries its storage key.
5. API, every route in the authorization matrix:
   - `POST /me/reservations/:id/payments` takes `plan: DEPOSIT | FULL` and pays the next
     instalment (the OFAC gate stays first); the desk's `POST /reservations/:id/payments` the
     same;
   - `GET /reservations/:id/schedule` and `GET /me/reservations/:id/schedule`;
   - `POST /me/reservations/:id/payments/:paymentId/proof` (owner, 10 MB, rate-limited),
     `GET /payments/proofs?status=` (ops), `GET /payments/proofs/:id/file` (ops, audited),
     `POST /payments/proofs/:id/accept|reject` (ops write);
   - `POST /reservations/:id/refunds` (ops write, with the suggested amount from the policy),
     `POST /refunds/:id/approve|reject` (by threshold), `POST /refunds/:id/sent` (records the bank
     reference for the wire rail), `GET /refunds?status=` (the queue).
6. Confirming the first instalment moves the booking to CONFIRMED (D3); a balance paid later only
   marks its instalment.
7. A scheduled scan (BullMQ, same pattern as the retention lifecycle) that puts expired windows in
   the desk queue (D4) and flags overdue balances.
8. Surfaces: the Payment page (deposit or full, wire instructions with the proof upload, card
   shown disabled until the card rail); the Account payments list; the schedule on A-Booking;
   the proofs and refund queues on A-Payments; "window expiring" and "balance overdue" on
   A-Dashboard.
9. Reports: GBV keeps counting PAID receipts; refunds sent are subtracted in finance; the fiscal
   CSV gains the fee and refund lines.

**Questions for counsel (they do not block the schema):** the card surcharge (D6); the
cancellation scale and the € 60 fee; whether a deposit is refundable only when a host cancels or
under force majeure (the Payment board's wording); how long proofs of transfer are kept (they are
payment evidence, like invoices: PII Tier 2).

**Questions for the owner:** the sample terms in D2 (deposit percent, the 60 and 30 days, the
48 h window, the missing band ranges) and the refund thresholds in D7.

## 6. The diff

```diff
--- a/packages/db/prisma/schema.prisma
+++ b/packages/db/prisma/schema.prisma (M4 draft)
@@ enum additions
+enum InstalmentKind {
+  DEPOSIT
+  BALANCE
+  FULL
+}
+
+enum InstalmentStatus {
+  DUE
+  PAID
+  WAIVED       // the desk forgave it (a goodwill gesture); audited
+  CANCELLED    // the booking was cancelled before it fell due
+}
+
+enum ProofStatus {
+  SUBMITTED
+  ACCEPTED     // looks right; the window was extended; the money is still to be seen
+  REJECTED
+}
+
+enum RefundReason {
+  TRAVELER_CANCELLATION
+  HOST_CANCELLATION
+  FORCE_MAJEURE
+  GOODWILL
+  PRICE_CORRECTION
+}
+
+enum RefundStatus {
+  REQUESTED
+  APPROVED     // every approval the threshold needs is in
+  REJECTED
+  SENT         // the bank or the provider has it
+  FAILED
+}
@@ model PaymentReceipt (additions)
   amount       Decimal       @db.Decimal(10, 2)
+  // M4 D6: the rail's fee on top of the amount (card surcharge); 0 for transfers.
+  feeAmount    Decimal       @default(0) @map("fee_amount") @db.Decimal(10, 2)
+  // M4 D1: the instalment this payment is for; null on payments made before M4.
+  instalmentId String?       @map("instalment_id") @db.Uuid
   ...
+  instalment PaymentInstalment? @relation(fields: [instalmentId], references: [id], onDelete: SetNull)
+  proofs     PaymentProof[]
+  refunds    Refund[]
+
+  @@index([instalmentId])
@@ model Reservation (relations)
+  instalments PaymentInstalment[]
+  refunds     Refund[]
@@ model User (relations)
+  proofsUploaded  PaymentProof[]   @relation("ProofUploadedBy")
+  proofsReviewed  PaymentProof[]   @relation("ProofReviewedBy")
+  refundsRequested Refund[]        @relation("RefundRequestedBy")
+  refundApprovals RefundApproval[]
@@ new models
+/// M4 D1: one amount the traveler owes, with its due date.
+model PaymentInstalment {
+  id            String           @id @default(uuid()) @db.Uuid
+  reservationId String           @map("reservation_id") @db.Uuid
+  kind          InstalmentKind
+  position      Int
+  amount        Decimal          @db.Decimal(10, 2)
+  currency      String           @default("EUR")
+  dueAt         DateTime         @map("due_at")
+  status        InstalmentStatus @default(DUE)
+  paidAt        DateTime?        @map("paid_at")
+  /// The manifest deposit policy key (and version) the schedule was built from.
+  policyKey     String?          @map("policy_key")
+  createdAt     DateTime         @default(now()) @map("created_at")
+  updatedAt     DateTime         @updatedAt @map("updated_at")
+
+  reservation Reservation      @relation(fields: [reservationId], references: [id], onDelete: Cascade)
+  receipts    PaymentReceipt[]
+
+  @@unique([reservationId, position])
+  @@index([status, dueAt])
+  @@map("payment_instalments")
+}
+
+/// M4 D5: a traveler's proof of transfer, reviewed by operations.
+model PaymentProof {
+  id           String      @id @default(uuid()) @db.Uuid
+  receiptId    String      @map("receipt_id") @db.Uuid
+  storageKey   String      @map("storage_key")
+  uploadedById String?     @map("uploaded_by_id") @db.Uuid
+  status       ProofStatus @default(SUBMITTED)
+  reviewedById String?     @map("reviewed_by_id") @db.Uuid
+  reviewedAt   DateTime?   @map("reviewed_at")
+  /// What the traveler is told on a rejection, or the desk's note.
+  reviewNote   String?     @map("review_note")
+  createdAt    DateTime    @default(now()) @map("created_at")
+
+  receipt    PaymentReceipt @relation(fields: [receiptId], references: [id], onDelete: Cascade)
+  uploadedBy User?          @relation("ProofUploadedBy", fields: [uploadedById], references: [id], onDelete: SetNull)
+  reviewedBy User?          @relation("ProofReviewedBy", fields: [reviewedById], references: [id], onDelete: SetNull)
+
+  @@index([status, createdAt])
+  @@index([receiptId])
+  @@map("payment_proofs")
+}
+
+/// M4 D7: money returned from one receipt, with its approvals.
+model Refund {
+  id               String       @id @default(uuid()) @db.Uuid
+  reservationId    String       @map("reservation_id") @db.Uuid
+  receiptId        String       @map("receipt_id") @db.Uuid
+  amount           Decimal      @db.Decimal(10, 2)
+  currency         String       @default("EUR")
+  reason           RefundReason
+  /// Mandatory; it also goes to the audit log.
+  note             String
+  /// The policy key, band and share kept it was computed with; null for a goodwill amount.
+  rule             Json?
+  status           RefundStatus @default(REQUESTED)
+  requestedById    String?      @map("requested_by_id") @db.Uuid
+  /// The provider's refund id, or the bank reference; stored before the provider call.
+  providerRefundId String?      @unique @map("provider_refund_id")
+  sentAt           DateTime?    @map("sent_at")
+  createdAt        DateTime     @default(now()) @map("created_at")
+  updatedAt        DateTime     @updatedAt @map("updated_at")
+
+  reservation Reservation      @relation(fields: [reservationId], references: [id], onDelete: Cascade)
+  receipt     PaymentReceipt   @relation(fields: [receiptId], references: [id], onDelete: Restrict)
+  requestedBy User?            @relation("RefundRequestedBy", fields: [requestedById], references: [id], onDelete: SetNull)
+  approvals   RefundApproval[]
+
+  @@index([status, createdAt])
+  @@index([reservationId])
+  @@map("refunds")
+}
+
+/// M4 D7: one person's vote on a refund; dual approval needs two different people.
+model RefundApproval {
+  id         String   @id @default(uuid()) @db.Uuid
+  refundId   String   @map("refund_id") @db.Uuid
+  approverId String   @map("approver_id") @db.Uuid
+  approve    Boolean
+  note       String?
+  createdAt  DateTime @default(now()) @map("created_at")
+
+  refund   Refund @relation(fields: [refundId], references: [id], onDelete: Cascade)
+  approver User   @relation(fields: [approverId], references: [id], onDelete: Restrict)
+
+  @@unique([refundId, approverId])
+  @@map("refund_approvals")
+}
```

And the manifest (no migration; sample values to confirm, D2, D6, D7):

```json
"policies": {
  "deposit": {
    "standard": { "percent": 20, "minDaysBeforeDeparture": 60, "balanceDaysBeforeDeparture": 30 }
  },
  "cancellation": {
    "standard": {
      "bands": [
        { "fromDays": 46, "keepPercent": 0, "fee": 60 },
        { "fromDays": 31, "keepPercent": 10 },
        { "fromDays": 15, "keepPercent": 25 },
        { "fromDays": 8, "keepPercent": 40 },
        { "fromDays": 3, "keepPercent": 60 },
        { "fromDays": 1, "keepPercent": 80 },
        { "fromDays": 0, "keepPercent": 100 }
      ]
    }
  }
},
"payments": {
  "bankTransfer": { "...": "unchanged" },
  "windowHours": 48,
  "cardFeePercent": 0,
  "refundApproval": { "singleUpTo": 500, "dualUpTo": 2000 }
}
```

The 46, 8, 3 and 1-day boundaries above are guesses that fill the steps the boards name without
ranges; only the 31 and 15-day boundaries come from A-Payments.
