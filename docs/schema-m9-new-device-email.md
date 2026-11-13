# M9 new-device email: policy and schema diff for review

**Status:** **Approved 2026-11-01 as recommended (N1a–N6a, with the migration) and built the
same day** (§7).
**Date:** 2026-11-01
**Scope:** the new-device email deferred under D9 in `docs/schema-m9-settings.md` ("the IP
allowlist and new-device emails are deferred") and again in `docs/schema-m9-passkeys.md` and
`docs/schema-m9-idle-lock.md`. The owner picked it on 2026-11-01. It builds on Better Auth's
session hooks (`packages/auth`, where `signInMethod` is already recorded), the passkey emails
(`packages/email/src/templates/passkey-change.ts`), the operating settings document (two Super
Admins per change) and the board's A-Settings › Security block.

## 1. What the board asks, and what exists

| Item | Today | Where it lands |
|---|---|---|
| A-Settings › Security, "Email the user on every new device sign-in" (a checkbox, drawn ticked) | Not built; Security says "The IP allowlist and new-device emails are not built yet." | A switch in the operating settings, on by default, shown on Security (N5) |
| Knowing a device was seen before | Nothing: a `session` row keeps an IP and a user agent, but it is deleted at sign-out or expiry | A per-browser device cookie and a `staff_known_devices` table (N1, N2) |
| A staff sign-in from a browser not seen before | Nothing happens; the passkey emails cover only passkey changes | An email to the work address (time, browser and system, IP, how they signed in) and an audit row (N3) |
| "Every sign-in is written to the audit log" (A-Login) | Only recovery-code use and the own-device mark are audited | New-device sign-ins are audited; auditing every sign-in stays deferred (§4) |
| Travelers and suppliers | Unaffected | Unaffected: staff roles only (N4) |

## 2. Data changes (this is why it is Article 2)

- **One new table (N2):** `staff_known_devices`, one row per browser a staff member has signed in
  from: whose it is, the SHA-256 of the device cookie (the cookie value itself is never stored),
  a short label such as "Firefox on Windows", and when it was first and last seen. Nothing is
  backfilled, so every staff browser is new once after this ships (N3).
- **No new column on Better Auth's tables.**
- **One new key in the operating settings document**, `staffNewDeviceEmail` (boolean, default
  true). The document is JSON, so this needs no migration; versions saved before it read the
  default, as the feature flags did.
- **A new cookie on the desk origin**, `ota_device` (HttpOnly, SameSite=Lax, Secure outside
  localhost, about 400 days, renewed at each sign-in). It holds only a random value; it is
  strictly necessary for a security function, so it falls under the cookie notice's "essential"
  group like the session cookie (counsel already holds the cookie words).
- **Dependencies:** none. The cookie value comes from `node:crypto`; the label is read from the
  user agent with a few plain patterns, not a parsing library.

## 3. Decisions (options and recommendation)

**N1 · What "a device" is.**
(a) **A device cookie.** At each staff sign-in the server reads `ota_device`; if it is missing or
its hash is not on file for this person, the sign-in is from a new device: the server records it
and sets a fresh cookie. One browser profile = one device. Clearing cookies or a private window
counts as new.
(b) **The user agent and IP.** No cookie, but Cuban IPs change often and browsers update their
user-agent string monthly, so most sign-ins would read as new and the emails would be ignored.
(c) **The passkey used.** Synced passkeys follow a person across phones and laptops, and a sign-in
link or a recovery code uses no passkey, so it misses the cases that matter most.
**Recommend (a).** It is what "new device" means to the reader of the email, it works for every
sign-in method, and the server never learns more than "this browser was here before".

**N2 · Where known devices are kept.**
(a) **Migration:** a `staff_known_devices` table (§6), keyed by the cookie's hash, with a foreign
key to the person (deleted with them).
(b) **No migration:** a list of hashes inside a JSON column added to `user`.
**Recommend (a).** (b) is also a migration, onto Better Auth's own table, and a JSON list cannot
be indexed or pruned by date. A device unseen for 180 days is forgotten (deleted at that person's
next sign-in, so no job is needed) and its next sign-in reads as new again.

**N3 · What happens on a new device.**
(a) Every staff sign-in from an unknown device, including a person's very first one, sends one
email to the work address: "New sign-in to your Vereda desk account" with the time (in the
tenant's time zone), the browser and system, the IP address, and how they signed in (passkey,
sign-in link, recovery code). It ends: "If this was you, there is nothing to do. If it was not,
tell a Super Admin now: they can end your sessions and reset your passkeys." It is audited as
`auth.new_device_sign_in` (the person as actor; label, IP and method in the metadata). The email
and the audit row never delay or block the sign-in; a failed send is logged.
(b) The same, but a person's first device is recorded silently, so the first sign-in after
this ships (and a new colleague's first sign-in) sends nothing.
**Recommend (a).** Under (b) an intruder whose first sign-in happened to be the person's first
recorded one would go unnoticed. The cost of (a) is one email per staff browser in the first days
after it ships, which for a small team is a handful of messages; the email's wording makes that
harmless.

**N4 · Who it covers.**
(a) **Staff only** (`STAFF_ROLES`), whatever the sign-in method, on the desk.
(b) Staff and travelers.
**Recommend (a).** It is the board's Security block, which concerns the desk. Travelers sign in
almost always by a link to their own mailbox, so an email saying they signed in tells them what
they just did; their sessions cannot reach the desk. A traveler email can be its own batch.

**N5 · The switch.**
(a) `staffNewDeviceEmail` in the operating settings, on by default, changed like the passkey
switch: one Super Admin proposes, a second applies. Devices are recorded whether it is on or off,
so turning it back on does not email about every browser again. Security shows it among
"Sessions & sign-in", replacing half of the "not built yet" note (the IP allowlist stays there).
(b) An environment variable: a change is a deploy.
**Recommend (a).** Turning the email off weakens a security control, which is exactly what the
two-person settings change already guards. (b) hides the setting from the desk the board draws.

**N6 · What a reset forgets.**
(a) "Reset passkeys", issuing a recovery code and deactivating a person also forget that
person's known devices, so after any of them every browser is new again. The three already end
the person's sessions because a compromise is suspected; a device the intruder used should not
stay "known".
(b) Devices are forgotten only by age (N2).
**Recommend (a).** It is one `deleteMany` in each of the three transactions, and it means the
next sign-in after a suspected compromise is always announced.

**N7 · The screens and emails.** Not a choice, listed for review (en/es/fr):
- Security › Sessions & sign-in: a fact "New-device email: On / Off" with the board's sentence,
  and a link to the setting on the Thresholds tab, where the switch sits next to "Passkeys
  required" with the same two-Super-Admin save.
- The email, in the tenant's primary language like the passkey emails, from the existing
  `passkey-change` shell with the agency's branding.
- No new desk page: a list of one's own known devices ("forget this device") is deferred (§4).

## 4. Deferred, not in this batch

- Auditing every sign-in (A-Login's "Every sign-in is written to the audit log"); today only
  new-device sign-ins, recovery-code use and the own-device mark are audited.
- A "your devices" list with "forget" on the staff member's own page.
- Travelers (N4(b)).
- The IP allowlist (it depends on the deploy topology's proxy, plan D8/D9).

## 5. What lands once approved

- Migration `staff_known_devices` (§6), only with N2(a).
- `@ota/domain`: a pure module: the device label from a user agent, when a device is stale
  (180 days), and whether a sign-in should email (staff role, unknown device, switch on). Unit
  tests for each.
- `@ota/schemas`: `staffNewDeviceEmail` in the thresholds document (default true) and on the
  security DTO.
- `packages/auth`: an injected `DeviceCheck` (as the passkey policy is) that the `after` hook
  calls when a route created a session (`ctx.context.newSession`) with the request's
  `ota_device` cookie, user agent, IP and `signInMethod`; it sets the cookie the API returns.
- API: the check (record or refresh the device, prune stale ones, email and audit when new),
  `staffNewDeviceEmail` in the settings defaults and the security view, and N6 in
  `StaffService`. No new route, so the RBAC matrix is unchanged.
- `packages/email`: a `new_device` kind in the passkey-change template.
- Desk (en/es/fr): N7. Security's note drops "new-device emails".
- e2e (owns `new-device-e2e-*@example.test`): a staff member signs in by link in a fresh browser
  context and the email reaches Mailpit with the browser label; signing in again in the same
  context sends nothing; a second context sends a second email; after a Super Admin's "Reset
  passkeys" the first context is new again; with the switch off (two Super Admins) a new context
  sends nothing; a traveler sign-in never sends one.
- Docs: the runbook's lost-access playbook, ADR 0006's amendment, the handoff.

## 6. The diff

```prisma
/// A browser a staff member signed in from (docs/schema-m9-new-device-email.md).
/// The device cookie itself is never stored.
model StaffKnownDevice {
  id          String   @id @default(uuid()) @db.Uuid
  userId      String   @map("user_id") @db.Uuid
  /// SHA-256 of the `ota_device` cookie value (N1).
  tokenHash   String   @unique @map("token_hash")
  /// "Firefox on Windows", read from the user agent at first sign-in.
  label       String
  firstSeenAt DateTime @default(now()) @map("first_seen_at")
  lastSeenAt  DateTime @default(now()) @map("last_seen_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, lastSeenAt])
  @@map("staff_known_devices")
}

model User {
  // ... the existing fields and relations ...
  knownDevices StaffKnownDevice[]
}
```

The relation field on `User` adds no column. The migration creates the table, its unique and
plain indexes and the foreign key; Prisma generates the SQL.

## 7. As built (2026-11-01)

- **Migration** `20261101145749_staff_known_devices` (`5036414`): the table of §6, no backfill.
- **Domain** (`e5badfe`): `packages/domain/src/settings/new-device.ts` (`deviceLabel`,
  `knownDeviceCutoff`, `recordsSignInDevice`, `newDeviceEmailDue`, `KNOWN_DEVICE_STALE_DAYS`)
  and `staffNewDeviceEmail` (default true) in the thresholds document and its schema.
- **Auth** (`0017931`, `34cf119`): `packages/auth/src/sign-in-device.ts`, a Better Auth plugin
  whose `after` hook runs when a route created a session (`ctx.context.newSession`), asks the
  injected `SignInDeviceCheck.signedIn` with the request's `ota_device` cookie and the
  session's user agent, IP and `signInMethod`, and sets the cookie it returns (HttpOnly,
  SameSite=Lax, Secure as the session cookie, 400 days). A failure is logged, never thrown.
  Tested against Better Auth's memory adapter, including a sign-in link's 302.
- **API** (`4d24582`): `SignInDevicesService` (`apps/api/src/auth/`) prunes the person's
  stale devices, refreshes a known one, else records it, audits `auth.new_device_sign_in`
  (device, IP, method) and, while the switch is on, sends the email without awaiting it.
  `StaffService` forgets the person's devices in "Reset passkeys", issuing a recovery code
  and deactivation (N6; the count is in the first two audit rows). Email (`d09fc8c`):
  `newDeviceSignInEmail` in `packages/email`.
- **Desk** (`c98b95a`): the switch in Thresholds › Security beside the passkey rule and the
  idle lock; Security's "New-device email" fact, a note with a link to the switch, and the
  "not built" note now naming only the IP allowlist. en/es/fr.
- **e2e** (`f938655`, `e2e/new-device-email.spec.ts`): a first sign-in emails (Spanish, the
  tenant's primary language) and sets the cookie; the same browser again sends nothing;
  another browser emails; "Reset passkeys" makes the first browser new again; with the switch
  off (two Super Admins) a new browser is audited but not emailed; a traveler gets neither;
  axe on Security. `e2e/helpers.ts`' `latestMagicLink` now reads the newest message to the
  address that holds a link, since a staff address's new-device email can land after it.

**Differences from §2–§5:**
- The stored hash is SHA-256 of the person's id and the cookie value, not of the cookie alone,
  so one browser shared by several staff (the board's shared desk PC) is known to each of them
  and nobody's sign-in replaces another's device. The cookie stays one value per browser.
- The label is language-neutral ("Firefox · Windows", "—" when nothing is recognised) rather
  than "Firefox on Windows", so the email and the audit row show it as stored.
- The email's time is UTC with its zone: the tenant manifest has no time zone.
- The email is its own template (`new-device-sign-in.ts`), not a kind of the passkey change
  email: its facts (device, IP, method) and its footer differ.
- The security DTO is unchanged: Security already reads the thresholds document.
- A deactivated account's sign-in records nothing (it is refused anyway).
