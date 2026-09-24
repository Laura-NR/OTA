# ADR 0004 — GDPR retention lifecycle: anonymize in place, scheduled in BullMQ

- **Date:** 2026-09-24
- **Status:** Accepted
- **Deciders:** Project founders, lead engineer
- **Context:** `docs/development-plan.md` (Phase 6), `OTA - Specifications
  Document` §3.5, `packages/db/prisma/schema.prisma`

## Context

Spec §3.5 defines an automated retention lifecycle: six months after the
traveler's latest reservation reaches `COMPLETED`, the system emails a keep-alive
notice with a one-click, tokenized confirmation link; if the traveler does not
confirm within a 30-day grace period, a purge worker anonymizes or soft-deletes
the record, scrubbing sensitive PII while preserving anonymized aggregate metrics
for fiscal reporting. A confirmation extends the account by 12 months.

The `User` model already carried `retentionConsentGrantedAt` and `anonymizedAt`,
but nothing used them, and there was no reliable timestamp for "when did this
traveler's last booking complete" nor for "when was the notice sent". Without
those anchors the trigger and the grace period cannot be computed idempotently.

## Decision

**Implement the lifecycle as a daily BullMQ job that sends notices, honours a
stateless tokenized confirmation, and anonymizes in place.**

- **Anchors (migration `20260924065637_retention_lifecycle`).** Add
  `Reservation.completedAt` (set when a transition enters `COMPLETED`, indexed,
  and backfilled from the existing `reservation.transition` audit rows) and
  `User.retentionNoticeSentAt`. Additive; both nullable.
- **Anonymize, do not delete.** The purge scrubs `User` PII — `email` becomes the
  unique placeholder `anonymized+<userId>@anonymized.invalid`, and `fullName`,
  `phone`, `image`, `nationality` are nulled — sets `anonymizedAt`, and revokes
  Better Auth `Session`/`Account`/`Passkey` rows. `Reservation`, `ServiceItem`,
  `PaymentReceipt`, and `AuditLog` rows are kept so the fiscal aggregates
  survive. A hard delete is impossible anyway (`Reservation.user` is
  `ON DELETE RESTRICT`) and a soft-delete that keeps PII does not meet the
  spec's scrubbing requirement.
- **Scope.** Only `TRAVELER`-role users with a completed booking enter the
  lifecycle, so staff who happen to book are never anonymized.
- **Trigger rules live in the domain.** Pure functions in
  `packages/domain/src/retention` own the 6-month trigger, 30-day grace, and
  12-month extension; the API only fetches rows, applies the rules, and persists.
  Once consent is granted, the next cycle runs 12 months from that confirmation.
- **Tokenized confirmation.** The email link carries a stateless HMAC-SHA256
  token (signed with `AUTH_SECRET`) embedding the traveler id and the purge
  deadline. It is verified by the public `GET /retention/keep-alive`, which sets
  `retentionConsentGrantedAt` and returns a small branded HTML page. No new
  column and no new dependency.
- **Scheduling.** A daily BullMQ repeatable job (`upsertJobScheduler`, 05:00)
  runs the scan in-process, mirroring the compliance and reports jobs; a Noop
  scheduler is used in tests or without Redis. `POST /retention/scan` (ops)
  forces a pass, and `GET /retention/pending` (ops) feeds the back-office
  `/retention` desk.

## Consequences

- The retention clock is anchored to a real column, so the job is idempotent and
  testable; existing completions were backfilled from the audit ledger.
- Anonymization is irreversible (credentials are revoked, PII is overwritten),
  so the consent endpoint and grace window are the only escape hatch. The
  stateless token expires exactly at the purge deadline.
- The fiscal and regulatory reports, which read reservations and paid receipts,
  are unaffected by a purge; only the traveler's identity is removed.
- Message bodies, review comments, and incident descriptions are **not** scrubbed
  by this increment; they are reservation-scoped operational records and may
  still contain free-text PII. Revisit with the PII-at-rest review (Phase 7).
- No new third-party dependency.

## Rejected alternatives

- **Soft-delete only** — retains PII, so it fails spec §3.5.
- **Hard-delete the user** — impossible under the existing foreign keys and
  would destroy the fiscal ledger.
- **Store the notice timestamp in the audit log** — avoids a migration but
  makes the grace computation a brittle JSON query, with no index.
- **A stored per-user token** — adds a column and a second piece of state to
  rotate; the signed token already binds the traveler and the deadline.
- **A per-reservation cron** — the spec anchors on the traveler's latest
  completion, not each booking.

## Open items

- Decide whether free-text PII (messages, reviews, incidents) is in scope for
  scrubbing; this ADR leaves it intact.
- Confirm the retention windows (6/30/12) against counsel before production.
