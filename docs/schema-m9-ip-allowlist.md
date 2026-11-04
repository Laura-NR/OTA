# M9 Super Admin IP allowlist: policy for review (no schema change)

**Status:** **Approved 2026-11-02 as recommended (I1a–I7a, with I8's screens) and built the same
day** (§6).
**Date:** 2026-11-02
**Scope:** the IP allowlist deferred under D9 in `docs/schema-m9-settings.md` and again in the
passkey, idle-lock and new-device docs; the last control on the board's A-Settings › Security
block that is not built. The owner picked it on 2026-11-02. It builds on the operating settings
document (two Super Admins per change), the session policy that already enforces the staff
passkey rule and the idle lock (`apps/api/src/auth/session-policy.ts`), and the deploy's proxy
settings (`TRUST_PROXY`, `docs/deployment-plan.md` D8/D9).

## 1. What the board asks, and what exists

| Item | Today | Where it lands |
|---|---|---|
| A-Settings › Security, "Super Admin sign-ins only from the allowlisted IPs (Havana office, Spain office, VPN)", drawn ticked | Security says "The IP allowlist is not built yet." | A switch and a labelled list in the operating settings, off by default (I1, I5) |
| The address a sign-in came from | Better Auth stores `session.ipAddress`, read from `X-Forwarded-For`: it trusts a single value as sent, so a client that reaches the API directly can write any address there | The address Express resolves under `TRUST_PROXY`, which the rate limiter already uses (I2) |
| A Super Admin session signed in from elsewhere | Nothing stops it | Refused on every route, socket and Better Auth session route, like the passkey rule (I3) |
| Locking everyone out by mistake | n/a | A list that would refuse the Super Admin applying it is refused; a deploy-level break-glass (I4) |
| Other staff, travelers, suppliers | Unaffected | Unaffected (I6) |

## 2. Data changes

- **No migration.** Two new keys in the operating settings document, which is JSON: versions saved
  before them read the defaults, as the feature flags and `staffNewDeviceEmail` did.
  - `superAdminIpAllowlistOn` (boolean, default false).
  - `superAdminIpAllowlist`: a list of `{ label, cidr }` (at most 20; label 1–60 characters;
    `cidr` an IPv4 or IPv6 address or range such as `203.0.113.0/24`; default empty).
- **No new column, table, cookie or dependency.** The range check is a small pure function in
  `@ota/domain` (IPv4, IPv6 and IPv4-mapped IPv6), with no library.
- **What Better Auth records changes (I2):** `session.ipAddress` for new sessions becomes the
  address Express resolved. The new-device email and its audit row show that value, so they
  become trustworthy where today they are not.
- **Why this is still Article 2:** it changes how authentication decides (a new refusal) and how
  the sign-in address is derived.

## 3. Decisions (options and recommendation)

**I1 · What is checked: the sign-in, or every request's address.**
(a) **The sign-in address.** The address recorded on the session at sign-in must fall inside the
list. Every later request of that session is judged by it, so the session works for its
12 hours wherever the laptop goes, and sessions from before the switch went on are refused as
soon as the switch applies.
(b) **Each request's own address.** This is not workable here: the desk's server-side pages call
the API from the Next server, which has no client address to pass on, so every server-rendered
page would see the server's own address.
**Recommend (a).** It is what the board says ("sign-ins only from"), it works with how the desk
reaches the API, and it makes no difference to a stolen session cookie (the attacker would not
need to sign in), which the 12-hour limit, the idle lock and passkeys already cover.

**I2 · Where the address comes from.**
(a) **Express's `req.ip` under `TRUST_PROXY`.** For `/api/auth/*`, the API removes any incoming
`X-OTA-Client-IP` header and writes `req.ip` into it, and Better Auth is told to read only that
header (`advanced.ipAddress.ipAddressHeaders`). One rule decides the client address for the rate
limiter and for sign-ins. Behind the planned Caddy → Next → API chain that is `TRUST_PROXY=1`
(plan D8 "Hop count check"; B10 verifies it live).
(b) **Leave Better Auth reading `X-Forwarded-For`.** It is spoofable whenever the API can be
reached without a proxy that overwrites the header, which would let anyone claim a listed
address.
**Recommend (a).** An allowlist on a spoofable address is worse than none: it looks like a
control. Note: Better Auth stores IPv6 addresses cut to their /64 network, so an IPv6 entry must
be a /64 or wider (validated on save). An office or VPN gets at least that.

**I3 · What a refused session can do.**
(a) **Like the passkey rule.** The sign-in completes (so the new-device email still tells the
person), and then every API route, both sockets and Better Auth's session routes (passkeys
included) refuse it with `IP_NOT_ALLOWED`, except reading itself and signing out. The desk signs it
out and shows the login page with "Super Admin sign-ins are only accepted from the agency's
listed addresses. This one came from 198.51.100.7." Audited once per session as
`auth.sign_in_outside_allowlist` (address, method).
(b) **Refuse the sign-in itself**, in Better Auth's session-create hook. The sign-in link and
passkey flows would then end in Better Auth's generic error rather than the desk's message, and
the sessions from before the switch would need (a) anyway.
**Recommend (a).** One mechanism covers both new and existing sessions, and it is the one the
passkey rule and the idle lock already use (guard, sockets, Better Auth's gate).

**I4 · Not locking everyone out.**
(a) Three guards. **On apply:** the second Super Admin cannot apply a version with the switch on
if their own session's sign-in address falls outside its list ("This list would refuse your own
sign-in from 203.0.113.9"), and the switch cannot be on with an empty list. **On the form:**
"Your sign-in address: 203.0.113.9" with "Add it to the list". **Break-glass:**
`SUPER_ADMIN_IP_ALLOWLIST_OVERRIDE=off` in the API's environment suspends the rule (logged at
boot), as `STAFF_PASSKEYS_OVERRIDE=off` does; the runbook gets a lost-access entry.
(b) The break-glass only.
**Recommend (a).** The apply check catches the most likely mistake (a typo, or the applier being
on another network) before it takes effect. The proposer is not checked: they may propose from
anywhere, and only the applier's address proves the list works.

**I5 · Where the list lives.**
(a) **The operating settings document** (§2): one Super Admin proposes, a second applies, each
version is kept and audited. It is shown on Thresholds › Security beside the passkey rule and
the new-device email.
(b) **Its own table**, with entries added and removed one at a time: a migration and a second
approval flow for the same two-person rule.
**Recommend (a).** The list is short and changes rarely, and the settings document already gives
the board's two-Super-Admin save, history and audit.

**I6 · Who it covers.**
(a) **Super Admins only**, whatever the sign-in method (passkey, sign-in link, recovery code,
password).
(b) All staff.
**Recommend (a).** It is the board's sentence. Plan D18 already notes that staff in Cuba change
addresses often, so (b) would lock out the operations desk. A recovery-code session for a Super
Admin is covered too, so a code read out over the phone does not get around the list.

**I7 · The default and the plan's advice.**
(a) **Built, and off by default**, in every environment. Plan D18 recommends not switching it on
until the deploy topology (D8/D9) is settled and `TRUST_PROXY` is verified live; until then, the
address on the form is the check that the API sees the right one.
(b) On by default with an empty list: impossible under I4.
**Recommend (a).**

**I8 · The screens.** Not a choice, listed for review (en/es/fr):
- Thresholds › Security: the switch, the list (label and address or range per row; add and
  remove; at most 20), "Your sign-in address" with "Add it to the list", the same
  two-Super-Admin save. The pending version's diff names the list as one change.
- Security › Sessions & sign-in: a fact "Super Admin IP allowlist: On (3 addresses) / Off" with
  the board's sentence and a link to the switch; the "not built yet" note goes.
- Login: the refusal message (I3) when the desk signed a refused session out.
- No new route: the caller's sign-in address joins the existing settings read as an optional
  field, so the RBAC matrix is unchanged.

## 4. Deferred, not in this batch

- Checking each request's address (I1(b)); it would need the desk's server to forward a trusted
  client address.
- An allowlist for other roles (I6(b)), or per role.
- An email to the other Super Admins when a refused sign-in happens (the person's own new-device
  email already goes).
- Country-level rules (no geolocation in the platform).

## 5. What lands once approved

- `@ota/domain`: `parseIpRange`, `ipInRanges` (IPv4, IPv6, IPv4-mapped), `ipAllowlistIssues`
  (empty while on, the IPv6 /64 rule, duplicates), `superAdminIpRefused(role, on, list, address,
  override)`. Unit tests for each, including the boundaries of a range and a malformed entry.
- `@ota/schemas`: the two keys in the thresholds schema; the caller's address on the settings
  read.
- `packages/auth`: the session's `ipAddress` on `AuthSession`; the header option (I2).
- API: `main.ts` writes `X-OTA-Client-IP` for `/api/auth`; `SessionPolicy.refusal` and
  `gateRefusal` add `ip_not_allowed`; the guard maps it to 403 `IP_NOT_ALLOWED`; the apply check
  (I4); the defaults; the boot warning; the audit row once per session.
- Desk (en/es/fr): I8.
- e2e (owns `ip-allowlist-e2e-*@example.test`): two Super Admins switch it on with a list holding
  the local address and it applies; a list without it is refused on apply with the message; a
  Super Admin session whose recorded address (set in the fixture) is outside the list is refused
  and the login page names the address; an Operations Admin from the same address is
  unaffected; switching it off restores the session. axe on Thresholds › Security.
- Docs: the runbook's lost-access entry and break-glass, ADR 0006's amendment, the handoff.

## 6. As built (2026-11-02)

- **Domain** (`b784144`, `aaa2790`): `packages/domain/src/settings/ip-allowlist.ts`
  (`parseIpRange`, `ipRangeIssue`, `ipInRanges`, `superAdminIpAllowlistEnforced`,
  `superAdminIpRefused`, `ipAddressText`; no library), the two keys in the thresholds document,
  the `IP_ALLOWLIST_EMPTY` issue, and `changedThresholds` comparing a list by its entries.
- **Schemas** (`152c721`): `ipAllowlistEntrySchema` (label 1–60, a valid range, IPv6 /64 or
  wider, no duplicate network, at most 20) and the optional `signInAddress` on the settings read.
- **Auth** (`4745d80`): `packages/auth/src/client-ip.ts`, `CLIENT_IP_HEADER`
  (`x-ota-client-ip`), set as Better Auth's only `ipAddressHeaders`; `AuthSession` carries
  `ipAddress`. Tested against Better Auth's memory adapter: the header wins, a client's
  `X-Forwarded-For` is ignored, IPv6 is kept as its /64.
- **API** (`136d851`, `5ba3e58`): `main.ts` writes `req.ip` into the header for `/api/auth`
  (`apps/api/src/common/client-ip.ts`) and warns at boot under the break-glass;
  `SessionPolicy.ipRefused` feeds `refusal` (kind `ip_not_allowed`) and `gateRefusal`; the guard
  answers 403 `IP_NOT_ALLOWED` with `ipAddress`; `AuthUser.signInAddress`; the apply check
  (422 `IP_ALLOWLIST_EXCLUDES_YOU`); `SignInDevicesService` audits
  `auth.sign_in_outside_allowlist` at sign-in. No new route; the RBAC matrix is unchanged.
- **Desk** (`09058d6`, `0e82c84`, `ae43155`): the list editor on Thresholds › Security, the
  warnings and the translated apply refusal, the table's list text, the Security fact and
  note, and the redirect from the dashboard layout and `/passkeys` to
  `/login?refused=ip&address=…`, which signs the session out. en/es/fr (`c348912`).
- **e2e** (`401f59e`, `e2e/ip-allowlist.spec.ts`): propose with "Add my sign-in address" (the
  warning appears when the address is removed; a typo shows the field error), a second Super
  Admin applies, Security reads "On · 2 addresses", a Super Admin session moved outside (the
  fixture rewrites the session's address) lands on the login page signed out with the address
  named, an Operations Admin from there is untouched, an apply leaving out the applier is
  refused with the translated message, and switching it off restores the outside session. axe
  on Thresholds, Security and the login page.

**Differences from §3–§5:**
- An IPv6 sign-in address is shown, and added by "Add my sign-in address", as the /64 Better
  Auth keeps in short form (`2001:db8:4:1::/64`), not as the stored
  `2001:0db8:0004:0001:0000:0000:0000:0000`. In dev the browser reaches the API over `::1`, so
  the address reads `::/64`.
- The refusal is audited at sign-in by the new-device hook (which already receives the address
  and method), not by the policy, so it is written once per sign-in rather than per request.
- The apply check runs on the switch in the proposal, whatever the break-glass says, so a list
  applied during a break-glass still admits its applier when the variable is removed.
