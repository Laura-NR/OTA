# M7 Content (advisories): schema diff for review

**Status:** Draft for review, 2026-10-18. **No migration has been generated.** The owner asked for
M7 to be drafted first (before M8) on 2026-10-18; the decisions in §3 decide the migration.
**Date:** 2026-10-18
**Scope:** `docs/design-v1.1-plan.md` Phase 5 item 8, M7 ("Content: advisories with two
approvals, blog, conditions, FAQ, media"), read against the A-Content and E-Advisory boards
(`design/vereda-v1.2/project/`), DS 03's crisis banner (`packages/ui` `CrisisBanner`) and the
Phase 6 notifications. It builds on the tenant's province codes (`tenant/provinces.json`) and on
the audit-log idempotency the Phase 6 scans use.

## 1. What M7 covers

| Board item | Where it lands |
|---|---|
| "Advisories & crisis banners": title, severity, regions, dates, status (A-Content) | `Advisory` (D1) |
| Severity Info (blue, dismissible) · Caution (amber, dismissible) · Critical (red, acknowledge only) | `Advisory.severity`; the storefront `CrisisBanner` already draws all three |
| "Info and caution: Operations Admin publishes. Critical: Operations Admin + Super Admin, publishes immediately on the second approval, audited" | `AdvisoryApproval` rows and a pure approval rule (D4) |
| "Headline · EN … ES and FR open as tabs; a missing translation blocks publishing for critical only" | `AdvisoryTranslation` per locale (D6) |
| "Regions: Whole country · La Habana · Pinar del Río · Matanzas · Oriente" | `Advisory.regions`, province codes; empty is the whole country; "Oriente" is a desk shortcut for its provinces (D3) |
| "Effective from · Expires — mandatory. A banner without an end date is a stale banner." | `effectiveFrom` and a required `expiresAt`; Scheduled and Expired are derived on read |
| "Shows on: site banner · Travel info hub · Package pages in region · Email + in-app to affected travelers · Worker app broadcast" | three flags on `Advisory` (D1); the worker broadcast waits for the worker app (ADR 0007) |
| "Source (shown to travelers)" | `Advisory.source` |
| "Edit (new version) · Lift advisory" | a new row that supersedes the published one; `LIFTED` (D2) |
| "Travelers with a trip in an affected region get the advisory by email and in-app the moment it publishes" (A-Content); "within 60 days" (E-Advisory) | E-Advisory sent at publication, recorded in the audit log (D5, D7) |
| "Critical … cannot be dismissed, the traveler acknowledges" | `AdvisoryAcknowledgement` (D8) |
| "Expired advisories collapse to the Current Conditions page history" | read from `Advisory` by `expiresAt`; no extra table |
| Blog & guides, destination hubs' conditions, FAQs, media (A-Content's other tabs) | **not in this draft** if D1(a); they stay tenant content files |

## 2. Data changes (this is why it is Article 2)

- **New tables:** `advisories`, `advisory_translations`, `advisory_approvals`,
  `advisory_acknowledgements`.
- **New enums:** `AdvisorySeverity` (INFO, CAUTION, CRITICAL) and `AdvisoryStatus` (DRAFT,
  IN_REVIEW, PUBLISHED, SUPERSEDED, LIFTED). "Scheduled" (published, not yet effective) and
  "Expired" (past `expiresAt`) are derived on read, as M5 derives a proposal's expiry.
- **New relations on `User`:** advisories created, approvals given, acknowledgements made.
- Additive only; no backfill; no existing table changes shape.

## 3. Decisions (options and recommendation)

**D1 · How much of M7 now.**
(a) Advisories only. Conditions, the blog, FAQs and media stay tenant content
(`tenant/messages`), as Phase 2 decided, until Vereda needs to edit them without a deploy.
(b) The whole A-Content page: advisories plus article, FAQ, destination-hub and media tables with
an editorial workflow.
**Recommend (a).** Advisories are the only content with a safety duty, approvals and an email;
the rest is placeholder copy today, and a CMS for it is a bigger decision (Q8).

**D2 · Editing a published advisory.**
(a) "Edit (new version)" creates a new `Advisory` row with `supersedesId`; when it publishes, the
old row becomes SUPERSEDED. Each version is approved on its own and the history stays readable.
(b) A separate `AdvisoryVersion` table under one advisory.
(c) Edit in place and rely on the audit log for history.
**Recommend (a).** It mirrors the board's wording, keeps one shape for drafts and live rows, and
a superseded row is what the Current Conditions history shows.

**D3 · Regions.**
(a) `regions String[]` of province codes (`CU01`…), empty meaning the whole country; the desk's
"Oriente" button fills its provinces.
(b) A join table to a provinces table.
**Recommend (a).** Province codes are already the tenant's vocabulary and there is no provinces
table; an array is indexed with GIN if it ever needs to be.

**D4 · Approvals.**
(a) `AdvisoryApproval` rows (approver, role, time). INFO and CAUTION publish on one Operations
Admin or Super Admin approval; CRITICAL needs an Operations Admin and a Super Admin, two
different people, and publishes the moment the second lands. Every step is audited.
(b) Approvals only in the audit log.
**Recommend (a).** The rule needs to count distinct approvers by role, and A-Content lists who
approved; a table makes both a query, not a log scan.

**D5 · Delivery ledger for E-Advisory.**
(a) The audit log (`advisory.delivered`, one row per traveler and advisory), as the Phase 6 scans
do; no table.
(b) An `AdvisoryDelivery` table with a unique (advisory, user) pair.
**Recommend (a).** It is the pattern already in use; an in-app "unread" list is not on the boards.

**D6 · Translations.**
(a) `AdvisoryTranslation` per locale with headline, body and call to action; `sourceLocale` on the
advisory; publishing CRITICAL requires every tenant locale, INFO/CAUTION fall back to the source.
(b) A JSON column of translations on the advisory.
**Recommend (a).** Same shape as M1's package translations; the publish check is a simple count.

**D7 · Who is emailed.**
(a) CAUTION and CRITICAL: travelers whose booking is CONFIRMED, PENDING_PAYMENT, SECURED_AND_INVOICED
or IN_PROGRESS, starts within 60 days (or is under way), and has a service item or package
province in the advisory's regions (service items carry province names, mapped to codes with the
domain's province list). INFO: nobody by email; it shows on the site only.
(b) Every traveler with any open booking.
**Recommend (a)**, the boards' rule. A whole-country CAUTION reaches every such traveler.

**D8 · Critical acknowledgement.**
(a) `AdvisoryAcknowledgement` (advisory, user, time, unique pair); the storefront keeps the banner
until the signed-in traveler acknowledges; anonymous visitors see it every visit. INFO and
CAUTION dismissals stay in browser storage, a per-viewer convenience.
(b) No acknowledgement record.
**Recommend (a).** "The traveler acknowledges" is a duty-of-care record; it is small and
retention keeps it with the anonymized user, like the consent log.

## 4. Deferred, not in M7

- SMS for CRITICAL and notifying travelers' emergency contacts (an SMS provider and counsel on
  contacting third parties).
- The worker-app broadcast (the worker app is not built; ADR 0007).
- The blog, FAQ, media library and destination-hub conditions editor if D1(a).
- Linking an advisory to a disruption case ("from case DC-0931") — M8.

## 5. What lands with M7 once approved

- Pure rules in `@ota/domain`: the approval policy (D4), the active window and derived status,
  the audience filter (D7) and the translation check (D6), unit-tested.
- API: ops `GET/POST /advisories`, `PATCH /advisories/:id` (drafts only),
  `POST /advisories/:id/versions` (D2), `POST /advisories/:id/approve`,
  `POST /advisories/:id/lift`; public `GET /advisories/active?locale=&province=`;
  `POST /me/advisories/:id/acknowledge`. All in the authorization matrix.
- E-Advisory (en/es/fr, branded) sent at publication to the D7 audience, idempotent through the
  audit log, verified in Mailpit by e2e.
- Desk: the Content section's advisories tab (list, editor with the banner preview, approvals,
  lift), replacing the hidden Content link.
- Storefront: the site banner from active advisories (replacing the placeholder strip), the
  Travel info "current advisories" list with history, the notice on package pages and the
  Booking form's first step for the regions, and the critical acknowledgement.
- Retention: acknowledgements stay with the anonymized user; advisories hold no traveler data.

## 6. The diff

```prisma
enum AdvisorySeverity {
  INFO
  CAUTION
  CRITICAL
}

enum AdvisoryStatus {
  DRAFT
  IN_REVIEW
  PUBLISHED
  SUPERSEDED
  LIFTED
}

model Advisory {
  id              String           @id @default(uuid()) @db.Uuid
  /// The visible reference (ADV-2026-031), unique.
  reference       String           @unique
  severity        AdvisorySeverity
  status          AdvisoryStatus   @default(DRAFT)
  /// Province codes (CU01…); empty is the whole country (D3).
  regions         String[]         @default([])
  effectiveFrom   DateTime         @map("effective_from")
  /// Mandatory: a banner without an end date is a stale banner.
  expiresAt       DateTime         @map("expires_at")
  /// Shown to travelers ("Vereda drivers on the ground · …").
  source          String
  sourceLocale    String           @default("en") @map("source_locale")
  showOnSite      Boolean          @default(true) @map("show_on_site")
  showOnPackages  Boolean          @default(true) @map("show_on_packages")
  notifyTravelers Boolean          @default(true) @map("notify_travelers")
  /// The published advisory this version replaces (D2).
  supersedesId    String?          @unique @map("supersedes_id") @db.Uuid
  createdById     String?          @map("created_by_id") @db.Uuid
  publishedAt     DateTime?        @map("published_at")
  liftedAt        DateTime?        @map("lifted_at")
  createdAt       DateTime         @default(now()) @map("created_at")
  updatedAt       DateTime         @updatedAt @map("updated_at")

  supersedes       Advisory?                 @relation("AdvisorySupersedes", fields: [supersedesId], references: [id], onDelete: SetNull)
  supersededBy     Advisory?                 @relation("AdvisorySupersedes")
  createdBy        User?                     @relation("AdvisoryCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)
  translations     AdvisoryTranslation[]
  approvals        AdvisoryApproval[]
  acknowledgements AdvisoryAcknowledgement[]

  @@index([status, expiresAt])
  @@map("advisories")
}

model AdvisoryTranslation {
  id         String   @id @default(uuid()) @db.Uuid
  advisoryId String   @map("advisory_id") @db.Uuid
  locale     String
  headline   String
  /// What happened, why, what to do.
  body       String
  cta        String?
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  advisory Advisory @relation(fields: [advisoryId], references: [id], onDelete: Cascade)

  @@unique([advisoryId, locale])
  @@map("advisory_translations")
}

model AdvisoryApproval {
  id         String   @id @default(uuid()) @db.Uuid
  advisoryId String   @map("advisory_id") @db.Uuid
  approverId String?  @map("approver_id") @db.Uuid
  /// The approver's role when they approved (D4 counts roles).
  role       Role
  createdAt  DateTime @default(now()) @map("created_at")

  advisory Advisory @relation(fields: [advisoryId], references: [id], onDelete: Cascade)
  approver User?    @relation("AdvisoryApprovals", fields: [approverId], references: [id], onDelete: SetNull)

  @@unique([advisoryId, approverId])
  @@map("advisory_approvals")
}

model AdvisoryAcknowledgement {
  id         String   @id @default(uuid()) @db.Uuid
  advisoryId String   @map("advisory_id") @db.Uuid
  userId     String   @map("user_id") @db.Uuid
  createdAt  DateTime @default(now()) @map("created_at")

  advisory Advisory @relation(fields: [advisoryId], references: [id], onDelete: Cascade)
  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([advisoryId, userId])
  @@map("advisory_acknowledgements")
}

// On User:
//   advisoriesCreated        Advisory[]                @relation("AdvisoryCreatedBy")
//   advisoryApprovals        AdvisoryApproval[]        @relation("AdvisoryApprovals")
//   advisoryAcknowledgements AdvisoryAcknowledgement[]
```

The migration would be generated with `pnpm --filter @ota/db exec prisma migrate dev --name
advisories` once D1–D8 are answered (never `prisma format`).
