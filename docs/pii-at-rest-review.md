# PII-at-rest review

- **Date:** 2026-09-25
- **Status:** Analysis, with **Tier 1 implemented** (2026-09-26) in
  `RetentionService.anonymize`: reservation-scoped free text is redacted and
  Better Auth `Verification` rows are deleted on anonymization. Tiers 2–3 remain
  open.
- **Scope:** where personal data lives across the OTA stack, what the current
  retention purge covers, what it does not, and recommended next controls.
- **Sources:** `packages/db/prisma/schema.prisma`,
  `apps/api/src/retention/retention.service.ts`, `packages/documents/src/*`,
  `packages/email/src/mailer.ts`, `apps/api/src/storage/*`, `packages/storage/*`.

## 1. Definition

"Personal data" here means anything that identifies or can be linked to a
person: name, email, phone, nationality, IP address, account/oauth tokens,
biometric credentials, free-text notes that may contain any of these, and
supplier legal documents. Booking codes, UUIDs, and amounts are pseudonymous.

## 2. Data inventory

| Location | Personal data | Current handling | Gap |
|---|---|---|---|
| `User` | `email`, `fullName`, `phone`, `image`, `nationality` | **Scrubbed** on anonymization (`retention.service.ts`) | None |
| `User` (retention flags) | `retentionConsentGrantedAt`, `retentionNoticeSentAt`, `anonymizedAt` | Written by the lifecycle | None |
| `Session` | `ipAddress`, `userAgent` | **Deleted** on anonymization | None |
| `Account` | OAuth `accessToken`/`refreshToken`/`idToken`, `password` | **Deleted** on anonymization | None |
| `Passkey` | `publicKey`, `credentialID` (biometric) | **Deleted** on anonymization | None |
| `Verification` (Better Auth) | `identifier` (email), `value` (token) | Untouched | **G3** |
| `Reservation.customItineraryPayload` | free-text `notes` (≤1000 chars) | Untouched | **G1** |
| `Message.body` | traveler/ops free text | Untouched | **G1** |
| `Review.comment` | traveler free text | Untouched | **G1** |
| `Incident.description` | free text (often medical/emergency) | Untouched | **G1** |
| `ServiceItem.declineReason`, `DispatchOffer.declineReason` | supplier free text | Untouched | **G1** |
| `AuditLog.metadata` | applicant `email`, decline/rejection `reason`/`note` free text | Untouched | **G1/G3** |
| `Document` + PDFs (`DOCUMENTS_DIR/<bookingCode>/*.pdf`) | traveler name + email, supplier name + phone (`packages/documents/src/data.ts`) | Untouched | **G2** |
| `SupplierProfile` | `primaryPhone`, `rtnLicenseNumber`, `vehicleDetails` | No retention path | **G5** |
| Supplier credential object (`credentials/<supplierId>/…`) | legal ID/licence scans | Private, API-gated, expiry-scanned | **G5** |
| `SupplierApplication` | `fullName`, `email`, `phone`, `rtnLicenseNumber`, `message` | No retention path | **G4** |
| `ImportBatch` | `rows` JSON may embed supplier names/emails | No retention path | **G9** |
| Email content | magic links, message bodies, retention notices | Provider-dependent; Mailpit in dev | **G6** |
| Application logs | `ConsoleMailer` prints the full email body; expiry scan logs supplier emails; digest logs the recipient | pino, no redaction/retention | **G7** |
| `Account`/`Session` IP + user agent | as above | Deleted on purge | None |

Encryption at rest: there is **no field-level encryption**. Data relies on the
Postgres/S3 provider's disk encryption. No passport or billing-address field
exists yet, so the spec §8.2 AES-256 requirement is not yet triggered — but see
G8.

## 3. Controls that already exist

- Secure-by-default `AuthGuard` + `@Roles` RBAC; `@Public()` only on catalogue,
  health, tenant config, recruitment and the retention keep-alive link.
- Documents and credentials are **never public URLs**: reads go through
  ownership-checked API routes; the traveler document DTO omits `storageKey`.
- Object storage keys are opaque (`credentials/…`, `inventory/…`,
  `<bookingCode>/…`) and private.
- The retention purge already scrubs `User` PII and revokes credentials.
- Rate limiting now protects credential endpoints.
- Worker-facing dispatch responses are scoped to the acting worker (no peer
  phone/identity leakage).

## 4. Gaps (ranked)

**G1 — Free-text PII survives anonymization.** `Message.body`, `Review.comment`,
`Incident.description`, `customItineraryPayload.notes`,
`ServiceItem`/`DispatchOffer.declineReason`, and some `AuditLog.metadata` are
attached to reservations, which anonymization keeps for fiscal aggregates. This
is the largest residual.

**G2 — Generated PDFs contain name + email.** The voucher, invoice, and work
order embed `travelerName`, `travelerEmail`, `supplierName`, `supplierPhone`
(`packages/documents/src/data.ts`), stored under
`DOCUMENTS_DIR/<bookingCode>/*.pdf` (`documents.service.ts`). Anonymization does
not delete these. Fiscal/legal retention may require keeping invoices — a legal
call.

**G3 — Better Auth `Verification` rows and audit references.** The purge deletes
sessions/accounts/passkeys but not `Verification` (keyed by the old email) or
`AuditLog` rows referencing the user. Low volume, but a residual identifier.

**G4 — Supplier applications have no retention policy.** Applicant name, email,
phone, RTN, and free-text `message` persist indefinitely.

**G5 — Supplier PII/credentials have no erasure path.** `SupplierProfile` and the
credential object are only subject to the 30-day expiry scan, not to erasure on
off-boarding.

**G6 — Email retention is provider-dependent.** Message bodies and magic links
are retained according to the SMTP provider (Mailpit in dev, no policy).

**G7 — Logs can carry PII.** `ConsoleMailer` prints the full email text (dev
fallback); `ExpiryAlertService` logs supplier emails; the BI digest logs the
recipient. No redaction or log retention is configured.

**G8 — No field-level encryption for future sensitive fields.** When passport or
billing-address data is added (spec §8.2), it must be AES-256 at rest by design,
not left to disk encryption.

**G9 — `ImportBatch.rows` may embed supplier PII** and is kept forever.

**G10 — TLS is a deployment concern.** Spec §8.2 requires TLS 1.3; the code does
not enforce it (Caddy/proxy config does). Document it in the runbook.

## 5. Recommended purge scope

Ordered by risk; Tier 1 is implemented, Tiers 2–3 are recommendations.

**Tier 1 — reservation-scoped free text (implemented 2026-09-26).** During
anonymization, for every reservation owned by the traveler, overwrite free text
that is not a fiscal record:
- `Message.body` → `[redacted]` (keep the row: sender + timestamp are aggregate
  metadata),
- `Review.comment` → `null` (keep the rating — it feeds CSAT aggregates),
- `Incident.description` → `[redacted]`, keep category/severity/resolvedAt,
- `ServiceItem.declineReason` / `DispatchOffer.declineReason` → `null`,
- `Reservation.customItineraryPayload` → `null` (or `{ redacted: true }`),
- delete `Verification` rows whose `identifier` equals the old email,
- overwrite or delete audit metadata that embeds an email (`supplier_application.*`).

**Tier 2 — generated documents.** Delete the PDF objects and `Document` rows on
anonymization, or keep them if fiscal law requires the invoice. Recommended:
keep the invoice only, delete voucher/work order (they carry supplier PII the
supplier did not consent to retain indefinitely). **Requires legal input.**

**Tier 3 — separate retention policies (not the traveler lifecycle):**
- `SupplierApplication`: purge rejected/inactive applications after N months.
- `SupplierProfile` + credentials: erase on verified off-boarding.
- `ImportBatch`: purge batches after N months.

## 6. Recommended baseline controls (independent of the purge)

1. **Stop logging PII**: replace supplier-email lists with counts/IDs in
   `ExpiryAlertService`; keep `ConsoleMailer` clearly dev-only (it already is);
   never log request bodies.
2. **Redact email bodies from logs** in production pino config.
3. **Encrypt sensitive fields at rest** when passport/billing land (G8), with a
   key-management decision (KMS vs app-level).
4. **Set provider retention/DPA** for SMTP and object storage (G6).
5. **Document TLS termination** in the runbook (G10).
6. **Add a PII check to the retention purge test** so a future field cannot be
   added without a scrub decision.

## 7. Fiscal vs GDPR tension (legal)

The spec requires preserving "anonymized aggregate metrics (financial totals,
destination visit counts) for fiscal reporting" while scrubbing PII. That is
satisfiable for `PaymentReceipt`/`ServiceItem`/`Reservation` aggregates, but
invoices are themselves fiscal documents that embed the traveler's name. Whether
those must be retained (and for how long) is a legal question, not an
engineering one — flag to counsel before Tier 2.

## 8. What this review does not do

- It changes no code and no schema.
- It does not decide Tiers 2–3; those remain the owner's call (Tier 1 shipped
  2026-09-26).
- It does not cover personal data held by third parties the agency may add later
  (payment gateway, mail provider) beyond the noted provider-retention gap.
