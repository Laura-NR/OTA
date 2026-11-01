# M9 permission overrides: policy and schema diff for review

**Status:** **Approved 2026-11-01 as recommended (O1a–O8a, with the migration).**
**Date:** 2026-11-01
**Scope:** the per-action overrides deferred in `docs/schema-m9-settings.md` ("overrides and
display currencies deferred"), which Settings › Permissions still names as "not built yet". The
owner picked them on 2026-11-01. They change how authorisation decides (AGENTS.md Article 2), so
nothing is built before this is approved. They build on the global `AuthGuard`
(`apps/api/src/auth/auth.guard.ts`), the read-only matrix (`apps/backoffice/src/lib/permissions.ts`),
the operating settings document (two Super Admins per change) and the staff emails.

## 1. What the board asks, and what exists

| Board | Today | Where it lands |
|---|---|---|
| A-Settings › Permissions: "Fixed by the spec; overrides are requested per action with a reason and expire after 24 h." | The matrix is shown read-only; its note says overrides are not built | A request with a reason, approved by a Super Admin, for one matrix row, ending on its own (O1, O4, O5) |
| A-States: Support opens a page it can only read → "Read-only view · Request an override (reason · expires 24 h)" | View-only pages hide the actions and say nothing | A notice on each view-only page of an overridable row, with the request dialog (O8) |
| A-Login: "Overrides outside this role go through Settings › Approvals with a mandatory reason"; "every override still needs a reason" | Nothing | Requests and active overrides listed on Settings › Permissions for Super Admins (O8) |
| A-Settings › Thresholds: "Override expiry — Everywhere an override exists" | No such threshold | `overrideExpiryHours`, default 24 (O5) |
| A-Settings: "Every action records actor, time, IP, old → new value, reason and linked record" | Each action writes its own audit row with the actor | Every change made through an override also writes one audit row naming the override (O7) |

## 2. Data changes (this is why it is Article 2)

- **One new table:** `permission_overrides` (§6): who asked, for which matrix row, the reason,
  the state, who decided and when, when it ends, who ended it early. Nothing is backfilled.
- **No column on Better Auth's tables**, no new cookie.
- **One new key in the operating settings document**, `overrideExpiryHours` (integer, default
  24). The document is JSON, so this needs no migration; older versions read the default.
- **Authorisation:** the guard gains a second path (O7). A role that already holds a route is
  unaffected; a role that does not is refused exactly as today unless an approved, unexpired
  override for that route's row exists.
- **Dependencies:** none.

## 3. Decisions (options and recommendation)

**O1 · What an override grants.**
(a) **One matrix row, "Yes", for one person, for a limited time.** The person names the row
("Payments, proofs and refunds") and why; while it lasts the API lets them use that row's
routes as an Operations Admin can.
(b) **One action on one record** ("confirm this proof on VX-6TR2PW"), used once. The most
precise, but every write route would have to name the record it touches, and the person must
know the exact action before seeing it.
(c) **A temporary role** (Support becomes Operations Admin for 24 h). Simplest, and far too
broad: it reaches every row and counts in approvals.
**Recommend (a).** It is the board's unit (the matrix row the A-States page belongs to), it maps
onto the existing route groups, and O7's audit row still records each action and its record.

**O2 · Which rows can be overridden.**
(a) **Only rows a role can already view** (Administrative Support: bookings, dispatch,
suppliers, advisories, disruptions, payments, catalog, customers). Never the Super Admin rows:
users and roles, thresholds, security and the audit log, the OFAC export. Operations Admin
therefore has nothing to request; every row they lack is a Super Admin row.
(b) As (a), plus *proposing* a threshold change, as the A-States drawing shows for Support.
(c) Every row except users and roles.
**Recommend (a).** The Super Admin rows are the ones guarded by a second Super Admin or by the
five-year OFAC archive; an override there would turn "two Super Admins" into "a Super Admin and
anyone they approve". Under (a) Support on Settings sees the read-only view and the names of who
can change it, without the request button; the board's drawing differs on that one button and
the ADR records it.

**O3 · Approvals stay with the role.**
(a) **An override never counts as an approval.** Approving a refund, approving an advisory and
approving a supplier application (which creates an account) stay with the roles that hold them
today; those three routes are marked not overridable. Two-Super-Admin saves are already Super
Admin rows (O2).
(b) The override holder approves as an Operations Admin would.
**Recommend (a).** The approval limits ("€ 500–2,000 dual") assume two people who each hold the
role; under (b) a Support member with an override and one Operations Admin would make a dual
approval out of one approver's decision. The board's own rule for force majeure is the same:
it "overrides the policy table but not the approvals".

**O4 · Who grants it.**
(a) **The person requests; any one active Super Admin approves or declines** (an optional note).
A request no one answers lapses after 24 h. One open request or active override per person and
row (a second is refused with 409).
(b) Two Super Admins approve.
(c) No approval: the person states a reason and the override starts at once ("break glass"),
reviewed afterwards from the audit log.
**Recommend (a).** The board says overrides "go through Settings › Approvals", which (c) skips.
The team is small, the grant is one row for at most a day, and the second Super Admin of (b)
would often not be reachable. A Super Admin never needs one (they hold every row), so no one
approves their own.

**O5 · How long it lasts.**
(a) **A threshold, `overrideExpiryHours`, default 24, from 1 to 24,** changed like the other
thresholds (one Super Admin proposes, a second applies). The clock starts at approval; a change
to the threshold applies to overrides approved after it. An override also ends early when a
Super Admin ends it, when the holder gives it back, and when the holder's role is changed, the
account is deactivated, their passkeys are reset or a recovery code is issued for them (the
last three already end sessions because a compromise is suspected; the new-device email did the
same in N6a).
(b) A fixed 24 h in code.
**Recommend (a).** The board draws the row on Thresholds; the cap of 24 keeps the board's
"expire after 24 h" as the longest.

**O6 · Where overrides are kept.**
(a) **Migration: a `permission_overrides` table** (§6), indexed on person and row so the guard's
lookup is one small query.
(b) No migration: derive overrides from audit rows. Every refused request would scan the audit
log, and an audit row cannot be "ended".
**Recommend (a).**

**O7 · How the API decides, and what is audited.**
(a) **Each controller (or route, where a controller spans rows) is tagged with its matrix row.**
When the role check fails, the guard looks for an approved, unexpired override for the person
and that row; untagged routes and O3's approval routes never pass. No cache, so ending an
override takes effect on the next request. Every change (POST, PUT, PATCH, DELETE) let through
by an override writes one audit row, `permission.override_used`, naming the override, the
method, the route and the record id from the path; the action's own audit row is unchanged.
Reads need nothing: the row is already "View". Sockets are unchanged (Support already joins
the desk's sockets).
(b) As (a), but only granting and ending are audited.
**Recommend (a).** It is the board's "every action records … reason and linked record": the
override's reason plus the record in the path. Tagging also makes the matrix the code's own
list instead of a copy kept in step by hand: the desk reads the rows from `@ota/domain`.

**O8 · Telling people.**
(a) **A request emails every active Super Admin** (work address, tenant primary language): who,
which row, the reason, and a link to Settings › Permissions. The requester sees the decision on
the page; no email to them.
(b) No email; Super Admins check the tab.
**Recommend (a).** A request made in the evening would otherwise wait unseen until it lapses.

**The screens** (not a choice, listed for review; en/es/fr):
- Each page of an overridable row, for a person who can only view it: a notice under the page
  header — "Your role can view payments. Request an override" — opening a dialog with the row
  named, a required reason and "expires 24 h after approval". While pending: "Override
  requested at 14:02, waiting for a Super Admin." While active: "Override active for payments
  until 15:40 · Give it back"; the page's actions appear as for an Operations Admin.
- Settings › Permissions (Super Admins): "Override requests" (person, row, reason, asked at,
  Approve / Decline with a note) and "Active overrides" (person, row, until, reason, approved
  by, End). The matrix note changes from "not built yet" to how overrides work.
- Settings › Thresholds: "Override expiry" in the Security group, with the two-Super-Admin save.
- Settings › Security: the audit log already shows the new actions (`permission.override_*`).

## 4. Deferred, not in this batch

- One-record, one-use overrides (O1(b)) and a Super Admin granting without a request.
- Operations Admin overrides into Super Admin rows (O2(c)).
- Two other board items that use the word but are separate features: A-Payments' "Confirm now
  on proof (Operations Admin override)" and A-Package-Edit's per-date availability override.
- Impersonation (Super Admin only, with the traveler's consent on file).

## 5. What lands once approved

- Migration `permission_overrides` (§6), only with O6(a).
- `@ota/domain`: the matrix rows (moved from the desk), which rows each role may request (O2),
  the routes never overridable (O3), the override's state from its row and the clock
  (requested, lapsed, active, expired, ended), and the expiry from the threshold. Unit tests.
- `@ota/schemas`: the request, decision and end bodies; the override DTO;
  `overrideExpiryHours` in the thresholds document.
- API: a `@Capability(row)` tag on every staff controller, the guard's override path, the
  `permission.override_used` audit row, the routes below, the Super Admin email, and O5's early
  ends in `StaffService`. The RBAC matrix gains the new routes and override cases (an active
  override passes its row's write route; it never passes another row, an approval route or a
  Super Admin route; an expired or ended one is 403).
  - `POST /permission-overrides` `{capability, reason}` (staff)
  - `GET /permission-overrides/mine` (staff)
  - `GET /permission-overrides` (Super Admin: open requests, active, last 30 days)
  - `POST /permission-overrides/:id/approve` and `/decline` `{note?}` (Super Admin)
  - `POST /permission-overrides/:id/end` `{note?}` (Super Admin, or the holder)
- `packages/email`: the request email to Super Admins.
- Desk (en/es/fr): the screens above; each view-only page decides its actions from the role
  *or* an active override for its row.
- e2e (owns `override-e2e-*@example.test`): Support asks for "payments" with a reason, a Super
  Admin approves on Settings › Permissions, Support now records a payment action and the audit
  log shows `permission.override_used`; Support still cannot approve a refund; the Super Admin
  ends it and the action is gone; a request reaches Mailpit.
- Docs: ADR 0006's amendment, the runbook (granting and ending an override), the handoff.

## 6. The diff

```prisma
/// A time-limited grant of one permission-matrix row to one staff member
/// (docs/schema-m9-permission-overrides.md).
model PermissionOverride {
  id           String                  @id @default(uuid()) @db.Uuid
  userId       String                  @map("user_id") @db.Uuid
  /// A matrix row key from @ota/domain (`payments`, `catalog`, …).
  capability   String
  reason       String
  state        PermissionOverrideState @default(REQUESTED)
  requestedAt  DateTime                @default(now()) @map("requested_at")
  decidedById  String?                 @map("decided_by_id") @db.Uuid
  decidedAt    DateTime?               @map("decided_at")
  decisionNote String?                 @map("decision_note")
  /// Set at approval: decidedAt + overrideExpiryHours (O5).
  expiresAt    DateTime?               @map("expires_at")
  /// Ended before expiresAt by a Super Admin, the holder, or a reset (O5).
  endedById    String?                 @map("ended_by_id") @db.Uuid
  endedAt      DateTime?               @map("ended_at")
  endNote      String?                 @map("end_note")

  user      User  @relation("PermissionOverrideUser", fields: [userId], references: [id], onDelete: Cascade)
  decidedBy User? @relation("PermissionOverrideDecidedBy", fields: [decidedById], references: [id], onDelete: SetNull)
  endedBy   User? @relation("PermissionOverrideEndedBy", fields: [endedById], references: [id], onDelete: SetNull)

  @@index([userId, capability, state])
  @@map("permission_overrides")
}

/// Lapsed requests and expired overrides are derived from the clock, not stored.
enum PermissionOverrideState {
  REQUESTED
  APPROVED
  DECLINED
  ENDED
}
```

`User` gains the three back-relations. The migration only creates the table, the enum and the
index; no existing row changes.
