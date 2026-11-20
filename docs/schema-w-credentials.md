# W-Credentials: schema diff for review

**Status:** proposed 2026-11-14; **approved 2026-11-14, V1–V8 as recommended** (V1a, V2a, V3a,
V4a, V5a, V6a, V7a, V8a).
**Date:** 2026-11-14
**Scope:** the W-Credentials board (`design/vereda-v1.2/project/W-Credentials.dc.html`), its
edge state in `A-States` ("Credencial suspendida"), W-Home's credential line, and the
credential inspector of `A-Suppliers`. The worker sees each of their documents, uploads a photo
of a renewal from the phone, and follows its review. The desk reviews each document on its own.
Phase 7, `docs/worker-app-plan.md` §8 item 2; ADR 0007.

## 1. What the board asks, and what exists

| Item | Today | Where it lands |
|---|---|---|
| Four documents per driver (transport licence, technical inspection, liability insurance, identity card), each with its own status and expiry | **One** credential per supplier: `supplier_profiles.credential_document_url` (a storage key) and `credential_expires_at` | V1, V2 |
| A renewal "Enviada · en revisión" beside the current document, which stays valid | **Missing**: an upload replaces the file and deletes the old one at once; nothing is under review | V1, V4 |
| "Desde el 31 oct (30 días antes) dejas de recibir ofertas automáticas" per document | Built for the single date (`canAutoDispatch`, the desk's window setting) | V3: the earliest expiry of the current documents |
| Uploading from the phone, with a preview and a three-point checklist | **Missing**: only the desk uploads (`POST /suppliers/:id/credential`, base64 JSON, 5 MB) | V4, V6 |
| Number, issuer, issued, reviewed on / by | **Missing**: only the expiry date is stored | V1 (columns), V4 (the desk types them) |
| Desk: Approve · VERIFIED, Reject with reason, Request new upload, Open full size (logged) | Approve/suspend acts on the **supplier** (`POST /suppliers/:id/verification`); a credential read is not audited | V4, V7 |
| Identity card "Guardado cifrado en la central" | Nothing stored | V5 |
| Summary: Activa / En revisión / Vence pronto / Suspendida | W-Home shows "Credencial vigente · vence …" (ADR 0007 §6) | Derived in the domain, no column |
| "Te avisamos por SMS" | The SMS channel logs in development and sends nothing until a provider exists (ADR 0007) | Uses that channel as it is |
| "Cambiar de vehículo", "Subir nuevo seguro" for the vehicle | The vehicle is the desk's form (`PUT /suppliers/:id/vehicle`) | Insurance upload: yes (V2). Vehicle change: not here (§4) |

## 2. Data changes (this is why it is Article 2)

With the recommendations below:

- **One new table** `supplier_credentials` (one row per uploaded document version) and **two
  new enums**, `CredentialKind` and `CredentialStatus`. Additive.
- **A data backfill** (V8): the one dev supplier with a credential file gets a row for its
  category's main document. Production holds no supplier yet.
- `supplier_profiles.credential_expires_at` stays and becomes **derived**: the earliest expiry
  of the supplier's current (verified) documents, rewritten in the same transaction as every
  review. Dispatch, the expiring list, disruptions, the daily expiry scan and W-Home keep
  reading it unchanged (V3).
- `supplier_profiles.credential_document_url` is no longer written or read; the column stays,
  and a later migration drops it once the backfill has been checked on a real database (dropped
  2026-11-20, `docs/schema-credential-url-drop.md`).
- Undo: drop the table and the two types, then copy the expiry back. Nothing else changes shape.

## 3. Decisions (options and recommendation)

- **V1 — Shape.** (a) **Recommended:** `supplier_credentials`, one row per uploaded version,
  with status `PENDING_AUDIT`, `VERIFIED`, `REJECTED` or `SUPERSEDED`. The current document of
  a kind is its one `VERIFIED` row; a renewal is a `PENDING_AUDIT` row beside it; the history
  stays. (b) Fixed columns per document on `supplier_profiles` (four documents × number, expiry,
  file, plus a pending copy of each): about 30 columns, no history, a migration for each new
  kind.
- **V2 — Kinds, and which ones each category needs.** (a) **Recommended:** one enum for six
  kinds (`TRANSPORT_LICENCE`, `TECHNICAL_INSPECTION`, `LIABILITY_INSURANCE`, `GUIDE_LICENCE`,
  `HOST_LICENCE`, `IDENTITY_CARD`). The required set is a domain rule, so it can change without a
  migration: a driver the board's four; a guide the guide licence and the identity card; a host
  the host licence and the identity card; a translator the identity card. These sets are
  placeholders until the agency and counsel confirm them (`docs/production-readiness.md` §4).
  (b) The four only for drivers; other categories keep one undifferentiated credential.
- **V3 — What dispatch reads.** (a) **Recommended:** `credential_expires_at` holds the earliest
  expiry of the current documents, so the 30-day pause works per document with no change to
  dispatch. The completeness rule sits at approval: the desk cannot set a supplier `VERIFIED`
  while a required document lacks a current version, and the A-Suppliers board already asks for
  exactly that ("request before approving"). A supplier verified before this change stays
  verified, and the desk sees what is missing. (b) Dispatch reads the new table and pauses a
  supplier with any required document missing. This is stricter: it pauses every existing
  supplier until the desk has reviewed all their documents, and it changes five call sites.
- **V4 — Upload and review.** (a) **Recommended:** a document uploaded by the worker (app) or
  the desk (the existing route, now with a `kind`) always lands `PENDING_AUDIT`. Review is
  Operations Admin or Super Admin. To approve, the reviewer types the number, the issuer, the
  issue date and the expiry they read off the photo. This sets the row `VERIFIED` and the
  previous version `SUPERSEDED`, and recomputes the expiry. To reject, they give a reason;
  "Request new upload" is a rejection whose reason tells the worker what to fix. Either outcome
  goes to the worker by the SMS channel (logged until a provider exists) and is audited. A kind
  has at most one pending row: a new upload replaces a pending one, which the service enforces
  in its transaction. (b) The worker also types the expiry, and the reviewer only confirms it.
  This saves the desk typing, but a mistyped date would reach dispatch once a reviewer
  confirms it in a hurry.
- **V5 — The identity card.** (a) **Recommended:** keep no photo of it. The desk checks it in
  person or on a video call and records "comprobado" with the reviewer and the date; the row has
  no file and no number. The board's line becomes "Comprobado por la central. No guardamos la
  foto." (b) Store the photo like the other documents, encrypted under a new
  `CREDENTIAL_ENCRYPTION_KEY`: a second key to deploy, back up and rotate, holding the most
  sensitive file in the system. (c) Store it like the other documents, unencrypted, in the
  private bucket: this contradicts the board's "cifrado".
- **V6 — Taking the photo (a new dependency).** (a) **Recommended:** `expo-image-picker`
  58.0.10, Expo's own SDK 58 pin, for the camera and the gallery. A JPEG quality of about 0.6
  keeps a phone photo near 1 MB; the API's 5 MB cap stays. The board's "se comprime a 300 KB"
  becomes the real size, because a fixed target would also need `expo-image-manipulator`. On the
  web preview (screenshots and e2e only) it opens a file input. (b) No upload from the app in
  this batch: the app shows the documents and their status, and the worker sends photos by
  WhatsApp for the desk to upload.
- **V7 — Old files and reads.** (a) **Recommended:** when a version is superseded or rejected,
  its file is deleted (best-effort, as today); the row keeps the number, dates, reviewer and
  reason. Every desk read of a credential file writes an audit row (`supplier.credential_viewed`),
  which is the board's "Open full size (logged)". (b) Keep superseded files for an audit trail
  of scans; this makes the PII review's G5 (supplier documents, no retention path) larger.
- **V8 — Backfill.** (a) **Recommended:** the migration copies each existing
  `credential_document_url` + `credential_expires_at` into one row of the category's main kind
  (driver → transport licence, guide → guide licence, host → host licence, translator →
  identity card), `VERIFIED` if the supplier is `VERIFIED`, else `PENDING_AUDIT`. On the dev DB
  that is one row (the seeded guide). The seed then adds the rest of each seeded supplier's
  required documents. (b) No backfill: the old file stays readable as "Credencial anterior" next
  to the new table, which means two code paths.

## 4. Not in this batch

- The worker changing vehicle ("Cambiar de vehículo"): the vehicle stays the desk's form.
- Aligning the vehicle form's own insurance date with the insurance document: shown side by
  side on the desk; a follow-up.
- W-Login's credential banner before the code is entered: the app shows the summary after
  sign-in (W-Home), as today.
- Push notifications for review outcomes: SMS (logged) only, as for offers.
- A retention path for supplier documents (PII review G5): unchanged, beyond V5 and V7.

## 5. What lands once approved

- Domain `packages/domain/src/supplier/credentials.ts`: the kinds, the required set per
  category, the current and pending version of each kind, the earliest current expiry, the
  worker's summary (active, in review, expiring soon, suspended) and the approval gate. All
  pure, with unit tests.
- API: `GET /worker/credentials` and `POST /worker/credentials` (the worker's own; upload
  route added to `UPLOAD_ROUTES`); the desk's `GET /suppliers/:id/credentials`, `POST
  /suppliers/:id/credential` gains `kind`, `GET /suppliers/:id/credentials/:credentialId/file`
  (audited), `POST …/:credentialId/approve` and `…/reject`. The old single-file download is
  replaced by the per-version one. `POST /suppliers/:id/verification` refuses `VERIFIED` while
  a required document is missing (409). Every route goes into the RBAC matrix; a live
  integration test covers the backfilled row and an approve → supersede → expiry recompute.
- Worker app: a "Mis credenciales" screen from W-Home's line and the profile, with one card
  per required document, the summary, the 30-day rule and "Cómo funciona"; upload with a
  preview and the checklist; an offline upload keeps the photo and asks the worker to send it
  again when the connection returns. Unlike answers, it is not queued, because a photo is too
  heavy to resend in the background.
- Desk: the supplier page's credential inspector becomes a document list, each with view
  (logged), approve (number, issuer, issued, expiry) and reject (reason), in en/es/fr; the
  supplier list's "Expiring ≤ 30 d" and Ops Lite's expiring credentials keep working from
  the derived date.
- e2e: the worker uploads a renewal in the app, the desk approves it, and the app shows the new
  expiry; the desk refuses approval of a supplier with a missing document.

## 6. The diff

```prisma
enum CredentialKind {
  TRANSPORT_LICENCE
  TECHNICAL_INSPECTION
  LIABILITY_INSURANCE
  GUIDE_LICENCE
  HOST_LICENCE
  IDENTITY_CARD
}

enum CredentialStatus {
  PENDING_AUDIT
  VERIFIED
  REJECTED
  SUPERSEDED
}

model SupplierCredential {
  id           String           @id @default(uuid()) @db.Uuid
  supplierId   String           @map("supplier_id") @db.Uuid
  kind         CredentialKind
  status       CredentialStatus @default(PENDING_AUDIT)
  /// Null for an identity card checked in person (V5a), and once a file is removed (V7a).
  storageKey   String?          @map("storage_key")
  number       String?          @db.VarChar(60)
  issuer       String?          @db.VarChar(120)
  issuedOn     DateTime?        @map("issued_on") @db.Date
  expiresOn    DateTime?        @map("expires_on") @db.Date
  uploadedAt   DateTime         @default(now()) @map("uploaded_at")
  uploadedById String?          @map("uploaded_by_id") @db.Uuid
  uploadedVia  ResourceChannel  @map("uploaded_via")
  reviewedAt   DateTime?        @map("reviewed_at")
  reviewedById String?          @map("reviewed_by_id") @db.Uuid
  rejectReason String?          @map("reject_reason") @db.VarChar(500)
  createdAt    DateTime         @default(now()) @map("created_at")
  updatedAt    DateTime         @updatedAt @map("updated_at")

  supplier   SupplierProfile @relation(fields: [supplierId], references: [id], onDelete: Cascade)
  uploadedBy User?           @relation("SupplierCredentialUploadedBy", fields: [uploadedById], references: [id], onDelete: SetNull)
  reviewedBy User?           @relation("SupplierCredentialReviewedBy", fields: [reviewedById], references: [id], onDelete: SetNull)

  @@index([supplierId, kind, status])
  @@index([status])
  @@map("supplier_credentials")
}
```

`uploadedVia` reuses `ResourceChannel` (`WORKER_APP` from the app; `VISIT`, `PHONE` or
`WHATSAPP` from the desk), as the fuel reserve does. The "one pending and one current per kind"
rule is enforced in the service transaction, not by a partial unique index: Prisma 6 cannot
declare one, so a hand-written index would read as drift on every `prisma migrate dev`.

Backfill (V8a), in the same migration:

```sql
INSERT INTO supplier_credentials (id, supplier_id, kind, status, storage_key, expires_on,
  uploaded_at, uploaded_via, reviewed_at, created_at, updated_at)
SELECT gen_random_uuid(), sp.id,
  CASE sp.category WHEN 'PRIVATE_DRIVER' THEN 'TRANSPORT_LICENCE'
                   WHEN 'TOUR_GUIDE' THEN 'GUIDE_LICENCE'
                   WHEN 'HOMESTAY_HOST' THEN 'HOST_LICENCE'
                   ELSE 'IDENTITY_CARD' END::"CredentialKind",
  CASE sp.verification_status WHEN 'VERIFIED' THEN 'VERIFIED' ELSE 'PENDING_AUDIT' END::"CredentialStatus",
  sp.credential_document_url, sp.credential_expires_at::date,
  sp.updated_at, 'VISIT', CASE sp.verification_status WHEN 'VERIFIED' THEN sp.updated_at END,
  now(), now()
FROM supplier_profiles sp
WHERE sp.credential_document_url IS NOT NULL;
```

## 7. As built (2026-11-14)

- Migration `20261114143342_w_credentials` (§6 plus the backfill), applied to the dev DB: one
  backfilled row (the seeded guide's licence, `VERIFIED`, file kept). The seed adds the rest of
  each demo supplier's required documents.
- Domain `packages/domain/src/supplier/credentials.ts`: `REQUIRED_CREDENTIALS`,
  `credentialUploadRefusal`, `credentialSlots` (current, pending, and the latest rejection
  until something newer is uploaded), `currentCredentialExpiry`, `missingCredentials`,
  `credentialState` (a document is valid through its expiry day), `credentialPauseFrom`,
  `credentialSummary`, `credentialApprovalRefusal` and the review SMS.
- API `SupplierCredentialsService` (`apps/api/src/suppliers/`): `GET|POST /worker/credentials`
  (service worker); `GET /suppliers/:id/credentials`, `GET
  /suppliers/:id/credentials/:credentialId/file` (audited as `supplier.credential_viewed`) and
  `POST /suppliers/:id/credential` with `kind` and `via` (operations roles and support); `POST
  /suppliers/:id/credentials/:credentialId/approve|reject` and `POST
  /suppliers/:id/credentials/identity-card` (Operations Admin, Super Admin). `GET
  /suppliers/:id/credential` and `SupplierDto.hasCredential`/`credentialContentType` are gone.
  `POST /suppliers/:id/verification` answers 409 with the missing kinds before approving.
  RBAC matrix +7 (the old download removed); live
  `supplier-credentials.integration.test.ts` (the backfill SQL in a rolled-back transaction,
  upload → approve → supersede → expiry).
- Worker app: "Mis credenciales" (`CredentialsScreen.tsx`) from W-Home and from "Fiabilidad y
  pagos"; `src/lib/credentials.ts` (pure, tested) and `src/lib/pick-photo.ts`
  (`expo-image-picker` 58.0.10, which brings `expo-image-loader` 58.0.3).
- Desk: the supplier page's "Credentials" panel (`supplier-credentials.tsx`, en/es/fr) and a
  line under the verification actions naming what blocks approval.
- e2e: `worker-app.spec.ts`'s seventh test (photo from the app, the desk's review, the gate and
  the identity check); `suppliers.spec.ts`' desk upload.
