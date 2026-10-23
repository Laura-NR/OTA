# M9 Settings: schema diff for review

**Status:** **Approved 2026-10-23 as recommended (D1a–D9a) and built the same day** (§7). The
owner also had dispatch enforce the reliability floor and the availability calendar, so the floor
and its minimum joined the D2 table.
**Date:** 2026-10-23
**Scope:** `docs/design-v1.1-plan.md` Phase 5 item 10 (Settings, **M9**: thresholds Q13, invites,
permission overrides with expiry, currencies, manifest view), read against the A-Settings board
(tabs: Users & roles, Permissions, Currencies & languages, Manifest & feature flags, Approvals &
thresholds, Security & audit). It builds on the read-only Settings page
(`apps/backoffice/src/app/(dashboard)/settings/page.tsx`), the tenant manifest
(`packages/config/src/tenant.ts`), Better Auth (`packages/auth`) and the RBAC matrix
(`apps/api/test/authorization.e2e.test.ts`). Q12 and Q13 are already decided: integration keys
show status only (secrets stay env-only), and thresholds become runtime data that the pure
domain functions take as parameters, with today's constants as defaults.

## 1. What M9 covers

| Board item | Today | Where it lands |
|---|---|---|
| Approvals & thresholds (dispatch timers, amber %, payment window, refund limits, credential pause, retention clock), "Save · needs 2nd Super Admin", "Reset to spec defaults" | Domain constants and manifest fields, changed by a deploy | `operating_settings` versions, dual Super Admin apply (D1–D3) |
| Board thresholds with no feature behind them (traveler answer SLA, discount review, minimum margin, reliability floor, override expiry) | Not enforced anywhere | **Not stored** until their feature exists (D2) |
| Users & roles: staff list, passkeys, last sign-in, status | Roles are set by hand in the database; no list | Derived on read from `users`, `session`, `passkey` (D4) |
| Invite a user (work email, role, 7 days, Super Admin needs a second Super Admin) | None | `staff_invites` (D4) |
| Edit role, revoke sessions, deactivate | None | Routes on `users`, plus `User.deactivatedAt` (D5) |
| Recovery codes | None (the magic link is the recovery path) | **Deferred** (D5) |
| Permission matrix; per-action overrides with a reason, expiring after 24 h | Roles per route (`@Roles`) | Read-only matrix now; overrides **deferred** (D6) |
| Currencies (ECB rate, spread, lock at deposit) | EUR only | **Deferred** to its own batch (D7) |
| Languages (coverage, status, detection) | `supportedLocales` in the manifest | Derived on read from the catalogs (D7) |
| Agency manifest, feature flags, preview and diff | A git-tracked file under `tenant/` | Read-only view and diff; changes stay commits (D8) |
| Sessions & sign-in (session 12 h, idle lock 30 min, link 10 min, passkeys required, IP allowlist, new-device email) | Better Auth defaults: 7-day sessions, 5-minute links | Staff session limit and link validity as config (D9); the rest **deferred** |
| Integrations & keys | Env-only | Status only, derived from the environment (Q12; D9) |
| Audit log | Audit rows, read per entity | A Super Admin read of `audit_logs` (no schema) |

## 2. Data changes (this is why it is Article 2)

- **Two new tables:** `operating_settings` (append-only versions of the thresholds document) and
  `staff_invites`.
- **One new enum:** `SettingsVersionStatus` (PROPOSED, APPLIED, REJECTED, WITHDRAWN).
- **One new column:** `users.deactivated_at` (nullable). Nothing is backfilled.
- **Manifest (no migration):** `staff.allowedEmailDomains` (empty means any domain).
- **Behaviour changes that need your approval even without a migration:** the auth guard refuses
  a deactivated user (D5) and, if chosen, a staff session older than the limit (D9); the API reads
  thresholds from the applied version instead of constants (D3).

## 3. Decisions (options and recommendation)

**D1 · How thresholds are stored.**
(a) An append-only `operating_settings` table: each row is a whole thresholds document (validated
JSON, a version number, who proposed it, who decided it and when, the status). The applied
version with the highest number is current; nothing is updated in place except the status of a
pending proposal. "Reset to spec defaults" proposes a version equal to the code's defaults.
(b) One row per key (`key`, `value`, `updated_by`).
(c) Thresholds in the manifest, changed by a deploy (today).
**Recommend (a).** A version is the board's "versioned, audited event", it holds a whole
consistent set (the refund limits are checked together), the history is the table itself, and a
proposal waiting for its second Super Admin cannot be half applied. (b) needs a separate audit
trail and a lock for multi-key changes. (c) is what Q13 replaced.

**D2 · Which thresholds become runtime.**
(a) Only the ones the code enforces today:

| Setting | Default (today) | Today in |
|---|---|---|
| Dispatch timer, standard | 2 h | `DEFAULT_DISPATCH_TIMEOUT_MS` |
| Dispatch timer, arrival soon / its window | 30 min / 48 h | `SHORT_NOTICE_*` |
| Amber alert at | 75 % | `AMBER_THRESHOLD` |
| Payment window after the link | 48 h | manifest `payments.windowHours` |
| Refund alone / dual | € 500 / € 2,000 | manifest `payments.refundApproval` |
| Credential expiry pause | 30 days | `CREDENTIAL_EXPIRY_WINDOW_DAYS` |
| Advisory needing two approvals | critical | M7 rule |
| Retention trigger / grace | 6 months / 30 days | `RETENTION_*` |
| Resources stale after (M6) | 7 days | `RESOURCES_STALE_DAYS` |
| Reliability floor / answered offers before it applies | 85 % / 5 | `RELIABILITY_FLOOR`, `RELIABILITY_MIN_ANSWERED` |

(b) All the board's rows, the unenforced ones stored for later.
**Recommend (a).** A stored number nothing reads would look authoritative; the earlier decision
"no placeholder pages" applies. The page lists the other board rows as "not enforced yet" so the
desk knows. The reliability floor was in that list until 2026-10-23, when the owner had dispatch
enforce it (and the availability calendar); it is now in the table above.

**D3 · Who changes them, and how the platform reads them.**
(a) A Super Admin proposes a version; a **different** Super Admin applies or rejects it; the
proposer may withdraw it. Only one proposal is pending at a time. The page shows, before saving,
where each changed value is used (the board's "Used by"). The API reads the current version
through a small cache (refreshed on apply in the same process and every 60 s elsewhere, for a
multi-instance deploy), and passes the numbers into the domain functions. The back-office reads
them from `GET /settings/operating` (ops roles); the storefront does not need them.
(b) As (a), but one Super Admin may apply alone when they are the only active one.
(c) Any Super Admin applies alone, audited.
**Recommend (a).** It is what the board asks for, and a shortened retention grace or a raised
refund limit should never rest on one person. A one-person agency keeps changing the defaults by a
deploy. Lowering the retention grace takes effect at the next daily scan, and the page says so.

**D4 · Staff users and invites.**
(a) A `staff_invites` table: email, role, a SHA-256 hash of a single-use token, inviter,
`expires_at` (7 days), `confirmed_by` (required for a Super Admin invite, a different Super
Admin), `accepted_at`, `revoked_at`. The email carries a back-office link with the token; the
invitee signs in with the magic link **as that email** and the API then applies the role and marks
the invite accepted. Invites go only to an address in the manifest's allowed domains, and are
refused for an email that already belongs to a traveler or a supplier (they would need a separate
staff address). The staff list (staff roles only) shows passkeys and the last sign-in, derived
from the existing tables.
(b) Better Auth's admin plugin (its own role and ban fields on the user table).
(c) Keep setting roles in the database by hand.
**Recommend (a).** It needs no new dependency, keeps roles server-owned (`input: false` today),
and never turns a traveler account into a staff one. (b) would add Better Auth's own role model
next to ours. (c) is the gap the board closes.

**D5 · Changing a role, revoking sessions, deactivating.**
(a) Super Admin only: change a staff role (promoting to Super Admin needs a second Super Admin,
as an invite does; the last active Super Admin cannot be demoted or deactivated), revoke all of
a user's sessions (delete their `session` rows), and deactivate (`users.deactivated_at`, sessions
revoked; the auth guard then refuses the user, and reactivation clears it). All audited. The
board's recovery codes are **deferred**: the magic link to the work address is the recovery path,
and a phone-issued code needs its own security review.
(b) Delete staff users instead of deactivating.
**Recommend (a).** Deleting a user would cut the actor link on audit rows (ON DELETE SET NULL)
and lose who did what.

**D6 · The permission matrix and overrides.**
(a) The matrix is read-only, listing what the routes enforce today (one capability per row, the
roles allowed), kept in step with the RBAC matrix test. Per-action overrides with a reason and a
24 h expiry are **deferred**: the routes check roles, not capabilities, so overrides would first
need a capability model in the guard.
(b) Build overrides now: a `permission_overrides` table (user, capability, reason, granted by,
expires at) consulted by the guard.
**Recommend (a).** (b) changes how authorisation decides on every route, which deserves its own
review once the capability list is stable. The board's matrix also differs from the code in a
few places, for example Administrative Support drafting info/caution advisories and uploading
imports (the routes refuse both today, and you decided on 2026-10-20 that support stays
read-only on M6 and M8). The page shows what the code enforces, not the board.

**D7 · Currencies and languages.**
(a) Currencies stay EUR only in M9; the tab says so. Display currencies (an ECB daily rate, a
spread, a rate locked at the deposit) become their own batch, because a locked rate changes the
M4 payment schedule and the invoices, and it needs a finance decision. Languages are derived on
read: coverage per locale from the core catalogs and `tenant/messages`, status from the manifest.
(b) Build display currencies now: an `exchange_rates` table filled by a daily job, conversion on
the storefront, the rate stored on each instalment.
**Recommend (a).** (b) touches money and adds an external feed; it should follow a finance answer
on the spread and the lock.

**D8 · Manifest and feature flags.**
(a) Read-only: the live manifest as the board's preview, a diff against the file in the
repository, and the flags with their descriptions. Changing them stays a commit and a deploy, as
the fork model wants (`tenant/` is the fork's contract; `docs/forking.md`).
(b) Runtime overrides for the feature flags only, stored with the thresholds (D1) and applied
instantly; the rest of the manifest stays a file.
(c) Edit the whole manifest in the database.
**Recommend (a).** Flags are read by the storefront and the back-office at build and render time
from the file; making them runtime means both apps fetch them from the API. (b) can follow, with
no further migration if it rides on `operating_settings`, once you want a rail switched off
without a deploy.

**D9 · Sessions, sign-in links and keys.**
(a) Staff sessions end 12 h after sign-in (the guard refuses an older staff session; travelers
keep Better Auth's 7 days), and the sign-in link lasts 10 minutes (it is already single-use);
both are config values with these defaults. The idle lock on a shared PC, mandatory passkeys, the
IP allowlist and new-device emails are **deferred** (they need the deploy topology and a passkey
rollout). Integration keys show status only (Q12): configured or not, read from the environment,
never a value.
(b) Keep Better Auth's defaults for everyone.
**Recommend (a).** A 7-day staff session on a shared desk PC is the risk the board points at; a
12 h limit for staff is the smallest change that addresses it. Travelers are unaffected.

## 4. Deferred, not in M9

- Unenforced board thresholds (D2): traveler answer SLA, discount review, minimum margin,
  override expiry.
- Recovery codes (D5); permission overrides (D6); display currencies (D7); runtime flags and
  manifest editing (D8); idle lock, mandatory passkeys, IP allowlist, new-device email (D9).
- Key rotation from the UI (Q12: never; rotation stays a deploy operation).

## 5. What lands with M9 once approved

- Migration `settings_and_staff` (§6) and the manifest's `staff.allowedEmailDomains`.
- `@ota/domain`: the thresholds document's defaults (today's constants), the domain functions
  taking it as a parameter (the constants stay as defaults, so nothing else changes), the
  dual-approval rule (proposer ≠ approver, both Super Admins), the invite rules (allowed domain,
  expiry, Super Admin confirmation, no traveler or supplier email), the last-Super-Admin guard.
- `@ota/schemas`: the thresholds document (bounds per value; refund dual ≥ single; the short
  notice timer shorter than the standard one), proposals, staff list, invites, role changes.
- API (every route in the RBAC matrix): `GET /settings/operating` (ops roles);
  `GET|POST /settings/operating/versions`, `POST …/:id/apply|reject|withdraw` (Super Admin);
  `GET /staff`, `POST /staff/invites`, `POST /staff/invites/:id/confirm|revoke|resend`,
  `POST /staff/invites/accept` (authenticated, email must match), `PATCH /staff/:id` (role),
  `POST /staff/:id/revoke-sessions|deactivate|reactivate` (Super Admin); `GET /audit-log`
  (Super Admin). The guard change for deactivated users and the staff session limit.
- Desk: A-Settings as the board's six tabs (Users & roles with invite and actions; Permissions
  read-only; Currencies & languages; Manifest & flags read-only; Approvals & thresholds with the
  proposal, "Used by" and apply/reject; Security & audit with key status and the audit log), in
  en/es/fr. The invite email in `packages/email`.
- e2e: propose and apply a threshold change with two Super Admins, invite and accept an
  Operations Admin, deactivate a user and see them refused.

## 6. The diff

```prisma
/// M9: a thresholds version's life (D1, D3).
enum SettingsVersionStatus {
  PROPOSED
  APPLIED
  REJECTED
  WITHDRAWN
}

/// M9: one version of the operating thresholds (D1). Append-only: only a pending
/// version's status, decider and decision time change.
model OperatingSettings {
  id           String                @id @default(uuid()) @db.Uuid
  version      Int                   @unique
  /// The thresholds document, validated by @ota/schemas before it is written.
  values       Json
  /// Why the change was proposed, shown to the approver.
  reason       String
  status       SettingsVersionStatus @default(PROPOSED)
  proposedById String?               @map("proposed_by_id") @db.Uuid
  decidedById  String?               @map("decided_by_id") @db.Uuid
  decidedAt    DateTime?             @map("decided_at")
  createdAt    DateTime              @default(now()) @map("created_at")

  proposedBy User? @relation("OperatingSettingsProposedBy", fields: [proposedById], references: [id], onDelete: SetNull)
  decidedBy  User? @relation("OperatingSettingsDecidedBy", fields: [decidedById], references: [id], onDelete: SetNull)

  @@index([status, version])
  @@map("operating_settings")
}

/// M9: an invitation to join the desk (D4).
model StaffInvite {
  id            String    @id @default(uuid()) @db.Uuid
  email         String
  role          Role
  /// SHA-256 of the single-use token in the email; the token itself is never stored.
  tokenHash     String    @unique @map("token_hash")
  invitedById   String?   @map("invited_by_id") @db.Uuid
  /// A Super Admin invite is sent only once a second Super Admin confirms it.
  confirmedById String?   @map("confirmed_by_id") @db.Uuid
  confirmedAt   DateTime? @map("confirmed_at")
  expiresAt     DateTime  @map("expires_at")
  acceptedAt    DateTime? @map("accepted_at")
  acceptedById  String?   @map("accepted_by_id") @db.Uuid
  revokedAt     DateTime? @map("revoked_at")
  createdAt     DateTime  @default(now()) @map("created_at")

  invitedBy   User? @relation("StaffInviteInvitedBy", fields: [invitedById], references: [id], onDelete: SetNull)
  confirmedBy User? @relation("StaffInviteConfirmedBy", fields: [confirmedById], references: [id], onDelete: SetNull)
  acceptedBy  User? @relation("StaffInviteAcceptedBy", fields: [acceptedById], references: [id], onDelete: SetNull)

  @@index([email])
  @@map("staff_invites")
}

// On User:
//   deactivatedAt DateTime? @map("deactivated_at")
//   settingsProposed  OperatingSettings[] @relation("OperatingSettingsProposedBy")
//   settingsDecided   OperatingSettings[] @relation("OperatingSettingsDecidedBy")
//   invitesSent       StaffInvite[]       @relation("StaffInviteInvitedBy")
//   invitesConfirmed  StaffInvite[]       @relation("StaffInviteConfirmedBy")
//   invitesAccepted   StaffInvite[]       @relation("StaffInviteAcceptedBy")
```

Database checks the migration would add by hand: at most one `PROPOSED` row (a partial unique
index on `status` where `status = 'PROPOSED'`); a decided row has a decider and a time; a Super
Admin invite is accepted only after it was confirmed; an invite's role is a staff role (not
SERVICE_WORKER or TRAVELER). The API checks the same first.

**Retention.** An invite holds a work email. Closed invites (accepted, revoked or expired) are
deleted 90 days after they close by the existing retention scan; the audit log keeps the event
without the email. Staff accounts stay outside the traveler lifecycle, as today.

The migration would be generated with `pnpm --filter @ota/db exec prisma migrate dev
--create-only --name settings_and_staff` (never `prisma format`), the checks appended to its
SQL, and then applied with `prisma migrate dev`, as M3 and M6 did.

## 7. As built (2026-10-23)

- **Migration** `20261023133937_settings_and_staff` (`eaeb167`): §6 verbatim plus the checks,
  each proved live against the database (a second PROPOSED row, a decided row without a time, a
  TRAVELER invite and an unconfirmed Super Admin acceptance are refused; a valid invite inserts).
  The decided check is `(status = 'PROPOSED') = (decided_at IS NULL)`.
- **Rules** (`5f77503`): `packages/domain/src/settings/operating.ts` (the document, its defaults,
  `thresholdsIssues`, `changedThresholds`, `settingsDecisionRefusal`, `dispatchTimerPolicy`) and
  `settings/staff.ts` (invite states, acceptance and confirmation refusals, the 90-day purge, the
  last-Super-Admin guard, the staff session limit). The dispatch timers, amber share, credential
  window, resources staleness, retention policy (the one reminder stays a week before the
  deadline) and the advisory dual-approval level became optional parameters; the defaults keep
  every caller's behaviour.
- **Choices the doc left open:**
  - The document's defaults are the code's constants plus the manifest's payment window and
    refund limits, merged by the API; a stored version is parsed over the defaults, so a threshold
    added later still has a value. "Reset to spec defaults" proposes exactly those values.
  - A proposal must change something and keep the refund limits rising and the short-notice timer
    shorter (422). Applying re-checks against the values in force. The proposer may withdraw;
    any other Super Admin applies or rejects; the write is conditional on the row still being
    PROPOSED.
  - `advisoryDualApprovalFrom` is CRITICAL (today) or CAUTION; INFO always needs one approval.
  - The API caches the applied version 60 s per process and drops its cache on apply. The desk
    reads `GET /settings/operating`; the storefront does not need it.
  - **Promotion to Super Admin rides on the invite table:** inviting an existing staff member as
    SUPER_ADMIN is allowed (every other existing address is refused), a second Super Admin
    confirms, and the person accepts. So no separate pending-promotion store was needed. A role
    change by PATCH moves only between Operations Admin and Administrative Support; demoting a
    Super Admin is allowed unless they are the last active one.
  - An invite's token is generated when it is sent (at creation, or at confirmation for a Super
    Admin invite) and only its SHA-256 is stored; "send again" replaces it and restarts the 7
    days. Acceptance needs the invited address signed in, and a fresh account (no booking, no
    supplier profile) or a staff member; otherwise 409. A failed email leaves the invite standing
    (send again).
  - Nobody acts on themselves (role, deactivation); signing oneself out everywhere is allowed.
  - The guard reads `deactivatedAt` from the session (a server-owned Better Auth field) and the
    session's `createdAt`; travelers are unaffected. The dashboard layout applies the same 12 h
    rule and sends an expired staff session back to sign in.
  - `STAFF_SESSION_HOURS` (12) and `MAGIC_LINK_EXPIRES_MINUTES` (10) are environment config;
    `BACKOFFICE_PUBLIC_URL` is the invitation link's origin.
  - The audit log tab reads the latest 50 events (`GET /audit-log`, filters by entity type and
    action prefix, paged by `before`). Integration status is `GET /settings/security`, with the two
    limits; values are never returned.
  - The retention scan deletes invites 90 days after they close (`invitesDeleted` in its result).
- **API** (`4724b61`): `GET /settings/operating` (ops roles), the versions and their decisions,
  `GET /settings/security`, `GET /audit-log`, and the `/staff` routes (Super Admin; accepting is
  any signed-in user). All are in the RBAC matrix. Dispatch, payments, refunds, notifications,
  suppliers (and the expiry scan), disruptions, packages, retention, customers and advisories read
  the thresholds in force.
- **Desk** (`d725344`): A-Settings' six tabs; `/invite`; the login's `?next=`; every desk page that
  showed a constant reads the value in force, and the copy that states a threshold takes it as a
  parameter.
- **Email** (`9731f36`): the invitation in en/es/fr, sent in the tenant's primary language.
- **Seed:** `founder@example.test`, a second demo Super Admin (dev data).
- **e2e** (`9964a1a`): propose → second Super Admin applies; invite → sign in → accept → role;
  deactivate → refused.
