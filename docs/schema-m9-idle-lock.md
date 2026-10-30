# M9 desk idle lock: policy and schema diff for review

**Status:** Proposal, for the owner's approval. Nothing is built.
**Date:** 2026-10-30
**Scope:** the idle lock deferred under D9 in `docs/schema-m9-settings.md` ("the idle lock on a
shared PC"), which the owner picked next on 2026-10-30. D9 deferred it until the passkey
rollout, which landed on 2026-10-26 (`docs/schema-m9-passkeys.md`). It builds on the auth guard
and `SessionPolicy` (`apps/api/src/auth/`), Better Auth's passkey sign-in and its `before` hook
(`packages/auth`), the operating settings document (two Super Admins to apply) and the board's
A-States 02 "Shared desk PC · idle lock after 30 min".

## 1. What the board asks, and what exists

| Item | Today | Where it lands |
|---|---|---|
| A staff session left alone | Works until 12 h after sign-in (D9), whoever sits down | Locks after N minutes with no input (L1, L3, L6) |
| Lock screen | None | A-States 02: "Locked · <name>", "No input for 30 minutes. The page you were on is kept; timers kept running on the server.", Unlock with passkey, "Not <name>? Sign in" (L4, L7) |
| Where the lock holds | n/a | On the server: the guard, both sockets and Better Auth's own routes refuse a locked session (L2, L5) |
| Settings | Security tab shows "Staff session 12 h" as a fact | "Idle lock" joins the thresholds (L6) and the Security facts |
| Login copy | Board: "Sessions last 12 h on a personal device, 30 min idle on the shared desk PC." | The login page states the rule as built (L1) |
| Travelers and suppliers | Unaffected | Unaffected: staff roles only (`STAFF_ROLES`) |

**Gaps that already exist, fixed in this batch whatever you decide:**

- The `/ops` and `/conversations` sockets check the session only when they connect
  (`apps/api/src/escalation/escalation.gateway.ts:53`, `apps/api/src/messages/messaging.gateway.ts:49`).
  A deactivated user or a staff session past its 12 h keeps receiving the feeds until the
  socket drops. A once-a-minute re-check closes this, and the lock needs it anyway (L5).
- Better Auth's routes (`/api/auth/*`) never pass the Nest guard, so a deactivated user or an
  expired staff session can still call the ones that act on a session (update the user, list or
  revoke sessions, the passkey routes when the passkey rule allows it). The same `before` hook
  that L5 adds refuses them.

## 2. Data changes (this is why it is Article 2)

- **Migration (L1(b) and L2(a)):** two columns on Better Auth's `session` table, in its own
  naming (camelCase, no `@map`), declared as server-owned session fields (`input: false`):
  - `lastActiveAt` (nullable timestamp): the last time the desk reported input. Null, as on
    every session from before the change, reads as the sign-in time, so it fails closed.
  - `ownDevice` (boolean, default false): the person said at sign-in that this is their own
    device (L1(b) only).
  Nothing is backfilled. When it deploys, every staff session that has been idle for longer
  than the limit locks once: unlock it with a passkey or sign in again.
- **No migration for the limit:** `staffIdleLockMinutes` joins the thresholds document in
  `operating_settings.values`; versions saved before the change have no such key and read as
  the default.
- **Behaviour changes that need your approval:** the guard, both sockets, the T-Events intake
  and Better Auth's session routes refuse a locked staff session (L5); unlocking is a new
  passkey sign-in (L4).
- **Dependencies:** none. The unlock uses the passkey client the desk already has; the e2e
  uses Chromium's virtual authenticator, as `e2e/passkeys.spec.ts` does.

## 3. Decisions (options and recommendation)

**L1 · Which sessions lock.** The board locks "the shared desk PC" and gives a personal device
12 h, but the platform does not know which computer is which.
(a) Every staff session locks after the limit, wherever it is.
(b) Every staff session locks, unless the person ticks "This is my own device" at sign-in. The
login page remembers the choice in that browser only (so the shared PC keeps showing it
unticked), the desk sends it once after sign-in, and it is stored on the session (`ownDevice`)
and audited (`auth.session_own_device`). An own-device session keeps the 12 h limit with no
idle lock. A link opened in another browser carries no choice, so that session locks.
(c) A Super Admin marks users who work on the shared PC; only their sessions lock.
**Recommend (b).** It is the board's rule. With (a) an Operations Admin watching the
escalation desk on their own laptop, with no input for half an hour, stops receiving red alerts
until they unlock. The tick is the person's own statement, but only an active, unlocked session
can make it, so it cannot unlock anything. (c) fails open: one person on two computers, or a
new hire not yet marked.

**L2 · Where the last input time is kept.**
(a) **Migration:** `session.lastActiveAt`, written by the activity route (L3) and read with the
session the guard already loads, so no extra query per request.
(b) **No migration:** reuse `session.updatedAt`. Better Auth also writes it when it refreshes a
session, so the meaning would be shared, and a Better Auth upgrade could start writing it on
reads and quietly keep every desk unlocked.
(c) Redis or memory: Redis is optional here (`REDIS_URL` may be unset) and memory is per process
and lost on a restart.
**Recommend (a).** It fails closed and means one thing.

**L3 · What counts as activity.**
(a) A key press, click, touch, wheel or pointer movement in any desk tab. The tabs share the
latest input time in the browser, and the desk reports it with `POST /me/activity` at most
once a minute while there is input. Nothing else moves the clock: the dashboard's refreshes,
the sockets and the telemetry do not.
(b) Any authenticated API request.
**Recommend (a).** With (b) the desk's own background calls would keep an unattended screen open
for ever. A locked session cannot report activity (the guard refuses it first), so the route
cannot unlock anything.

**L4 · How to unlock.**
(a) "Unlock with passkey" signs in with a passkey where the page is, so the page stays as it
was, and the new session picks up from there. If the passkey belongs to someone else, the desk
reloads as that person on the dashboard. Someone with no passkey gets "Sign in again" (a link,
which returns them to the same address; unsaved input on the page is lost). "Not <name>? Sign
in" signs out and opens the login page. An unlock is a full sign-in, so it also starts a new
12 h session; the locked session's row stays refused until it expires.
(b) Re-verify the passkey against the same session: it needs our own WebAuthn challenge store
and `@simplewebauthn/server` as a direct dependency.
**Recommend (a).** It reuses the sign-in that already requires user verification (PIN or
biometric, P6) and adds no dependency.

**L5 · What a locked session can still do.**
(a) Nothing but end itself or sign in again. The guard answers 401 with the code
`SESSION_LOCKED`. The sockets re-check their sessions every minute and drop a locked one (which
also fixes the gap in §1). The T-Events intake refuses it. A Better Auth `before` hook refuses
every session route to a locked, deactivated or expired staff session, except reading the
session, signing out and the sign-in routes. Without that hook, someone at an unattended desk
could add their own passkey through Better Auth and then unlock with it.
(b) Lock the desk's API only and leave Better Auth's routes as they are.
**Recommend (a).** (b) leaves the hole the lock exists to close.

**L6 · The limit and who sets it.**
(a) `staffIdleLockMinutes` in the operating thresholds, default 30 (the board), from 5 to 240
minutes, changed by two Super Admins like every threshold, in a "Security" group beside the
passkey switch. The "Used by" note reads "desk sessions not marked as own device". There is no
off value: an agency that wants it off picks 240.
(b) An environment variable, like `STAFF_SESSION_HOURS`.
**Recommend (a).** It is a security setting the desk should see and change with an audit trail,
as with the passkey switch.

**L7 · The lock screen.**
(a) A full-screen dialog over the desk (A-States 02, existing Card, Button and Alert components,
no new token). The page underneath is hidden and made `inert`, not only covered, so nothing
behind it can be read or focused. The alert cue stops and the sockets close. On unlock the page
re-reads its data and reconnects. Every desk tab locks together. en/es/fr.
(b) Send the person to `/login` and lose the page.
**Recommend (a).** It is the board's state, and "the page you were on is kept" is its promise.
What stays: the page's contents remain in the browser's memory, so someone with developer tools
could read the last page; the lock stops new data and every action, not what was on screen.

## 4. Deferred, not in this batch

- Recovery codes (M9 D5), permission overrides (D6), display currencies (D7), runtime flags
  (D8), the IP allowlist and the new-device email (D9).
- An idle lock for travelers or suppliers (no board).
- Changing "own device" after sign-in (sign in again instead).

## 5. What lands once approved

- Migration `session_idle_lock` (§6).
- `@ota/domain`: `staffIdleLockMinutes` (default 30) in the thresholds document, with older
  versions read as the default; a pure `staffSessionLocked({ role, ownDevice, lastActiveAt,
  signedInAt, now, minutes })` and the browser's reporting rule (report at most once a minute).
  Unit tests for each.
- `@ota/schemas`: the thresholds field (5–240) and the own-device body.
- `packages/auth`: the two session fields, and a `before` hook on Better Auth's session routes
  that asks a check injected by the API (L5).
- API: `sessionRefusal` gains the lock (401 `SESSION_LOCKED`), shared by the guard, both sockets
  (now re-checked every minute) and the T-Events intake; `POST /me/activity` and
  `POST /me/session/own-device` (any staff role; refused once locked), both in the RBAC matrix.
- Desk (en/es/fr): the activity reporter and the lock dialog in the dashboard layout; the
  "This is my own device" box on the login page; the limit on Approvals & thresholds and in the
  Security facts. The lock dialog goes in the axe spec.
- e2e: a session made idle by moving its `lastActiveAt` back (the spec's own Prisma client, as
  fixtures do) is refused by the API and shows the lock; unlocking with a virtual
  authenticator keeps the page; an own-device session does not lock; a locked session cannot
  add a passkey.

## 6. The diff

```prisma
model Session {
  // ... the existing fields ...
  signInMethod String?
  /// The desk's last reported input (docs/schema-m9-idle-lock.md L2), written by
  /// POST /me/activity only. Null reads as the sign-in time.
  lastActiveAt DateTime?
  /// The person said at sign-in that this is their own device (L1(b)): no idle lock.
  ownDevice    Boolean   @default(false)
  // ...
}
```

Migration SQL:

```sql
ALTER TABLE "session" ADD COLUMN "lastActiveAt" TIMESTAMP(3);
ALTER TABLE "session" ADD COLUMN "ownDevice" BOOLEAN NOT NULL DEFAULT false;
```

With L1(a) or (c) the `ownDevice` column is dropped from the diff.
