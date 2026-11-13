# M9 staff passkeys: policy and schema diff for review

**Status:** **Approved 2026-10-26 as recommended (P1a–P6a), with `@better-auth/passkey` as a
back-office dependency, and built the same day** (§7).
**Date:** 2026-10-26
**Scope:** the M9 item deferred under D9 in `docs/schema-m9-settings.md` ("passkeys required"),
which the owner picked first among M9's deferred items: desk enrollment, and a rule that staff
sign in with a passkey. It builds on Better Auth's passkey plugin (`packages/auth`, already
installed and mounted, but with no UI), the auth guard (`apps/api/src/auth/auth.guard.ts`,
`sessionRefusal`), the operating settings document (`packages/domain/src/settings/operating.ts`,
two Super Admins to apply) and the Settings page's Users & roles and Security tabs.

## 1. What this covers

| Item | Today | Where it lands |
|---|---|---|
| Staff sign-in | Magic link to the work address only (email and password are also enabled in Better Auth, but no screen offers them) | A "Sign in with a passkey" button on the desk login; the link stays for enrollment |
| Enrolling a passkey | The plugin's routes exist, with no screen | A desk setup page, plus "Your passkeys" under Security (P3, P4) |
| "Passkeys required" for staff | Not enforced | A switch in the operating settings document, applied by two Super Admins (P1); the guard refuses a staff session that did not come from a passkey (P2) |
| Lost device | The magic link is the only recovery path | A Super Admin resets another staff member's passkeys; there is a break-glass for the last Super Admin (P5) |
| Who sees which staff member has a passkey | Users & roles already lists passkeys per user (M9 D4) | Unchanged; the switch's apply step shows how many staff have none |
| Travelers and suppliers | Unaffected | Unaffected: the rule covers the three staff roles only (`STAFF_ROLES`) |

**A gap that already exists, fixed in this batch whatever you decide:** the `/ops` and
`/conversations` Socket.IO gateways check only the role
(`apps/api/src/escalation/escalation.gateway.ts:43`,
`apps/api/src/messages/messaging.gateway.ts:46`), so a deactivated user (M9 D5) or a staff
session past its 12 h limit (D9) can still join the escalation and messaging feeds. They should
apply the same `sessionRefusal` as the guard, and the passkey rule with it.

## 2. Data changes (this is why it is Article 2)

- **One new column (only with P2(a)):** `session.signInMethod` (nullable text), set when Better
  Auth creates the session. Nothing is backfilled: sessions from before read as null, which
  counts as "not a passkey".
- **No migration:** `staffPasskeysRequired` (boolean, off by default) joins the thresholds
  document in `operating_settings.values`. Versions saved before this change have no such key and
  read as off.
- **No new table.** Passkeys stay in Better Auth's existing `passkey` table.
- **Behaviour changes that need your approval:** with the switch on, the guard, the two gateways
  and the T-Events intake refuse a staff session that did not come from a passkey. Better Auth's
  routes for managing passkeys refuse some calls from a staff member (P4). The plugin's relying
  party and origin settings change (P6).
- **Dependencies:** no new third-party package. `apps/backoffice` adds `@better-auth/passkey`
  1.7.5 (already in the lockfile through `packages/auth`) for its browser client, which brings
  `@simplewebauthn/browser`, also already installed. The e2e uses Chromium's built-in virtual
  authenticator over CDP, so no new test package either.

## 3. Decisions (options and recommendation)

**P1 · What the rule is, and who switches it on.**
(a) One switch, `staffPasskeysRequired`, in the operating settings document: off by default,
proposed by one Super Admin and applied by a different one, like every threshold (M9 D3). With
it on, every staff role must sign in with a passkey. The "Used by" note reads "desk sign-in, the
escalation and messaging feeds". A staff member can enroll while it is still off, so the desk can
get ready before the switch is applied.
(b) An environment variable, changed by a deploy.
(c) No global switch: whoever has enrolled must then always use a passkey.
**Recommend (a).** It makes the change a versioned, audited, two-person decision like the other
security-relevant thresholds, and you can turn it off again the same way. (b) hides a security
setting from the desk. (c) lets staff opt out by never enrolling. A one-Super-Admin agency cannot
apply a version (D3), so it keeps the default until a second Super Admin exists.

**P2 · How the platform knows that a session came from a passkey.** Better Auth does not record
how a session was created.
(a) **Migration:** a nullable `session.signInMethod`, declared as a Better Auth session field that
no client can set (`input: false`) and filled by a session-creation hook from the route that
created it: `passkey` for `/passkey/verify-authentication`, `magic_link`, `password`, `oauth`, or
`other` for any route not in that list. The guard trusts only `passkey`. The value comes with
the session the guard already reads, so no extra query.
(b) **No migration:** Better Auth hooks refuse the magic-link, password and Google sign-ins for a
staff member who has a passkey, so their only remaining session is a passkey one.
(c) **No migration:** after a passkey sign-in, store a marker for the session id in Better Auth's
`verification` table, and have the guard look it up.
**Recommend (a).** It fails closed: a new sign-in method, a missed route or a session from before
the switch is "not a passkey" and is refused. (b) fails open: every sign-in route must be listed
and kept listed, a refusal on a link click (a redirect) is awkward to show, and the sign-in step
would reveal who is staff. (c) works, but keeps authentication state in a table meant for
one-time tokens, cleaned by Better Auth and the retention purge on their own rules, and adds a
query per request.

**P3 · Enrolling, and a staff member with no passkey yet.**
(a) With the switch on, a staff member who signs in by link gets a setup-only session. The API
refuses every desk route with 403 and the code `passkey_required`, except `GET /me` and the
passkey status the setup page reads. The desk sends them to a "Set up your passkey" page, which
uses Better Auth's passkey routes (outside the Nest guard). They then sign in again with the new
passkey, which also proves that it works. An invited staff member accepts the invite first (they
are not staff until then) and then sets up the passkey.
(b) A grace period of N days in which link sessions still work, with a banner.
**Recommend (a).** Setup takes a minute at the next sign-in, and staff can enroll before the
switch is applied. A grace period adds a second clock and a banner, and leaves link sessions
working on every route in the meantime.

**P4 · Managing passkeys without opening a hole.** Today any session may add, rename or delete
its user's passkeys through Better Auth. With the rule on, a phished sign-in link would give a
setup-only session that could delete the real passkeys and enroll the attacker's.
(a) For a staff member, Better Auth's routes to add, rename and delete passkeys require a passkey
session. The one exception is adding the first passkey. With the switch on, the last one cannot
be deleted. Each add and delete is audited (`auth.passkey_added`, `auth.passkey_removed`) and
emails the work address. On the desk, Security → "Your passkeys" lists each one (name, added,
device type, synced or not) and lets the user add, rename and remove them.
(b) Leave Better Auth's routes as they are.
**Recommend (a).** Without it the rule can be undone with one stolen email. The email tells the
staff member at once if a passkey they did not add appears.

**P5 · Recovery when a device is lost.**
(a) A Super Admin can "Reset passkeys" for another staff member: it deletes their passkeys and
revokes their sessions, records a reason in the audit log and emails the user, who then signs in
by link and enrolls again. No one can reset their own passkeys (a lost device is exactly when a
second person should check). The desk advises enrolling two passkeys, for example a phone and a
laptop. If the last Super Admin loses every passkey, the break-glass is
`STAFF_PASSKEYS_OVERRIDE=off` in the API environment. It overrides the setting, is logged as a
warning on every start, and is a deploy operation, like a key rotation. Recovery codes stay
deferred (M9 D5).
(b) No reset: deactivate the user and invite them again.
**Recommend (a).** (b) loses nothing in the audit trail, but it is slow and makes a role change
(and, for a Super Admin, a second confirmation) part of every lost phone.

**P6 · Passkey parameters.**
(a) The relying party ID comes from `PASSKEY_RP_ID`, by default the hostname of the API's URL
(`localhost` in dev, which covers the desk on :3002). The relying party name is the tenant's
agency name rather than the plugin's default "Better Auth". The accepted origins are pinned to
`TRUSTED_ORIGINS` instead of whatever Origin header a request sends. Registration requires a
discoverable credential and user verification (PIN or biometric), and a passkey sign-in that did
not verify the user is refused.
(b) The plugin's defaults (user verification "preferred" and not required at sign-in, the
request's own origin, the name "Better Auth").
**Recommend (a).** With the defaults, a security key with no PIN signs a staff member in on
possession alone, which matters on a shared desk PC. Note that every passkey is bound to the
relying party ID: moving the desk to another domain later means everyone enrolls again, so
`PASSKEY_RP_ID` belongs to the deployment-topology decision, which is still open.

## 4. Deferred, not in this batch

- Recovery codes (M9 D5), the idle lock, the IP allowlist and the new-device email (M9 D9).
- Passkey sign-in for travelers on the storefront (the plugin allows it; there is no design).
- Passkeys for suppliers (no worker app yet; ADR 0007).

## 5. What lands once approved

- Migration `session_sign_in_method` (§6), only with P2(a).
- `@ota/domain`: `staffPasskeysRequired` in the thresholds document (default false, with old
  versions read as off); a pure `passkeyRefusal(role, required, signInMethod, passkeyCount)`
  returning null, `enroll` or `use_passkey`; the management rule (P4: first passkey, the last one,
  passkey session); the reset rule (P5: a Super Admin, never oneself). Unit tests for each.
- `@ota/schemas`: the thresholds field, the passkey status DTO, the reset body (reason).
- `packages/auth`: the session field and its creation hook (P2), the passkey options (P6), and a
  `before` hook on the passkey management routes that asks a check injected by the API (P4).
- API: `sessionRefusal` extended and shared by the guard, both gateways and the T-Events intake;
  `GET /me/passkeys` (setup page status; allowed in a setup-only session) and
  `POST /staff/:id/reset-passkeys` (Super Admin), both in the RBAC matrix; the audit rows and the
  two emails in `packages/email`; the `STAFF_PASSKEYS_OVERRIDE` break-glass.
- Desk (en/es/fr): "Sign in with a passkey" on the login page; the setup page; Security → "Your
  passkeys"; "Reset passkeys" on Users & roles; the switch on Approvals & thresholds with the
  number of staff who have no passkey yet. The setup page and the passkey list go in the axe
  spec.
- e2e (owns `passkey-e2e-*@example.test` and its "E2E passkeys" settings versions, and switches
  the rule off again in `afterAll`): enroll with a virtual authenticator, then sign in with it;
  with the rule applied by two Super Admins, a link session reaches only the setup page and is
  refused by `/ops`; removing the last passkey is refused; a reset sends the user back to setup.

## 6. The diff

```prisma
model Session {
  id        String   @id
  expiresAt DateTime
  token     String   @unique
  createdAt DateTime
  updatedAt DateTime
  ipAddress String?
  userAgent String?
  /// How the session was created (passkey, magic_link, password, oauth, other), set by the
  /// auth package's session hook and never by a client. Null for sessions from before it
  /// existed; only "passkey" satisfies the staff passkey rule.
  signInMethod String?
  userId    String   @db.Uuid
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("session")
}
```

The column keeps the `session` table's own naming (camelCase, no `@map`), as Better Auth's
columns do. Migration SQL: `ALTER TABLE "session" ADD COLUMN "signInMethod" TEXT;`

## 7. As built (2026-10-26)

- **Migration** `20261026135144_session_sign_in_method` (`61b0231`): `session.signInMethod`,
  nullable, no backfill.
- **Domain** (`70ea528`): `packages/domain/src/settings/passkeys.ts` (`passkeyRefusal`,
  `passkeyChangeRefusal`, `staffPasskeysEnforced`, `PASSKEY_SIGN_IN_METHOD`) and
  `staffPasskeysRequired` (default false) in the thresholds document; the schemas add
  `passkeyStatusSchema` and `resetPasskeysSchema`.
- **Auth** (`442b6b9`): `packages/auth/src/sign-in-method.ts` maps the creating route to the
  method (only `/passkey/verify-authentication` is `passkey`; a session created while adding a
  passkey is `other`); `createAuth` takes `passkey: { rpID, rpName, origins, policy }`, sets
  `residentKey` and `userVerification` to required, refuses a registration or sign-in that did
  not verify the user, and asks `policy.changeRefusal` before the four passkey-changing routes
  (403 `PASSKEY_CHANGE_REFUSED`) and `policy.changed` after an add or a delete.
- **API** (`f66db2b`, `79c1980`): `SessionPolicy` (`apps/api/src/auth/session-policy.ts`,
  global) holds `sessionRefusal` plus the passkey rule and is shared by the guard, both
  gateways (which now also refuse a deactivated user and an ended staff session) and the
  T-Events intake. The guard answers 403 `PASSKEY_SETUP_REQUIRED` or 401
  `PASSKEY_SIGN_IN_REQUIRED`, except on `@AllowWithoutPasskey()` routes (`GET /me`,
  `GET /me/passkeys`). `POST /staff/:id/reset-passkeys` (Super Admin, never oneself, a reason)
  deletes the passkeys and sessions, audits `staff.passkeys_reset` and emails the user. Adds
  and removals are audited as `auth.passkey_added` / `auth.passkey_removed` and emailed, for
  staff only. `PASSKEY_RP_ID` and `STAFF_PASSKEYS_OVERRIDE` are read by `main.ts` (and passed
  through by turbo's dev task); the relying party name is the tenant's agency name.
- **Desk** (`ab0fcba`): "Sign in with a passkey" on `/login`; `/passkeys` (setup, sign in,
  list with rename and remove) outside the shell, linked as "Passkeys" under the person's name;
  the dashboard layout sends a held-back session to `/passkeys` or `/login?passkey=required`;
  the switch in a "Security" thresholds group with the count of staff without a passkey; "Reset
  passkeys" on Users & roles; the "Staff passkeys" fact on Security. en/es/fr.
- **e2e** (`2c58ff3`): `e2e/passkeys.spec.ts`, serial, with Chromium's virtual authenticator
  over CDP. Two Super Admins enroll and sign in by passkey; the switch is proposed and applied;
  a link session gets 403 and is sent to setup, enrolls and signs in; its last passkey cannot
  be removed; a reset signs it out and emails it; the rule is switched off again and a removal
  is audited. `/passkeys` joined the axe spec.

**Differences from §5:**
- "Your passkeys" is the `/passkeys` page, linked from the shell, not a Security-tab section:
  the Security tab is Super Admin only and every staff role needs the page.
- The reset rule is the existing staff checks (`@Roles(SuperAdmin)` and `loadStaff`, which
  refuses oneself and non-staff), not a new domain function.
- The e2e does not open an `/ops` socket; the gateways' refusal is proven by
  `apps/api/test/escalation.gateway.test.ts` and `messaging.gateway.test.ts`.
- The passkey emails use the tenant's primary language, as the invitation does.

