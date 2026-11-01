# M9 staff recovery codes: policy and schema diff for review

**Status:** **Approved 2026-11-01 as recommended (R1a–R5a, with the migration).**
**Date:** 2026-11-01
**Scope:** the recovery codes deferred under D5 in `docs/schema-m9-settings.md` ("a phone-issued
code needs its own security review") and again under P5 in `docs/schema-m9-passkeys.md`, which
the owner picked on 2026-11-01. It builds on the staff routes (`apps/api/src/staff/`, the
"Reset passkeys" path), `SessionPolicy` and the guard (`apps/api/src/auth/`), Better Auth's
plugin endpoints (`packages/auth`), the desk's `/passkeys` setup page and the board's A-Settings
"Recovery" block and A-Login note.

## 1. What the board asks, and what exists

| Item | Today | Where it lands |
|---|---|---|
| A-Settings › Security, "Recovery" | Not shown | "No self-service reset exists. A Super Admin issues a one-time recovery code by phone or in person; the code works for 15 minutes and is logged with both names." with "Issue recovery code…" (R1, R6) |
| A-Login | Not shown | "Lost access to your email? A Super Admin issues a one-time recovery code in Settings › Users; there is no self-service reset." and a way to type the code (R6) |
| A-Settings permission matrix | "Users, roles, recovery codes": Super Admin only | Unchanged: the Users & roles routes are already Super Admin only |
| Lost passkey device, email works | A Super Admin resets the passkeys (P5); the person signs in by link and enrolls again | Unchanged |
| Lost email (and no usable passkey) | No way back in: the link goes to a mailbox the person cannot open | A Super Admin issues a code; the person types it at the desk login and sets up a passkey (R1, R3) |
| The last Super Admin loses everything | `STAFF_PASSKEYS_OVERRIDE=off` plus a link to the work address | Unchanged: nobody is left to issue a code (R5) |
| Travelers and suppliers | Unaffected | Unaffected: staff roles only (`STAFF_ROLES`) |

**The design differs from "recovery codes" in the usual sense.** Many products give each person
a printed set of backup codes they use themselves. The board says the opposite: "no
self-service reset", one code at a time, issued by a second person. R1 asks you to confirm the
board's model. (The option offered when you picked this batch said "without help"; that was my
wording, not the board's.)

## 2. Data changes (this is why it is Article 2)

- **One new table (R2(a)):** `staff_recovery_codes`, one row per issued code: whose it is, who
  issued it, the SHA-256 of the code (the code itself is never stored), when it expires, how
  many wrong tries it has had, and when it was used or withdrawn. Nothing is backfilled.
- **No new column on Better Auth's tables.** A recovery sign-in records
  `session.signInMethod = 'recovery_code'` in the existing column (`docs/schema-m9-passkeys.md`
  P2), which already counts any value other than `passkey` as "not a passkey".
- **Behaviour changes that need your approval:** a new public sign-in route,
  `POST /api/auth/sign-in/recovery-code`, that creates a staff session from an email and a code
  (R3, R4); issuing a code removes the person's passkeys and ends their sessions (R3); a
  recovery session can only set up a passkey, whatever the passkey switch says (R3).
- **Dependencies:** none. The route is a Better Auth plugin endpoint in `packages/auth`, built
  the way Better Auth's own anonymous sign-in is (`createAuthEndpoint`,
  `internalAdapter.createSession`, `setSessionCookie`); the code comes from `node:crypto`.

## 3. Decisions (options and recommendation)

**R1 · What a recovery code is.**
(a) The board's model: a Super Admin issues a code for another staff member, with a reason. The
desk shows it once, to be read out by phone or in person. It works once, for 15 minutes, and
issuing a new one withdraws the open one. The audit row names both people
(`staff.recovery_code_issued`), and the person's work address gets an email saying who issued
it, so a code obtained by impersonation is noticed when the real person reads their mail.
(b) Self-service backup codes: each staff member generates ten codes, prints or stores them,
and uses one alone.
(c) Both.
**Recommend (a).** It is the board's rule, and a lost mailbox is exactly when a second person
should check who is asking. (b) puts a paper credential next to every desk, cannot be audited
when it is handed over, and contradicts "no self-service reset". What (a) does not solve: the
last Super Admin (R5).

**R2 · Where codes are kept.**
(a) **Migration:** a `staff_recovery_codes` table (§6), with a foreign key to the person and to
the issuer, the code's hash, its expiry, a wrong-try counter and when it was used or withdrawn.
The reason goes in the audit row, as it does for "Reset passkeys".
(b) **No migration:** Better Auth's `verification` table, with the identifier
`staff-recovery:<userId>` and the hash and wrong-try count packed into its text `value`; the
issuer only in the audit row.
**Recommend (a).** The codes are our own authentication state, and (a) keeps it typed and
readable on review. (b) works, but stores our rule's counter inside a text column of a Better
Auth table that Better Auth reads, writes and cleans on its own rules; a Better Auth upgrade
could change that without our tests noticing.

**R3 · What a recovery sign-in opens.**
(a) Only passkey setup. The session is recorded as `recovery_code`. Whatever the passkey switch
says, the guard treats it as a setup-only session (P3): every desk route answers 403
`PASSKEY_SETUP_REQUIRED` except `GET /me` and `GET /me/passkeys`, and the desk sends the person
to `/passkeys` to add a passkey and then sign in with it. The session ends 15 minutes after it
starts. Issuing the code also removes the person's passkeys and ends their sessions, as
"Reset passkeys" does, because a session that did not come from a passkey may add only a first
passkey (P4). The issue dialog says so when the person has any.
(b) A normal desk session, like a sign-in link: the full desk while the passkey switch is off,
setup only while it is on.
**Recommend (a).** A code read out over the phone should open as little as possible. With (a)
the person leaves with a passkey, so they do not need another code while their mailbox is
still out, and the flow reuses the setup page that already exists. Removing the old passkeys
also makes an impostor's use visible: the real person's passkey stops working. The cost: a
staff member must be at a device that can make a passkey (every browser the desk supports
can), and with the switch off, a code still does not give the desk directly.

**R4 · The code, and limits on guessing.**
(a) Twelve characters from an alphabet with no look-alikes (Crockford's base 32: no I, L, O or
U), shown as `XXXX-XXXX-XXXX` (about 60 bits). It is accepted in any case, with or without the
hyphens and spaces, and stored as SHA-256. Five wrong codes for the same person withdraw it.
The route sits under `/api/auth/sign-in/`, so the existing strict limit for sign-in routes
applies (`RATE_LIMIT_AUTH_MAX`, 30 a minute per IP). Every failure gets the same answer ("This
code is not valid; ask a Super Admin for a new one"), whether the email is unknown, not staff,
deactivated, the code expired, was used, or is wrong, so the route reveals nothing about who
is staff. A use, and a code withdrawn by wrong tries, are audited
(`auth.recovery_code_used`, `auth.recovery_code_voided`).
(b) A six-digit number: easier to read out, but about 20 bits, so it relies on the try limit
alone.
**Recommend (a).** Three groups of four are still easy to say over the phone, and guessing is
out of reach even before the try limit.

**R5 · Who issues, for whom.**
(a) Any Super Admin, for another active staff member (never oneself, the same check as "Reset
passkeys"); one Super Admin is enough, also when the person is a Super Admin. The last Super
Admin keeps the break-glass of P5 (`STAFF_PASSKEYS_OVERRIDE=off` and a link), and the runbook
says that a Super Admin who has also lost their mailbox needs a second Super Admin.
(b) A code for a Super Admin needs a second Super Admin to confirm, as an invite does.
**Recommend (a).** With (b) a two-Super-Admin agency could never recover either of them: the
only other Super Admin is the issuer. Both names are in the audit row and the email either way.

**R6 · The screens.** Not a choice, listed for review (en/es/fr):
- Users & roles: "Issue recovery code…" in a staff row's actions (Super Admin; not on one's own
  row). The dialog asks for a reason and warns when the person's passkeys will be removed, then
  shows the code once with the time it expires: "Read it to them by phone or in person. It is
  not shown again." The row shows "Recovery code open until 14:32" with "Withdraw code" while
  one is open.
- Security: the board's "Recovery" fact.
- Login: the board's "Lost access to your email?…" line and a "Use a recovery code" form
  (work email and code) that leads to `/passkeys`.
- Emails to the work address: "A recovery code was issued for your account by <name>" and
  "Your recovery code was used to sign in", in the tenant's primary language like the passkey
  emails.

## 4. Deferred, not in this batch

- Self-service backup codes (R1(b)).
- Recovery for travelers (they sign in by link to their own mailbox; no board).
- A recovery path for the last Super Admin that needs no deploy (R5).

## 5. What lands once approved

- Migration `staff_recovery_codes` (§6), only with R2(a).
- `@ota/domain`: a pure module for the rules: the code's format, normalising what was typed,
  whether a code is open, the wrong-try limit, who may issue for whom, and that a
  `recovery_code` session is setup-only and ends after 15 minutes. Unit tests for each.
- `@ota/schemas`: the issue request (reason), the issued code response, the open code on the
  staff DTO (expiry only), and the sign-in body.
- `packages/auth`: the `/sign-in/recovery-code` endpoint, which asks a check injected by the API
  (as the passkey policy is) and then creates the session; `signInMethodForPath` maps it to
  `recovery_code`.
- API: `POST /staff/:id/recovery-code` and `POST /staff/:id/recovery-code/withdraw` (Super
  Admin), both in the RBAC matrix; the check behind the sign-in route; `SessionPolicy` treating
  a `recovery_code` session as setup-only; the audit rows and two emails in `packages/email`.
- Desk (en/es/fr): R6. The issue dialog and the login form go in the axe spec.
- e2e (owns `recovery-e2e-*@example.test`): a Super Admin issues a code for a staff member who
  has a passkey; the code signs in once, reaches only `/passkeys` and is refused elsewhere;
  the person enrolls with a virtual authenticator and signs in with it; the old passkey is
  gone; a second use, a wrong email and five wrong tries are refused alike; both emails reach
  Mailpit.
- Docs: the runbook's lost-access playbook, ADR 0006's amendment, the handoff.

## 6. The diff

```prisma
/// A one-time code a Super Admin issues for a staff member who lost access
/// (docs/schema-m9-recovery-codes.md). The code itself is never stored.
model StaffRecoveryCode {
  id             String    @id @default(uuid()) @db.Uuid
  userId         String    @map("user_id") @db.Uuid
  /// SHA-256 of the normalised code (R4).
  codeHash       String    @map("code_hash")
  issuedById     String?   @map("issued_by_id") @db.Uuid
  expiresAt      DateTime  @map("expires_at")
  /// Wrong codes typed for this person while the code was open; the fifth withdraws it.
  failedAttempts Int       @default(0) @map("failed_attempts")
  usedAt         DateTime? @map("used_at")
  /// Replaced by a newer code, withdrawn by a Super Admin, or by wrong tries.
  withdrawnAt    DateTime? @map("withdrawn_at")
  createdAt      DateTime  @default(now()) @map("created_at")

  user     User  @relation("StaffRecoveryCodeUser", fields: [userId], references: [id], onDelete: Cascade)
  issuedBy User? @relation("StaffRecoveryCodeIssuedBy", fields: [issuedById], references: [id], onDelete: SetNull)

  @@index([userId])
  @@map("staff_recovery_codes")
}

model User {
  // ... the existing fields and relations ...
  recoveryCodes       StaffRecoveryCode[] @relation("StaffRecoveryCodeUser")
  recoveryCodesIssued StaffRecoveryCode[] @relation("StaffRecoveryCodeIssuedBy")
}
```

The relation fields on `User` add no column. The migration creates the table, its index and
the two foreign keys; Prisma generates the SQL.
