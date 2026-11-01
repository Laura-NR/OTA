# Handoff — vereda — updated 2026-11-01 23:05

## Goal
Build the design team's handoff into the platform. The current handoff is `design/vereda-v1.2/`;
`design/vereda-v1.1/` is kept for the record. Plan and phases: `docs/design-v1.1-plan.md`.
Decisions: ADR 0006 (design system; amended through 2026-10-24 for Phase 4, M4–M10, Phase 6, the
Confirmation screen, the Custom builder, the DS 07 widths, Phase 8 item 2 and, on 2026-10-25,
reduce motion, high contrast, the axe audit, Phase 8 item 1, T-Events, its follow-ups and the
server-side T-Events, on 2026-10-26 the staff passkeys, on 2026-10-27 the Plausible CE sink
on 2026-10-29 the accessibility passes, the alert cue and the storefront design changes, and
on 2026-10-31 the desk idle lock, the runtime feature flags and the alerts on every desk
page, on 2026-11-01 the staff recovery codes, the new-device email and permission overrides) and
ADR 0007 (worker
app). Staff passkeys:
`docs/schema-m9-passkeys.md` (approved P1a–P6a, §7 as built). The idle lock:
`docs/schema-m9-idle-lock.md` (approved L1(b), L2a–L7a, §7 as built). Recovery codes:
`docs/schema-m9-recovery-codes.md` (approved R1a–R5a, §7 as built). The new-device email:
`docs/schema-m9-new-device-email.md` (approved N1a–N6a, §7 as built). Permission overrides:
`docs/schema-m9-permission-overrides.md` (approved O1a–O8a, §7 as built). The analytics sink: ADR 0006's 2026-10-27 amendment and `docs/runbook.md` "Analytics
events (T-Events)".

## State
- **Phases 0, 1, 0b, 2, 3 and 5 are done; M1–M10 are complete with their surfaces; Phase 8 items
  1–4 are done** (item 1 also has its real sink adapter). Commits are local on `vereda`; the
  owner pushes (`git log --oneline origin/vereda..vereda`).
- **2026-11-01 (night): permission overrides** (M9), the owner's pick, approved O1a–O8a on
  migration `20261101202627_permission_overrides` (`39575ad`…`b99a875`; ADR 0006 amendment of
  that day). No dependency or spend.
  - Rules `packages/domain/src/settings/overrides.ts`: the permission matrix
    (`PERMISSION_MATRIX`, moved from the desk), the Super Admin rows (thresholds, staff, OFAC
    export) never overridable, so only Administrative Support can ask (the 8 rows it views); a
    request lapses after 24 h; an approved override runs `overrideExpiryHours` (a threshold,
    default 24, 1–24, two Super Admins).
  - API: `@Capability(row)` on every staff controller; `@NotOverridable()` on refund
    approve/reject, advisory approve/request-changes and supplier-application approve.
    `AuthGuard` looks for a running override only when the role check fails and the route
    admits an Operations Admin; `OverrideAuditInterceptor` audits each successful change as
    `permission.override_used`. Routes under `/permission-overrides` (request, mine, list,
    approve, decline, end) are in the RBAC matrix with override cases. A role change,
    deactivation, "Reset passkeys" and a recovery code end the person's overrides. Every
    active Super Admin is emailed a request.
  - Desk: `deskAccess(role, row)` (`apps/backoffice/src/lib/overrides.ts`) replaces the pages'
    role lists; `OverrideNotice` under each view-only page's header; Settings › Permissions
    lists requests, active overrides and the last 30 days; "Override expiry" on Thresholds ›
    Security. en/es/fr. e2e `e2e/permission-overrides.spec.ts`.
  - Also `8a15c33`: a 1 ms timing flake in the recovery-code staff test (the test's clock
    read before the service's), now bounded by the call's start and end.
- **2026-11-01 (evening): the new-device email** (M9 D9), the owner's pick, approved N1a–N6a
  on migration `20261101145749_staff_known_devices` (`6a3fd8c`…`0267b26`; ADR 0006 amendment
  of that day). No dependency, route or spend.
  - Rules `packages/domain/src/settings/new-device.ts`: `deviceLabel` ("Chrome · Linux", "—"),
    a device unseen 180 days is forgotten, staff only, `newDeviceEmailDue`; the switch is the
    threshold `staffNewDeviceEmail` (default on, two Super Admins, Thresholds › Security).
  - Auth: `packages/auth/src/sign-in-device.ts`, a Better Auth plugin whose `after` hook runs
    on every route that created a session (`ctx.context.newSession`, also a link's 302),
    asks `SignInDevicesService.signedIn` (`apps/api/src/auth/`) and sets the HttpOnly
    `ota_device` cookie it returns (400 days). Failures are logged, never thrown.
  - API: stores SHA-256 of `<userId>:<cookie>` in `staff_known_devices` (so a shared browser
    is known to each person), audits `auth.new_device_sign_in`, emails
    `newDeviceSignInEmail` (tenant primary language, UTC) without awaiting it. Reset
    passkeys, issuing a recovery code and deactivating forget the person's devices.
  - Desk: the switch on Thresholds; Security's "New-device email" fact and note; the "not
    built" note names only the IP allowlist. en/es/fr. e2e `e2e/new-device-email.spec.ts`.
- **2026-11-01: staff recovery codes** (M9 D5), the owner's pick, approved R1a–R5a on
  migration `20261101114418_staff_recovery_codes` (`30b730d`…`946bd20`; ADR 0006 amendment of that
  day). No dependency or spend. The board's model, not self-service backup codes: a Super
  Admin issues a one-time code for another staff member.
  - Rules `packages/domain/src/settings/recovery-codes.ts`: 12 Crockford base-32 characters
    (`XXXX-XXXX-XXXX`, I/L/O typed read as 1/1/0), open 15 min, the fifth wrong try
    withdraws it; a `recovery_code` session is setup-only whatever the passkey switch says
    (`passkeyRefusal`) and ends 15 min after sign-in (`isRecoverySessionOver`, read by
    `sessionRefusal`, so guard, sockets and Better Auth's gate all refuse it).
  - Auth: `packages/auth/src/recovery-code.ts`, Better Auth plugin endpoint
    `POST /api/auth/sign-in/recovery-code` `{email, code}` → asks
    `RecoveryCodesService.redeem` (`apps/api/src/auth/`), then creates the session and
    cookie. Every refusal is 401 `RECOVERY_CODE_INVALID`. It sits in the strict auth rate
    limit (`/api/auth/sign-in` prefix).
  - API: `POST /staff/:id/recovery-code` (Super Admin, never oneself, not deactivated; a
    reason; `no-store`) returns the code once, withdraws an open one, deletes the person's
    passkeys and sessions, audits `staff.recovery_code_issued`, emails
    `recovery_issued`; `POST /staff/:id/recovery-code/withdraw` (409 if none open). Use →
    `auth.recovery_code_used` + email; fifth wrong try → `auth.recovery_code_voided` (no
    actor). Both routes in the RBAC matrix. `StaffUserDto.recoveryCodeOpenUntil`,
    `PasskeyStatusDto.recoverySession`.
  - Desk: Users & roles "Issue recovery code…" dialog (reason, warning, the code once) and
    "Recovery code open until …" + "Withdraw code" on the row; the login's "Use a recovery
    code" field (with the email typed above) → `/passkeys` with a note; Security's
    "Recovery" fact and the board's sentence. en/es/fr. e2e `e2e/recovery-codes.spec.ts`.
  - Also: `A` on a booking page's service row acknowledges that service's red alert
    (`booking-services.tsx`, `acknowledge(row, onlyItemId)` in `DeskAlerts`; e2e in
    `desk-alerts.spec.ts`, owns E2EACK04), and the Applications empty state names `/join`.
- **2026-10-31 (evening): the desk's alerts on every page, and the queues' flag notices**,
  the owner's pick (`8d8d461`…`432c8af`; ADR 0006 amendment of that day). No migration,
  dependency, route or spend.
  - `apps/backoffice/src/components/desk-alerts.tsx` (`DeskAlerts`, `useDeskAlerts`) now
    holds the board, the 1 s clock, the `/ops` socket, the announced crossings, the cue,
    acknowledgements with the undo toast and the mute. The dashboard layout mounts it for
    staff (it reads `/dispatch/active`, `/dispatch/alert-mute` and the thresholds); it stays
    mounted across desk pages, so the sound, the cued set and an open undo carry over.
    `OpsDesk` reads it and seeds it with the page's own reads (null = unread, kept).
  - `components/alert-strip.tsx`: `AlertStrip` (the dashboard's strip, moved) and
    `ShellAlertStrip`, first in `<main>` on every shell page but `/dashboard`, with "Go to
    matrix" → `/dashboard#matrix` and one "Acknowledge red alert · <code>" per red booking
    (ops write roles); focus goes to `#main` after one. "Press R" is announced only on the
    dashboard. `AlertAnnouncements` renders the two live regions first in every shell
    page's `<main>`. Matrix columns moved to `lib/matrix-columns.ts`.
  - `components/feature-off-notice.tsx`: an info alert on Suppliers › Applications
    (`recruitmentPortal`) and Bookings › Custom proposals (`customItineraryBuilder`) while
    the flag is off, linking to `/settings?tab=thresholds`; `backoffice.featureOff.*`
    en/es/fr.
  - e2e: `e2e/desk-alerts.spec.ts` +2 (strip, cue and undo across pages; support read-only;
    owns E2EACK03 and `alerts-e2e-support@`), `e2e/feature-flags.spec.ts` now also switches
    the builder and checks both notices.
- **2026-10-31 (afternoon): runtime feature flags** (M9 D8b), the owner's pick, decided as
  recommended: two Super Admins per change, the API refuses what an off flag covers, and
  `interactiveSvgMap` (read by nothing before) gates the map (`bd67105`…`974777f`; ADR 0006
  amendment of that day). No migration, dependency or spend.
  - Domain `packages/domain/src/settings/features.ts`: `FEATURE_FLAGS`, `featureFlagsOf`,
    `railFeature` (CARD → card flag, SEPA/OTHER → wire flag). `OperatingThresholds` now
    extends the flags, so they are seven more keys of the versioned settings document;
    `OperatingSettingsService.defaults()` takes them from the manifest.
  - API: `GET /tenant/config` (public) serves the flags in force; `requireFeature(flag)` →
    409 `{code: 'FEATURE_OFF', feature}` in `PaymentsService.createIntent` (both rails, desk
    and traveler) and in the controllers of `POST /supplier-applications`,
    `POST /me/custom-requests` and `POST /me/reservations`. No new route (RBAC matrix
    unchanged). Test `apps/api/test/feature-flags.e2e.test.ts`.
  - Storefront: `lib/features.ts` `getFeatures()` (per request, from the API, manifest as
    fallback) replaces every `isFeatureEnabled(tenant, …)`; `components/feature-off.tsx`
    closes `/join` and `/custom`; the trip's payments show `account.payment.railOff` in place
    of new transfers; Destinations drops the map card. Desk: a "Features" group in the
    thresholds (`lib/threshold-fields.ts`), the payment panel offers only open rails
    (`noRail` when none). en/es/fr. e2e `e2e/feature-flags.spec.ts`.
- **2026-10-31: the desk idle lock**, the owner's pick (M9 D9's deferred item), approved
  L1(b), L2a–L7a, on migration `20261031091301_session_idle_lock` (`ce82491`…`716896a`;
  ADR 0006 amendment of that day).
  - Every staff session locks after `staffIdleLockMinutes` (threshold, default 30, 5–240, two
    Super Admins) with no reported input, unless the person ticked "This is my own device"
    on the desk login (remembered per browser in `localStorage` `ota-desk-own-device`; sent
    once within ten minutes of sign-in → `session.ownDevice`, audited
    `auth.session_own_device`). Rules: `packages/domain/src/settings/idle-lock.ts`.
  - Server: `SessionPolicy.refusal` kind `locked` (after deactivated/12 h, before the passkey
    rule); the guard answers 401 `{code: 'SESSION_LOCKED', idleLockMinutes}`, also on
    `@AllowWithoutPasskey` routes. `GET /me/session`, `POST /me/activity` (sets
    `session.lastActiveAt` to the server's now), `POST /me/session/own-device` (staff; in the
    RBAC matrix). Better Auth's `before` hook asks `SessionPolicy.gateRefusal` on every route
    except reading the session, signing out and signing in (`routeOpenToRefusedSession`), so
    a locked, deactivated or expired session cannot e.g. register a passkey. Both gateways
    re-check their sockets every minute (`apps/api/src/auth/socket-recheck.ts`), which also
    closes the old gap where a deactivated user's socket stayed connected.
  - Desk: `components/desk-idle-lock.tsx` wraps the shell; tabs share the last input
    (`ota-desk-last-input`) and report it at most once a minute; at the limit, or on any
    `SESSION_LOCKED` answer, the page is hidden and `inert` behind a full-screen modal
    `<dialog>` (A-States 02). Unlock with passkey signs in again in place (a new session);
    "Sign in again" / "Not <name>? Sign in" sign out first. The dashboard layout asks
    `/me/session` first and renders only the lock when it is refused as locked. The `/ops`
    and conversation sockets and the alert cue stop while locked (`useDeskLocked`). Settings:
    the threshold in the Security group, an "Idle lock" fact on Security & audit. en/es/fr.
  - e2e `e2e/idle-lock.spec.ts` (owns `idle-e2e-ops@`/`idle-e2e-own@example.test`).
- **2026-10-29 (night): the storefront pass's deferred design changes**, the owner's pick,
  native date fields kept (`9e10753`…`c740740`; ADR 0006 amendment of that day;
  `docs/a11y-storefront-manual-pass.md` rows now fixed). No migration, dependency or spend.
  - `ResponsiveTable` (`packages/ui/src/components/table.tsx`): columns + rows; under sm
    (480 px) each row is a card, key field first, then `aria-hidden` label : value pairs;
    explicit table roles; `className` (header and cells) and `cellClassName` (cells). Used
    by the itinerary, proposal lines, the cookie list, "Getting there" and content-block
    tables. The desk keeps the `Table` primitives.
  - Cookie banner (`cookie-banner.tsx`, `cookie-choices.tsx`, `globals.css`): its measured
    height is `--cookie-banner`, added to the root's scroll padding and bottom padding. Below
    md the rows and Save sit behind "Choose by purpose" (`cookies.choose`, en/es/fr); Reject
    and Accept side by side (36 % of a 390 × 844 screen). The sticky action bar now sits at
    the scroll box's edge (`-bottom-5`).
  - e2e: four tests added to `e2e/storefront-keyboard.spec.ts` (desktop Tab walk with the
    banner; header row from sm up; phone banner + walks; phone cards keep roles; the trip's
    itinerary stacks).
- **2026-10-29 (late): the desk's alert acknowledgement, audio cue and mute**, the owner's
  pick, with acknowledging decided as per desk, audited (`9310b23`…`ad31180`; ADR 0006
  amendment of that day; `docs/a11y-desk-manual-pass.md` 01 now fixed). No migration,
  dependency or spend: the audit log is the state.
  - Domain `packages/domain/src/dispatch/alert-cue.ts`: `alertKey` (item + offer, so a
    re-dispatch is a new alert), `redSince`, `activeMute`, `muteSilences` (only alerts raised
    before the mute), `alertCue` (red at once, then every 60 s until acknowledged; amber once).
    Desk events `alert_acknowledged` and `alert_muted` (channel `desk`).
  - API (`apps/api/src/dispatch/desk-alerts.*`, `alert-acknowledgements.ts`):
    `POST /service-items/:id/acknowledge-alert` `{offeredAt}` (ops write; 409 when offered
    again or no longer red; a second ack returns the first) → `dispatch.alert_acknowledged`;
    `GET|POST|DELETE /dispatch/alert-mute` (read: ops roles; write: ops write) →
    `dispatch.alerts_muted`/`_unmuted` on entity `DispatchDesk`. The board's items carry
    `acknowledgement` and `respondedAt`. Each change goes out on `/ops` (`DeskAlertEvent`).
  - Desk (`ops-desk.tsx`, `lib/alert-sound.ts`, `undo-toast.tsx`): a two-note Web Audio cue
    after the first click or key press ("Turn on sound" until then), only on the dashboard;
    `A` on a focused row or its Acknowledge button stops the cue here at once, a 6 s undo
    toast (paused on hover/focus), then the API records it for the desk ("Acknowledged ·
    <name> · <time>"); Mute 15 min / Unmute with "Audio muted until … by … (logged)". Red
    alerts only. en/es/fr. e2e `e2e/desk-alerts.spec.ts`.
- **2026-10-29 (evening): the storefront's manual accessibility pass (DS 02–05)**, the
  owner's pick (`0058180`…`fee079b`; record `docs/a11y-storefront-manual-pass.md`, ADR 0006
  amendment of that day). No migration, dependency or spend. Keyboard walk of 20 public and 5
  traveler pages at 1280 and 390 px (touch emulated), Shift+Tab walks, a WCAG 2.5.8 spacing
  check on every page, the drawer/filters/FAQ/tabs/cookie banner by keyboard. Built:
  - a skip link to `<main id="main">`; root `scroll-padding` for the sticky header (4 rem /
    72 px from lg), a destination's "On this page" row (`data-sticky-subnav`), the phone's
    bottom bar (4 rem below md) and the compare tray (`--fixed-tray`, measured); sections'
    `scroll-mt-*` reduced to match, so anchors land as before;
  - a `pointer-coarse:` variant in the preset: md buttons, `Input`, `Select` and
    `WRAPPING_BUTTON` are 44 px on touch, 40 px with a mouse; `TOUCH_ROW` (`lib/button.ts`)
    for the footer, logo and strip links; language links take taps 44 px tall around the
    unchanged pill and are named in their own language (`lang`, `hreflang`, `aria-current`);
  - titles for the trip ("Your trip"), proposal, builder, mock checkout and 404 (metadata plus
    a React `<title>`, see Traps); table scroll boxes named "<section> · table";
  - confirmations before Decline (proposal) and Withdraw (event request), DS 06 dialog;
  - `unavailableReason` on the booking flow's first and last steps and the event request's
    two steps; a full compare selection and a full custom route stay focusable with
    `aria-describedby` to the shown limit.
  Deferred: stacked table cards on a phone, room for the cookie banner on a phone (focus can
  go behind it until a choice), the custom date-range picker, a real screen-reader run.
- **2026-10-29 (later): the desk's manual accessibility pass (A-A11y)**, the owner's pick
  from the Next list (`e9fb087`…`d09cca8`; record `docs/a11y-desk-manual-pass.md`, ADR 0006
  amendment of that day). No migration, dependency or spend. Keyboard walk of 23 desk pages,
  the matrix's accessibility tree, focus in and out of panels, live regions during an
  amber→red crossing. Built:
  - a skip link on every shell page; `<h1>` on sign-in, invitation and passkeys;
  - desk shortcuts (`desk-shortcuts.tsx`; `resolveShortcut`/`isTypingTarget` in `@ota/ui`):
    `?` and the header's "Keyboard shortcuts" open the list, G then D/B/P, `R` on a row marked
    `data-shortcut-row` (matrix, a booking's services), a per-device off switch
    (`localStorage` `ota-desk-shortcuts`, WCAG 2.1.4);
  - the matrix: booking as sticky row header with a matching scroll padding, names with the
    service/booking/worker, the drawer opens on its title (`Drawer focusTitle`), focus back to
    the row when an offer removes its button;
  - threshold crossings announced once (`alertCrossings` in `packages/domain`; red assertive,
    amber polite); the visible strip is no longer live;
  - `Button unavailableReason` (aria-disabled, focusable, reason beside it) on 25 actions that
    waited on input or a second approver; copy in `backoffice.unavailable` (en/es/fr);
  - 44 px sidebar links, 20 px checkboxes, an empty customer link fixed.
  Deferred: the audio cue, `A` (acknowledge) and "Mute 15 min" (what acknowledging means is
  the owner's call), `/` (no desk search), `lang="es"` spans (messages carry no language), a
  real screen-reader run (none on this machine).
- **2026-10-29: `docs/deployment-plan.md`**, a proposal at the owner's request: decisions
  D1–D24 with options and recommendations, findings F1–F15 from the code, the build items
  B1–B13, a phased step-by-step, a launch checklist, costs and counsel questions. Nothing is
  decided, built, bought or deployed. It recommends one EU VM with Docker Compose behind
  Caddy, and Plausible on the same VM (D20 revisits the approved H1 a). No code changed.
- **2026-10-28: the live Plausible hosting plan**, the owner's pick from the
  Next list. `docs/plausible-hosting-plan.md` was approved as recommended (H1a, H4a, H5, H6a,
  H7) and built (`9f9e562`…`89ed6fe`, §6 as built). Nothing is deployed or bought: CE goes on
  its own EU VPS, which the owner buys (H1), and H3 (an edge proxy that sets
  `X-Forwarded-For`, plus `TRUST_PROXY=1`) belongs to the deploy topology. Code:
  `TELEMETRY_SINK=plausible` builds a `ConsentRoutedTelemetrySink`
  (`apps/api/src/telemetry/consent-routed-sink.ts`), so only events whose consent is not
  `essential` reach Plausible (`mayReachAnalyticsStore`, `packages/domain`). Desk, server and
  refusing visitors' events stay on the mock and its file. The intake forwards the visitor's
  User-Agent with the IP; `LINKABLE_TELEMETRY_PARAMS` (`booking_code`, `request_id`,
  `from_path`) never reach Plausible. The words are `cookies-analytics@2026-10-28` (approximate
  location), with the privacy paragraph to match (en). The runbook has a "Going live"
  checklist. No migration, dependency, image or UI change.
- **2026-10-27/28: the real analytics sink (Plausible CE)**, the owner's pick from
  the Next list. `TELEMETRY_SINK=plausible` selects `PlausibleTelemetrySink`
  (`apps/api/src/telemetry/plausible-sink.ts`): plain `fetch`, one `POST /api/event` per admitted
  event, a three-second timeout and no SDK; the taxonomy's `page_view` becomes Plausible's
  built-in `pageview`. The reported URL is synthetic (`/en/<Screen>`,
  `/admin/<A-Screen>`, `/server`); the event's context (without `session_id`), its `essential`
  flag and its parameters become custom properties (lists comma-joined). The HMAC user id and
  the session id are not sent. The intake forwards the visitor's IP as `X-Forwarded-For` (only
  when `isIP` accepts it); a failed or `x-plausible-dropped` send is logged, never thrown. The
  mock stays the default and the e2e's file sink; a missing/invalid setting logs an error and
  falls back to the mock. Settings: `TELEMETRY_SINK`, `TELEMETRY_PLAUSIBLE_ENDPOINT`,
  `_DOMAIN`, `_SITE_URL`, `_USER_AGENT`, `_TIMEOUT_MS`, all passed through by turbo's dev task.
  Tests: `apps/api/test/plausible-sink.test.ts` (10) and `telemetry.service.test.ts` (1). No new
  dependency, no migration, no image; live hosting stays open (Q10).
- **Earlier (2026-10-26): staff passkeys**, the owner's first M9 deferred item, approved
  as recommended (P1a–P6a) with `@better-auth/passkey` as a back-office dependency (already in
  the lockfile), on migration `20261026135144_session_sign_in_method` (`c720d5a`…`8c04327`):
  - Every session records `signInMethod` (`packages/auth/src/sign-in-method.ts`; only a
    passkey sign-in is `passkey`). The switch `staffPasskeysRequired` (off) is a threshold,
    applied by two Super Admins. With it on, the global `SessionPolicy`
    (`apps/api/src/auth/session-policy.ts`) refuses a staff session that is not a passkey one:
    403 `PASSKEY_SETUP_REQUIRED` (none yet) or 401 `PASSKEY_SIGN_IN_REQUIRED`, except on
    `@AllowWithoutPasskey()` (`GET /me`, `GET /me/passkeys`).
  - The guard, the `/ops` and `/conversations` gateways (which before checked only the role, so
    a deactivated user or an ended staff session could still join: fixed) and the T-Events
    intake share it. Better Auth's passkey-changing routes ask it (P4); adds and removals are
    audited and emailed; `POST /staff/:id/reset-passkeys` (Super Admin, a reason).
  - Passkeys need user verification; origins are `TRUSTED_ORIGINS`, the relying party is
    `PASSKEY_RP_ID` (default: the API URL's hostname); `STAFF_PASSKEYS_OVERRIDE=off` is the
    break-glass (`docs/runbook.md` "Staff passkeys").
  - Desk: passkey sign-in on `/login`, `/passkeys` (outside the shell, "Passkeys" link under the
    person's name), the switch, Reset passkeys, the Security fact; e2e `e2e/passkeys.spec.ts`.
- Earlier (2026-10-25, late): server-side T-Events (`a2017bd`…`7c9bc82`): the `server`
  surface, `booking_state_changed` from the API for every transition, `offer_*` from dispatch,
  the mock sink's `TELEMETRY_SINK_FILE`.
- Earlier the same day: the T-Events follow-ups (`f193204`…`8cac6fb`): surfaces, the desk's
  operational events with the role from the session, the storefront's search/sort/departure/
  tier/OFAC/payment events.
- Earlier the same day: Phase 8 item 1, T-Events (`f5a6651`…`a137ba8`): the cookie banner,
  Cookie settings, the taxonomy, the public intake with the mock sink, the storefront funnel.
- Earlier the same day: reduce motion, high contrast and the axe audit (`5abe936`…`f1e1131`).
- Earlier (2026-10-24): Phase 8 item 2 (rem type, larger text, low bandwidth, the PWA and the
  offline kit), the DS 07 widths and M10 (see Decisions).
- **Not built:** SMS/push; the live Plausible hosting decision (the adapter is built);
  worker events (`offer_viewed` and the rest wait for the worker app); desk page views and nav clicks
  (counsel on staff analytics); `gallery_opened` (no gallery viewer);
  queued offline writes; the
  D-OfflineKit PDFs; A-Content's blog/FAQ/media/conditions tabs; guide specialities; M9's other
  deferred items (permission overrides, display currencies, manifest editing
  beyond the flags, the IP allowlist, new-device email); changing "own device" after sign-in; passkeys for travelers and suppliers; M10's deferred room holds, event photos and "Keep building the trip"; the
  desk's `/` (no desk search); self-service backup codes and a no-deploy recovery for the
  last Super Admin; Ops Lite;
  a real screen-reader run; the custom date-range picker (owner: native fields).
- **Placeholders:** M4 terms, card fee 0 %, legal texts, OFAC categories, pricing samples, the
  deposit's refundability and proof retention, the M5 sample terms, the builder rates, the M8
  crisis framework, the backup-power wording, the cookie banner's analytics words and the
  privacy notice's cookies paragraph, the concierge fee and the events copy
  (`content.events`, en/es; the US note waits for counsel); dev seed as before plus two events.

## Verified (2026-11-01, permission overrides, dev stack stopped for the build)
- `pnpm lint` and `pnpm format:check` green.
- `TURBO_FORCE=true pnpm typecheck` **33/33**, 0 cached.
- `TURBO_FORCE=true pnpm test` **1148 passed / 30 skipped**, 30/30 tasks (new: domain override
  rules, the request email in en/es/fr, `PermissionOverridesService` with a fake, the audit
  interceptor, the RBAC matrix's new routes and override cases, the resets ending overrides).
- `TURBO_FORCE=true pnpm build` **18/18**, 0 cached; `apps/*/.next` deleted after.
- `pnpm e2e` (`.next` deleted first): **152 passed, 2 failed, 3 skipped** in 51.2 min, including
  `permission-overrides.spec.ts` **4/4**. Not this batch's (storefront pages; the storefront
  `next-server` had restarted mid-run, a later PID than the others): `responsive.spec.ts:118`
  at ds07-414 (the 404 page's body read 16 px instead of 18) and `responsive.spec.ts:130` at
  ds07-768 (`page.goto` 180 s timeout). On fresh servers (killed by PID, `.next` deleted) both
  tests at both widths **4/4**. Skips: the desk at 320/375/414.
- Live (`RUN_DB_INTEGRATION=1`, `REDIS_URL=redis://localhost:6379`) **29/29**, 12 files: the 11
  listed before (`apps/api/test/{retention,packages,affidavits,package-booking,payment-schedule,
  proposals,advisories,disruptions,events}.integration.test.ts`,
  `{dispatch,compliance}.bullmq.integration.test.ts`) plus
  `permission-overrides.integration.test.ts`.
- Migration `20261101202627_permission_overrides` applied to the dev DB; `prisma migrate dev`
  reports no drift and `prisma migrate status` is up to date.
- Browser (the owner's restarted stack, a scratch script with its own Super Admin and Support
  user, cleaned up; no override rows left) at 390, 1024 and 1280: Settings › Permissions with a
  request, an active and a declined override; the running (success tone), pending (info) and
  offer-with-decline (neutral) notices; the request dialog at 390; the Spanish pending notice.
  No sideways scroll on any of the 15 page checks; the notice is the `Alert` (8 px radius,
  14/16 px padding) with a 32 px small button; body 14 px. The recent card's status badge
  stretched across its cell; fixed (`b154289`) and rechecked. At 390 the override tables
  scroll inside their boxes like the matrix.
- Not run: a real screen reader.

## Assumptions & unknowns
- `PASSPORT_ENCRYPTION_KEY` is set in `apps/api/.env` (dev); back it up. A production key differs.
- **Deploys:** keep the orchestrator's kill grace period above `SHUTDOWN_TIMEOUT_MS`. Env from M9:
  `STAFF_SESSION_HOURS` (12), `MAGIC_LINK_EXPIRES_MINUTES` (10), `BACKOFFICE_PUBLIC_URL`;
  `PASSKEY_RP_ID` binds every passkey, so it belongs to the deploy-topology decision (still
  open; `docs/deployment-plan.md` D6 recommends the apex domain): the desk's origin must be
  that domain or under it, and in `TRUSTED_ORIGINS`.
- **Permission overrides:** any one Super Admin approves (O4a), so one Super Admin can give
  Support a row for up to 24 h. Reasons and notes are staff free text kept with the override
  (not traveler PII; outside the retention purge). The customers pages still show their actions
  to every role (pre-existing; the API refuses Support); the notice is on the customers list
  only. Two requests sent at the same instant for the same row are not locked against each
  other; both would be listed and either can be decided.
- **New-device email:** on by default, so after a deploy every staff browser emails once. The
  `ota_device` cookie is "essential" (a security function), assumed to fall under the cookie
  notice's existing essential group; counsel holds the cookie words. A private window or
  cleared cookies count as a new device. The email's time is UTC (no tenant time zone).
- **Staff passkeys:** the switch is off in dev (the e2e switches it on and off and deletes its
  versions). A one-Super-Admin agency cannot apply it (dual approval). The passkey emails use
  the tenant's primary language, as the invitation does. Synced passkeys (iCloud/Google) count
  as passkeys; nothing restricts authenticator types (no attestation).
- **Plausible (2026-10-27/28; plan approved 2026-10-28):** the adapter and its routing are
  tested against a fake; no Plausible CE instance is running and nothing is bought. Owner
  steps: the EU VPS (2 vCPU / 4 GB), CE at a pinned tag, the site (the storefront's public
  domain, still unchosen), and H3 in the deploy topology. `TELEMETRY_PLAUSIBLE_DOMAIN`/
  `_SITE_URL` must match the registered site. Counsel: the new analytics words and
  whether Plausible's data needs a retention limit. Facts relied on (CE v3.2.1 README,
  Events API docs, data policy, read 2026-10-28) are listed in the plan §2.
- The settings cache is per process (60 s); a multi-instance deploy sees an applied change within
  a minute.
- **M10, for finance/counsel:** whether a regenerated invoice is enough when seats are added after
  the invoice, or a supplementary invoice is needed; the fall-through and refund wording; the US
  note on concerts.
- The dev database holds several Super Admins from old smoke tests; dev data, not M9's.
- The public `GET /catalog` still returns inventory `supplierId` (pre-existing).
- **T-Events:** the mock sink keeps events in memory per process (lost on restart, not shared);
  `market` is not sent (no geolocation); the board's CCPA banner variant is not built. A failed
  consent-log write after a signed-in banner choice is silent (the cookie still applies).
  Rotating `AUTH_SECRET` changes every hashed user id. Counsel should review the analytics words
  and whether the banner's essential/analytics split fits the agency's legal basis.
- **Desk T-Events:** treated as essential operational records (owner decision); counsel should
  confirm that basis for staff, and whether desk page views need staff-facing words and a
  choice. `role` plus a timestamp can point to one person in a small agency.
- **Server T-Events:** essential, with no worker or user id; `actor: worker` plus a
  `service_item_id` and a time can still point to one supplier (the same counsel question). A
  transition written outside the six reporting sites would go unreported: there are none today
  (`grep` for `status: ReservationStatus` writes in `apps/api/src`).
- **Idle lock (2026-10-31):** the desk's timer runs on the browser's clock and the API's on
  the server's; a browser clock that runs slow locks later than the API, and the first API
  answer (`SESSION_LOCKED`) then locks it. "Own device" is the person's own statement; only
  an unlocked session can make it, within ten minutes of sign-in. The lock stops new data
  and every action, not what the last page showed (developer tools could read its DOM).
  The default 30 minutes applies to every staff session not marked as own device, including
  an ops desk watched without input.
- **Recovery codes (2026-11-01):** the code is spoken, so the Super Admin's identity check
  (a known number, in person) is the real control; the email to the work address only
  helps if the real person can still read it. A recovery session's failed-email lookup
  returns faster than a known staff email's (one query fewer), a small timing signal behind
  the rate limit. The last Super Admin who loses mailbox and passkey still needs a deploy
  or a database change (runbook). Wrong tries count only while a code is open.
- **Alerts on every page (2026-10-31):** each full load of a desk page now also reads the
  board, the mute and the thresholds in the layout (the dashboard reads the first two again
  for its own render). A pending acknowledgement is recorded when its toast runs out, or
  when the person leaves the shell for Passkeys; signing out, reloading or closing the tab
  drops it. With many red bookings at once the strip grows by one button per booking (a
  line each on a phone).
- **Runtime flags (2026-10-31):** once any settings version has applied, the flags it holds
  win over a later edit of the manifest's `features` (as the payment window already did); a
  fork changes them in Settings. The storefront asks the API on every request; if the API is
  down it shows the manifest's flags, while the API (the only enforcement) is down anyway.
  Destinations' lede is tenant content and still says "The map shows…" with the map off.
- **For the owner:** the items under Next; the storefront's sample "Cuba right now" banner says
  every stay has backup power; `staff.allowedEmailDomains` should become the agency's domain.

## Traps
- **Permission overrides (2026-11-01):** a new staff controller needs `@Capability(row)` or
  no override ever reaches it; a new approval or vote route needs `@NotOverridable()`. Desk
  pages decide actions with `deskAccess(role, row)` and pass `byRole` to approval buttons,
  never a local role list. The RBAC matrix's fake Prisma answers
  `permissionOverride.findFirst` (null unless a case sets `supportOverride`); a new fake used
  with a Support user on a tagged write route needs it too.
- **`prisma format` rewrites the whole schema** (the file is not Prisma-formatted: 391 lines
  changed for a 39-line model). Edit `schema.prisma` by hand and run only `prisma migrate dev`.
- **The dev stack `pnpm e2e` leaves behind can hang:** after a single-spec run the left
  servers answered `/health` but every Next page timed out at 60 s. Kill the listening PIDs
  and their `next dev` parents (`pgrep -af "next dev|next-server|src/main.ts"`); Next needed
  `kill -9`.
- **New-device email (2026-11-01):** every e2e staff sign-in now sends a new-device email
  (asynchronously, so it can land after the next magic link): `latestMagicLink` reads the
  newest message to the address that holds a link; a spec asserting "the newest email to a
  staff address" must filter by subject. Staff emails go out in the tenant's primary language
  (es), so e2e asserts the Spanish copy. The running desk loads `packages/i18n/dist`: after
  editing a catalog, `pnpm --filter @ota/i18n build` or the desk shows raw keys. A
  `cmd | tail` inside an `&&` chain hides `cmd`'s failure (a commit went through on a failed
  typecheck and needed `34cf119`).
- **Closed dialogs and locators (2026-11-01):** a closed native `<dialog>` still holds its
  children in the DOM, and Playwright's `getByLabel` inside a table row finds them, so a
  second "Reason" field in the row broke `passkeys.spec.ts`' strict locator. Render a row
  dialog's form only while it is open. The `next dev` memory trap now also hits the desk
  (5.6 GB and no answer after the full e2e and a later browser check on the same servers):
  restart the dev servers (kill by port PID, delete `.next`) before a browser check that
  follows an e2e run.
- **Recovery codes (2026-11-01):** a Better Auth session's `expiresAt` cannot hold a short
  limit: its refresh pushes it back to 7 days on the next read, so time limits on a kind of
  session go in `sessionRefusal` on `createdAt`. `pnpm --filter @ota/db exec prisma format`
  reformats the whole schema (not prettier-aligned here): edit the schema by hand and run
  `prisma validate`. `e2e/helpers.ts` `signIn` deletes every Mailpit message, so check an
  email only after the spec's last sign-in before it. The issue dialog renders the code in
  a `<code>`; e2e reads it by the code's pattern.
- **Alerts on every page (2026-10-31):** a red fixture left by one e2e spec now puts the
  strip, with "Acknowledge red alert · <code>" and "Mute 15 min" buttons, on every desk page
  of later specs: locate buttons by their full name, and anchor text locators for the strip
  (`/^\d+ red alerts? · /`), since the per-booking buttons also contain "red alert · <code>"
  (a strict-mode violation otherwise). `OpsDesk` throws outside `DeskAlerts`; render it only
  in the shell. A second copy of the cue logic anywhere would play the cue twice.
- **Runtime flags (2026-10-31):** a value exported from a `'use client'` module arrives in a
  server component as a client reference, not the value, so the desk page passes the flags to
  `PaymentPanel` and the panel filters its own `RAILS`. The API test fake's
  `requireFeature` calls the real prototype method through `this.features()`, so a test that
  overrides `thresholds` alone must override `features` too. `e2e/settings.spec.ts`' cleanup
  deletes every version whose reason starts with "E2E", including `E2E flags…`; the flags
  spec switches them back on in `afterAll` before deleting, so the 60 s cache holds the
  manifest's values. A storefront gate goes before the sign-in redirect (`/custom`).
- **Idle lock (2026-10-31):** a test or fixture that fakes a staff session with a
  `createdAt` more than 30 minutes old and no `lastActiveAt` is now refused as locked
  (`apps/api/test/auth-guard.e2e.test.ts` gives its sessions `lastActiveAt: new Date()`);
  fakes with no `createdAt` skip the lock, as they skip the 12 h limit. An e2e makes a
  session idle by moving `session.lastActiveAt` back with its own Prisma client, and moves
  the page's clock with `page.clock.install()` (before the navigation) and
  `fastForward`, so the desk's timer agrees. A spec that keeps one staff session for over
  30 minutes using only `page.request` (no clicks or keys) will lock. The dashboard layout
  calls `/me/session` before the passkey check and must let 401/403 that are not
  `SESSION_LOCKED` fall through to it, or a setup-only passkey session errors instead of
  going to `/passkeys`. Better Auth routes that act on a session are refused for a locked
  session unless listed in `routeOpenToRefusedSession`; a new sign-in route belongs there.
- **Full e2e memory (2026-10-31):** late in a ~55-minute `pnpm e2e`, the storefront's
  `next dev` reached 8.5 GB RSS (machine ~22/23 GB used) and stopped answering, so a
  storefront spec timed out at `page.goto` (`responsive.spec.ts` ds07-768, 4 min). Check
  `ps -o rss` on the :3000 PID; kill the leftovers by PID (`kill -9` if a hung next-server
  ignores SIGTERM), delete `apps/*/.next` and rerun the spec alone.
  It recurred in the next run the same day (storefront ~8 GB, back-office ~4 GB, test 112,
  `supplier-resources.spec.ts`). Do not `kill $(pgrep -f "turbo run dev|…")` from a
  shell whose own command line matches: it kills that shell; kill by the ports' PIDs.
  On 2026-11-01 it hit `responsive.spec.ts` ds07-768 again; a "fresh" rerun after a plain
  `kill` failed differently (`/en/about` body 16 px, not 18) until `kill -9` and a check that
  3000–3002 were free; then it passed.
- **Storefront design changes (2026-10-29, night):** a new message key shows as its raw key
  (`cookies.choose`) in a running dev server until `pnpm --filter @ota/i18n build`. Test
  a `ResponsiveTable` cell by its role and name (`getByRole('cell', { name, exact: true })`):
  the phone label is `aria-hidden` but `getByText` still finds it, and it is `display:none`
  from sm up. Playwright's element screenshot of a tall region paints the fixed header over
  it (an artefact, not a bug). Any new fixed bar must report its height into the root's
  scroll padding as the tray and banner do, or the keyboard walks in
  `storefront-keyboard.spec.ts` fail. Proof the walks guard this: with the banner's
  `globals.css` lines reverted, both banner walks fail on the support page's contacts and
  FAQ.
- **Desk alerts (2026-10-29, late):** the cue needs a user gesture, so an e2e records cues
  through `ota:alert-cue` (`addInitScript`) and clicks "Turn on sound" first. Any click (Mute,
  say) also unlocks audio, so the strip's "starts after your first click" sentence vanishes
  asynchronously: never anchor a strip regex with `$`. An acknowledgement is written only
  after the 6 s toast closes: wait for the toast to hide before asserting the audit row.
  The mute is desk-wide state in `audit_logs` (entity `DispatchDesk`): a spec that mutes
  deletes its rows (`desk-alerts.spec.ts` clears those created since it started) or every
  later desk run starts muted. `e2e/desk-alerts.spec.ts` owns E2EACK01/E2EACK02.
  `EscalationPublisher.publish` takes `EscalationEvent | DeskAlertEvent`. The client must send
  the board's `offeredAt` verbatim (the API compares ISO strings). Closing the tab within the
  6 s drops the acknowledgement (moving to another desk page sends it with `keepalive`).
- **Storefront keyboard pass (2026-10-29):** a Next 404 keeps `generateMetadata`'s title only
  in the server HTML; after hydration the layout's title returns, so `not-found.tsx` also
  renders a React `<title>` (both are needed; `generateMetadata` in the catch-all route does
  nothing). Touch sizes only apply under `(pointer: coarse)`: emulate it with
  `hasTouch: true, isMobile: true` (the DS 07 width projects do not, so they still see 40 px);
  a full-page screenshot in that mode re-lays the page out (measure, do not trust it).
  Scroll padding and `scroll-mt-*` add up, so a new anchored section takes the reduced offset
  (`scroll-mt-8`, `scroll-mt-12` under the destination row). A Dialog's ✕ needs its own name
  ("Close"), or `getByRole('button', { name: 'Keep …' })` matches two buttons. Rebuilding
  `@ota/i18n` while an e2e runs makes the dev server recompile, and a click can be lost (the
  proposal accept once): rebuild, wait, then run. Language links are now named "English",
  "Español", "Français", not "en"/"es"/"fr".
- **Desk keyboard pass (2026-10-29):** Playwright's `press('Shift+/')` sends `key: '/'`, not
  `'?'` (a real keyboard sends `'?'`): use `press('?')`. The matrix row now has "Open <code>"
  next to the code link, so a booking-code link locator needs `exact: true` (dispatch and
  escalation specs fixed). An unavailable button is `aria-disabled`, not `disabled`:
  Playwright's `toBeDisabled()` and click actionability treat both alike, but
  `toHaveAttribute('disabled')` does not. Button attaches its refusing click handler only when
  unavailable, so a server component can still render a Button (no function prop). What the
  matrix shows at load is the announcement baseline, so an e2e must start amber and cross
  after load (`e2e/desk-keyboard.spec.ts` owns E2EKBD01, red 30 s after its update). The
  shortcut listener ignores keys while any `dialog[open]`. There is no react-hooks ESLint
  plugin: an `eslint-disable-next-line react-hooks/...` comment fails lint. The keyboard
  audit script and probes are not in the repo (scratchpad only); the record is the doc.
- **Production sign-in breaks once the storefront and desk have their own hostnames**
  (2026-10-29, deployment plan F2). Better Auth builds every magic link on the one
  `BETTER_AUTH_URL` origin (`better-auth/dist/plugins/magic-link/index.mjs`, `realBaseURL.origin`),
  and the session cookie is host-only (no `crossSubDomainCookies` in `packages/auth`). Dev
  works only because `localhost` cookies are shared across ports. Fix before any deploy: the
  plan's D7 (recommended: Better Auth's dynamic base URL; Next's rewrite sets
  `X-Forwarded-Host` to the incoming host, `proxy-request.js`). The desk's Socket.IO then
  has to go through the desk's own host (D8), and `NEXT_PUBLIC_API_ORIGIN` is fixed at desk
  build time.
- **Scheduled jobs run on the process clock zone** (2026-10-29, plan F8): the BullMQ cron
  patterns carry no `tz`, so in a UTC container "daily 07:00" is 02:00–03:00 in Havana
  (plan D19: `TZ=America/Havana`).
- **Next's external rewrite neither adds nor appends `X-Forwarded-For`** (2026-10-28,
  `router-server.js:349` → `proxy-request.js`, http-proxy without `xfwd`; checked with Next's
  compiled http-proxy). The `??=` in `base-server.js` only runs for pages Next renders, not
  for `/api/ota/*`. Behind no edge proxy the API's `request.ip` on the storefront path is the
  Next server, for the rate limiter and the Plausible sink alike; see
  `docs/plausible-hosting-plan.md` F1/H3.
- **The machine can suspend during the 54-min `pnpm e2e`** (2026-10-26/27): tests then fail with
  `ERR_NETWORK_IO_SUSPENDED` or long timeouts, `timeout N` does not count suspended time (a
  rerun hung for hours), and next-servers left behind ignore SIGTERM, so Playwright reuses them
  and fails with `ERR_ABORTED`: `kill -9` the PIDs on 3000–3002, check `ss -ltnp`, delete
  `apps/*/.next`, rerun the failed specs alone.
- **Staff passkeys (2026-10-26):** Prisma `create` data with an unknown field passes `tsc` in
  `apps/api` (TS 6 + Prisma 6: no excess-property error), so a misspelt column (`actorId` for
  `actorUserId`) fails only at runtime, and a fake-Prisma unit test copies the mistake; read the
  model (`79c1980`). The guard now reads the settings for a staff session that is not a passkey
  one, so an app-level test's fake Prisma needs `withNoSettingsVersion()` (or an
  `OperatingSettingsService` override); hand-built gateways and `StaffService` take a
  `SessionPolicy` (`apps/api/test/fixtures/session-policy.ts` `fakeSessionPolicy()`). With the
  rule on, every staff link session is held back, including the e2e's `signIn()` users:
  `e2e/passkeys.spec.ts` is `serial` (a failure in a plain describe restarts the worker, whose
  `beforeAll` recreates the Super Admins without sessions, so the rule could not be switched
  off) and switches it off in `afterAll`. `signIn()` waits for the exact callback URL, so a
  held-back user signs in with `callbackPath: '/passkeys'`. The virtual authenticator is per
  page (CDP `WebAuthn.addVirtualAuthenticator` on that page); a second passkey on the same one
  is refused (excludeCredentials). A `selectOption` before hydration is lost and re-selecting
  the same value fires no change: toggle in the `toPass`. After a passkey sign-in, wait with
  `waitUntil: 'commit'` (the dev dashboard's `load` can exceed 5 s) and click only while still
  on `/login`. The reset email's subject is Spanish (tenant primary language).
- **Plausible sink (2026-10-27/28, routed 2026-10-28):** with `TELEMETRY_SINK=plausible` the
  mock still gets (and files) everything that stays first-party, server events included, but
  a consenting visitor's events go only to Plausible; keep the e2e/owner dev stack on `mock`
  anyway (there is no Plausible in dev). The endpoint is the full `/api/event` URL, not the
  Plausible site root. Plausible answers 202 even when its bot filter drops an event
  (`x-plausible-dropped: 1`), and it drops a backend/datacenter IP, so the proxy must forward
  the real client IP; server events have no visitor IP and may drop. A missing or invalid
  setting falls back to the mock with an error log. The event URL is synthetic
  (`/en/<Screen>`, `/admin/<A-Screen>`, `/server`), not the page path.
- **Server T-Events (2026-10-25):** they never pass through a browser, so e2e reads the mock
  sink's file: `playwright.config.ts` sets `TELEMETRY_SINK_FILE` (`e2e/telemetry.ts`
  `TELEMETRY_SINK_FILE`, `.telemetry/e2e-events.jsonl`, gitignored) and turbo passes it
  through. A dev stack started without it (Playwright reuses a running one) makes the specs'
  poll fail with `SERVER_EVENTS_HINT`; the owner's stack is now started with it. The file only
  grows; specs filter by `receivedAt`, and `.telemetry/` may be deleted. A new code path that
  writes a reservation status must call `ServerTelemetry.stateChanged` itself (or go through
  `ReservationsService.transition`, passing its reason code). `ReservationsService`,
  `PaymentsService` and `DispatchService` take `ServerTelemetry` last: a hand-built one in a
  test passes `new ServerTelemetry(new MockTelemetrySink())`. The dispatch test's fake Prisma
  returns the store's row and `update` mutates it, so read `from` before the update.
- **T-Events follow-ups (2026-10-25):** a desk event needs `app: 'admin'`,
  `consent: 'essential'` and a desk screen; the API reads the session for it, and on localhost
  the storefront's and the desk's cookies are shared across ports. An e2e asserting a desk
  event waits for the response of the batch that carries it (`page.waitForResponse` matching
  its post data): an earlier batch flushed during a navigation can lose its receipt body. A
  `toPass` loop that re-selects an option sends one event per attempt (assert `.at(-1)` or
  `toBeGreaterThan(0)`). `e2e/reservations.spec.ts` passes once per suite (E2E0001 leaves
  DRAFT; global setup resets it), so `--repeat-each` fails it. Stopping turbo: a
  `pgrep -f … | grep "turbo run dev"` pipeline also matches your own shell (it was killed once);
  take the PID from `ps -eo pid,cmd | grep "[l]inux-64/bin/turbo run dev"` (every alternative
  in the pattern needs the bracket, or it matches the calling shell). The Home search is a
  plain GET form: a submit before hydration posts with no shell listening, so an e2e waits for
  the screen's `page_view` before submitting.
- **T-Events (2026-10-25):** every e2e context starts with an `ota_consent` cookie (analytics
  refused) from `playwright.config.ts` `storageState`, built by `e2e/consent.ts` from the tenant's
  words version; a spec needing the banner clears it (`context.clearCookies({ name })`). A
  beacon's body (page being left) is invisible to Playwright (`postDataBuffer()` is null for
  `ping`), so assert fetch-sent batches (`e2e/telemetry.ts`). A new event or parameter must be in
  `TELEMETRY_EVENTS` or the sink refuses it, and the dev API must restart to load the rebuilt
  domain (`touch` a file under `apps/api/src`). Render events use `TrackEvent` with a once-ref
  (strict mode runs effects twice). A Next hot reload during a browser run remounts the shell and
  repeats a page_view (looked like a bug; it is not). Next's dev indicator sits over the phone
  bottom bar's first links in Playwright clicks. The record-consent request lists its sources;
  a new consent UI needs its source there.
- **Accessibility batch (2026-10-25):** `AxeBuilder` needs a page from `browser.newContext()`
  (a bare `browser.newPage()` throws "Please use browser.newContext()"); Playwright's `page`
  fixture is fine. Computed colours read back as `color(srgb …)` (and as `oklab(…)` mid
  transition), so the display e2e normalises with `rgb()` and polls past the switch's 120 ms
  transition. Custom properties read back resolved (`#6e665e`), never `var(...)`. The header and
  the bottom bar each mount a `SiteMenu` whose closed `<dialog>` stays in the DOM, so anything
  inside it needs `useId()` ids and `getByText` there needs `.filter({ visible: true })`. A
  `Table` that may scroll with no controls inside takes `scrollRegionLabel`. Every new desk form
  field needs `htmlFor`/`id` (repeating rows: suffix the row index), or the axe spec fails.
  `ERR_NETWORK_IO_SUSPENDED` on a desk `goto` was transient once (memory at 20/23 GB); rerun.
- **Phase 8 item 2:** `public/sw.js` duplicates `offlineAssetPaths` (tested in @ota/domain) and
  the kit cache name `ota-kit-v1` (`lib/offline-kit.ts`); change them together and bump
  `SHELL_CACHE` when the worker's caching changes. The worker fetches the offline pages with a
  pinned `Accept-Language` and no cookies, or next-intl redirects `/offline` to the browser's
  locale. A page loaded after a normal-mode page replays the brand fonts from memory cache as
  zero-byte requests: assert "no font download" from a fresh context. A Playwright browser keeps
  the worker for its context only; the owner's own browser keeps it on localhost:3000 (harmless:
  it never answers while the network works). Long labels in nowrap buttons break 320 px at
  larger text: use `WRAPPING_BUTTON` (`lib/button.ts`); grid items still need `min-w-0`.
  The worker registers on `load` and precaches one locale's offline page on purpose: precaching
  all three during the first page made the checkout e2e's wire page miss its 3 s window (found
  and fixed, `7781028`). In the first full e2e of the day both Next dev servers grew to ~7 GB
  and exhausted memory around test 48, hanging later tests; kill leftovers by PID and rerun.
- **M10:** repricing (`TravelersService.writePrice`) keeps `EVENT_TICKET`/`CONCIERGE_FEE` lines
  and re-adds them to the total; any new code that rewrites price lines must do the same. A
  CONFIRMED request's booking link may turn null (SET NULL), so never assume it. Event nights and
  categories are updated by id, never replaced. `EventsService` now takes the operating settings
  (public `answerHours`), so app-level fakes need `operatingSettings.findFirst` (the RBAC matrix
  has it). The events e2e owns E2EEVT01, every event named "E2E Concierge…" and **all** event
  requests of `traveler@example.test` (and the custom requests the BUILD path derived). The
  storefront event pages are cached 60 s like the packages; the e2e uses the seeded jazz event.
  `tenant/messages` has en and es only; French falls back.
- **Tooling:** running `npx prettier --write src` from inside an app ignores the root
  `.prettierignore` and reformats the generated `cuba-provinces.ts`; run prettier from the repo
  root. A JSON round-trip of the catalogs is byte-identical once prettier runs from the root,
  but `tenant/` is prettier-ignored, so format tenant JSON through `--stdin-filepath`.
- **DS 07:** `pnpm e2e` now runs seven projects; run one with `--project=default` or
  `--project=ds07-320`. The fixed bottom nav covers content in full-page screenshots; that is
  the capture, not the page.
- **M9:** a service constructed by hand in a test needs `fakeOperatingSettings()`; an app-level
  test's fake Prisma needs `withNoSettingsVersion(...)`. A function used as a `.map` callback must
  not gain an optional parameter. Client components import `lib/desk-clock.ts`, never
  `lib/operating.ts`. The settings e2e owns `settings-e2e-*@example.test` and "E2E" versions.
- **Dispatch rules:** fakes for `DispatchService` need `availability.findMany` and a
  `dispatchOffer.findMany` filtering by `supplierId: { in }`; the dispatch e2e owns E2EDSP02.
- **M6 and follow-ups:** the M6 e2e owns its two suppliers, E2ESUP01, "E2E M6…" cases and the
  `e2e-m6-power-trail` package; a URL-driven checkbox needs click + wait for the URL.
- `ServiceItem` keeps its `supplierId` after DECLINED/TIMEOUT until re-dispatch.
- **Nest re-raises the signal after its shutdown sequence.** Never leave a
  `process.on('SIGTERM')` listener attached.
- The shell defaults to Node 20: run `nvm use` before every pnpm call (Nest is 12.0.3).
- The dev API runs under `node --watch`, so editing `apps/api/src` restarts it mid-session.
- **Deployment:** never run the demo seed outside dev (it creates Super Admins); generated
  PDFs are on local disk (`DOCUMENTS_DIR`), not S3. A desk component must not send
  `booking_state_changed` (`wrong_surface`).
- **M8:** the disruption e2e owns booking E2EDIS01 and every case titled "E2E outage…" (it
  deletes their audit rows first); a desk form that seeds its state from props is keyed by
  the data it lists (`router.refresh()` keeps client state); each status-board booking renders
  two table rows (data, then actions), so e2e takes `.first()`; `/disruptions/alerts` is
  declared before `/:id`.
- **M7:** public advisory routes stay declared before `/:id`; the advisory e2e owns
  `advisory-ops-e2e@example.test`, booking E2EADV01 and every advisory headed "E2E storm
  watch"; a leftover published critical advisory adds a second "Travel advisory" region to
  every storefront page; the desk editor's two-column layout needs xl.
- **M6 extras:** its cases are in Matanzas, away from the seeded Pinar del Río suppliers; the
  Packages filter label renders twice (aside and hidden drawer).
- **M5:** `Proposal.acceptedVersionId` is unique (one-to-one); `ProposalsService` imports
  `Prisma` as a value for `PrismaClientKnownRequestError`; the retention fake needs
  `customRequest`/`proposalVersion` stubs; the M5 e2e owns a CustomRequest/Proposal/
  Reservation and deletes their audit rows first; the storefront-builder spec drives the
  whole M5 flow (no booking directly from `/custom`); proposal documents are validated by
  `proposalDocumentSchema`, so never write arbitrary JSON.
- **General:** ICU spaces break hydration (ops-format helpers and a `serverNow` prop);
  next-server processes survive `pkill -f 'next dev'` (kill by PID); tenant tokens sit on
  `<html>`; `cn()` from `@ota/ui`, with new type sizes registered in `cn.ts`; e2e `signIn()`
  lands on `/dashboard`; `getByLabel`/`getByText` match case-insensitive substrings (use
  `{ exact: true }` on shared words); Tailwind emits only literal class names; never import
  values from a `'use client'` module into a server component; rebuild a changed workspace
  package before the dev server sees it, and delete `apps/*/.next` after a build or a route
  move; API tests that depend on tenant values override `TENANT_CONFIG`; a live single test
  needs the workspace packages built first; an env variable set on `pnpm dev` reaches the
  apps only if turbo.json's dev task passes it through; an unset passport key → 503; never
  run `prisma format`; `traveler_affidavits` rows can be deleted but never updated;
  storefront client components take Intl-formatted text from the server or
  `plainSpaces(formatMoney())`; booking stamps the lead's nationality and phone, so e2e
  fixtures on traveler@example.test restore them; a `git rm` stays staged for the next
  commit; `json.dump` reformats the tenant manifest, so insert its keys as text; a balance
  due date is a UTC calendar day (`calendarDate`); Playwright's signal handlers are off in
  `@ota/documents` (the SIGTERM hang fix); to stop `pnpm dev`, signal
  `@turbo/linux-64/bin/turbo run dev`, not the top pnpm, and `pgrep -f "turbo run dev"`
  matches the calling shell; the `en` locale formats US dates in e2e expectations;
  `page.request` resolves relative URLs against the back-office (prefix storefront links);
  the notification scans mail every matching dev booking (filter Mailpit by booking code);
  a hand-built `ReservationsService` needs a `NotificationsService` stub.
- **AGENTS.md §C lines proposed (owner edit)**, in addition to the earlier ones still pending
  (M7, SIGTERM, document downloads, M8, graceful shutdown, Nest 12, M6, log redaction):
  - "2026-11-01: staff recovery codes (migration 20261101114418_staff_recovery_codes) are
    issued by a Super Admin at `POST /staff/:id/recovery-code` and redeemed by Better Auth's
    `POST /api/auth/sign-in/recovery-code` (a plugin in `packages/auth` asking
    `RecoveryCodesService.redeem`). The session records `signInMethod = recovery_code`,
    which `passkeyRefusal` holds to passkey setup and `sessionRefusal` ends after 15
    minutes. A time limit on a kind of session goes in `sessionRefusal` on `createdAt`,
    never in `expiresAt` (Better Auth's refresh extends it)."
  - "2026-10-31: feature flags are runtime settings (M9 D8b): the manifest's `features` are
    the defaults of seven keys in the operating-settings document, changed by two Super
    Admins. Read them through `OperatingSettingsService.features()`/`requireFeature()` (API,
    409 `FEATURE_OFF`), `getFeatures()` (storefront) or `getThresholds()` (desk), never
    `isFeatureEnabled(tenant, …)` in an app. A new flag-gated action calls `requireFeature`."
  - "2026-10-29: storefront touch sizes use the preset's `pointer-coarse:` variant
    (`@media (pointer: coarse)`): md buttons, Input and Select are 44 px on touch and 40 px with
    a mouse; stand-alone link lists take `TOUCH_ROW` (`apps/storefront/src/lib/button.ts`).
    The root scroll padding keeps focus clear of the sticky header, the phone's bottom bar and
    the compare tray (`globals.css`); a fixed or sticky bar added later must join it."
  - "2026-10-24: M10 rides on migration 20261024111639_events_concierge (events, nights, seat
    categories, translations, event_requests; CHECKs on seats 1–8, dates and frozen prices).
    Confirmed seats become EVENT_TICKET/CONCIERGE_FEE price lines; once the price is locked they
    are a TICKETS instalment. Repricing keeps those lines. Desk writes are Operations/Super
    Admin; travelers request under /me/event-requests."
  - "2026-10-24: e2e runs a `default` project plus six `ds07-<width>` projects for
    `e2e/responsive.spec.ts`; run prettier from the repo root (an app-level run ignores
    `.prettierignore`)."
  - "2026-10-24: storefront display preferences (larger text, low-bandwidth) are a device cookie
    `ota_display` read by the layout, never account data. `public/sw.js` answers from a cache
    only when the network fails (the opt-in offline kit, else `/[locale]/offline`); signing out
    deletes the kit. Type sizes are rem, so a size written in px does not scale."
  - "2026-10-25: reduce motion and high contrast are the same device cookie (`reduce-motion`,
    `high-contrast` → `<html data-motion data-contrast>`); the system settings apply the same
    overrides. `e2e/accessibility.spec.ts` runs axe (WCAG 2.2 AA, `@axe-core/playwright`
    4.13.0) plus a unique-id check on customer and desk pages; a new page goes in its list."
  - "2026-10-25: T-Events: the taxonomy lives in `packages/domain/src/telemetry` and the public
    `POST /telemetry/events` refuses anything outside it; `TELEMETRY_SINK` (mock) is the sink
    until Q10. Analytics events need the `ota_consent` cookie's analytics grant for the tenant's
    current `COOKIES_ANALYTICS` words; booking/payment/error events and `consent_set` are
    essential and carry no session or user id. Components declare `data-analytics-*` or call
    `useTelemetry().track()`; e2e contexts start with analytics refused."
  - "2026-10-25: desk T-Events are the `admin` app's essential operational events (surface
    `desk` in `TELEMETRY_EVENTS`), sent by `DeskTelemetryProvider` with no session id and no
    banner; the public intake admits them only for a live staff session (`sessionRefusal`) and
    stamps `role` itself, refusing a client-sent one. Components call `useDeskTelemetry()` after
    the API accepted the action."
  - "2026-10-25: server T-Events (surface `server`: `booking_state_changed` for every
    transition, `offer_*`) are sent by the API's global `ServerTelemetry` after each write,
    never awaited; no client may send them. A new reservation-status write reports itself (or
    goes through `ReservationsService.transition` with its reason code). `TELEMETRY_SINK_FILE`
    makes the mock sink append events as JSON lines; the e2e stack sets it."
  - "2026-10-26: every session records `signInMethod` (migration
    20261026135144_session_sign_in_method; only `/passkey/verify-authentication` makes
    `passkey`). The staff passkey rule (`staffPasskeysRequired`, a threshold) is enforced by the
    global `SessionPolicy`, shared by the guard, both Socket.IO gateways and the T-Events intake;
    a route a held-back staff session may reach is `@AllowWithoutPasskey()`. Better Auth's
    passkey-changing routes ask `SessionPolicy.changeRefusal` through `createAuth`'s
    `passkey.policy`. `PASSKEY_RP_ID` binds every passkey; `STAFF_PASSKEYS_OVERRIDE=off` is the
    break-glass."
  - "2026-10-28: with `TELEMETRY_SINK=plausible`, only events whose consent is not
    `essential` reach Plausible (`mayReachAnalyticsStore`); desk, server and refusing
    visitors' events stay on the mock and its file. `booking_code`, `request_id` and
    `from_path` never reach it (`LINKABLE_TELEMETRY_PARAMS`). Next's `/api/ota/*` rewrite
    does not add `X-Forwarded-For`, so a deploy needs an edge proxy that sets it and
    `TRUST_PROXY=1` (for the rate limiter too)."
  - "2026-10-27: `TELEMETRY_SINK=plausible` selects the Plausible CE sink (plain `fetch`,
    `POST /api/event`; `TELEMETRY_PLAUSIBLE_ENDPOINT`/`_DOMAIN`/`_SITE_URL`/`_USER_AGENT`/
    `_TIMEOUT_MS`); `mock` stays the default and the e2e's file sink. The adapter maps
    `page_view` to Plausible's `pageview`, sends synthetic event paths, the context and params
    as props, and the visitor's `X-Forwarded-For`; it never
    sends the session id or the HMAC user id. Plausible's bot filter drops a backend IP silently,
    so live hosting must forward the client IP or accept that `server` events may drop. A failed
    send is logged, never thrown."
  - "2026-10-29: desk shortcuts live in `apps/backoffice/src/components/desk-shortcuts.tsx`
    (`resolveShortcut` in `@ota/ui`); a row that `R` acts on is `data-shortcut-row` and its
    re-dispatch button `data-shortcut-redispatch="<alert>"`. An action that waits on input or
    a second approver uses `Button unavailableReason` (aria-disabled plus the reason), never a
    silent `disabled`; `disabled` is for busy states. `e2e/desk-keyboard.spec.ts` owns E2EKBD01."
  - "2026-10-29: desk alert acknowledgements and the 15-minute mute live only in `audit_logs`
    (`dispatch.alert_acknowledged` on the ServiceItem with `metadata.offeredAt`;
    `dispatch.alerts_muted`/`_unmuted` on entity `DispatchDesk`), per desk; the rules are
    `packages/domain/src/dispatch/alert-cue.ts`. A spec that mutes must delete its
    `DispatchDesk` rows. The cue is Web Audio in `apps/backoffice/src/lib/alert-sound.ts` and
    starts only after a user gesture."
  - "2026-10-31: the desk idle lock (migration 20261031091301_session_idle_lock:
    `session.lastActiveAt`, `session.ownDevice`) is enforced by `SessionPolicy` (401
    `SESSION_LOCKED`) for staff sessions not marked as own device, after
    `staffIdleLockMinutes` (threshold, default 30) with no input reported to
    `POST /me/activity`. Better Auth's session routes ask `SessionPolicy.gateRefusal` through
    `createAuth`'s `sessionGate`, except those in `routeOpenToRefusedSession`. Both gateways
    re-check sockets every minute. A staff fixture older than 30 minutes needs
    `lastActiveAt`."
  - "2026-10-31: the desk's dispatch alerts (board, `/ops` socket, cue, acknowledgements,
    mute, announcements) live in `DeskAlerts` (`apps/backoffice/src/components/desk-alerts.tsx`)
    in the dashboard layout, not in a page; every shell page but `/dashboard` shows
    `ShellAlertStrip`. Read them with `useDeskAlerts()`; never open a second `/ops` socket
    for the cue."
  - "2026-11-01: the new-device email (migration 20261101145749_staff_known_devices) runs in
    the `signInDevice` Better Auth plugin (`packages/auth/src/sign-in-device.ts`) on every
    route that creates a session; `SignInDevicesService` keeps SHA-256 of
    `<userId>:<ota_device cookie>`. Every staff sign-in in e2e sends one, so read Mailpit by
    subject, not by newest message."
  - "2026-11-01: permission overrides (migration 20261101202627_permission_overrides): every
    staff controller carries `@Capability(row)` (rows in
    `packages/domain/src/settings/overrides.ts`); the guard passes a role outside `@Roles` only
    with a running override, on a route an Operations Admin may use and not marked
    `@NotOverridable()`. The desk decides actions with `deskAccess(role, row)`. Tag new staff
    routes and add them to the RBAC matrix."

## Next
1. Owner: choose the next batch. An M9 deferred item: the IP allowlist (a policy doc first; its
   use depends on the deploy topology's proxy) or display currencies (the ECB feed is a Q10
   third party). M10's room holds/event photos need a migration doc first. Small, no
   migration: hide the customers pages' actions from Support unless a customers override runs
   (they show today and the API refuses). A real screen-reader run (desk and storefront) needs
   a machine with NVDA or VoiceOver. Optional: the desktop cookie banner still covers about
   61 % of a 1280 × 844 window (the board's layout; focus is now kept clear of it).
2. Owner: answer `docs/deployment-plan.md` D1–D24 and the §6 items marked (approval). Once
   answered, the deployment build (B1–B13, rehearsed locally, no spend) can be a batch; the
   plan recommends renting the server only when the agency's legal entity exists (D1).
   Counsel: the plan's §13 (sanctions first), `cookies-analytics@2026-10-28` and whether
   Plausible's data needs a retention limit.
3. Owner, still open: the M4/M5/builder placeholders and the crisis framework, counsel's legal
   texts (now including the events copy, the M10 invoice question, the cookie words, the basis
   for desk and server telemetry and the new decline/withdraw confirmations), OFAC categories,
   card surcharge, deposit refundability and proof retention, the passport-key backup, the
   backup-power wording, the staff email domain, `PASSKEY_RP_ID` with the deploy topology,
   raster app icons from Vereda, the AGENTS.md §C lines above. Then SMS once a provider is
   chosen. Also open: whether the M4 cancellation scale keeps a share of what was paid or of
   the total; the M5 sample terms (planning fee, validity, response hours); the pricing
   samples (child bands, fees); the M10 concierge fee and events copy.
4. Decision gates that stay with the owner (ask, never assume): schema migrations, new
   dependencies, the SMS provider and anything needing the agency's legal entity, a real LLM
   vendor, PII purge Tiers 2–3, load tests (plan D24), the deployment topology (plan D1–D24,
   which also settle the site domain, the analytics host, H3 and `PASSKEY_RP_ID`; D7 changes
   how auth decides, D20 revisits the approved Plausible H1a).

## Decisions (append-only)
- 2026-10-12 — the canvas ranks above the UI_UX research docs where they conflict (HANDOFF §1).
  This covers WhatsApp deep links only, EUR base, and passwordless sign-in.
- 2026-10-13 — the owner accepted the plan's recommendations (Q1–Q6, Q8–Q13). The canvas design
  replaces the 2026-09-26 design.
- 2026-10-13 — the motion tokens use the DS-Handoff values. The export's 0 ms values are the
  reduced-motion override (A1).
- 2026-10-13 — the four legacy presets are removed. The default preset was first named
  `islaAbierta`, after A-Settings.
- 2026-10-14 — the owner renamed the preset `vereda`: "Isla Abierta" was a placeholder name, and
  the agency is Vereda Expeditions. The design team is asked to follow (change request A8).
- 2026-10-13 — only the fonts' Latin subset is shipped: `next/font/local` cannot split one family
  by unicode-range, and Latin covers EN/ES/FR/DE/IT.
- 2026-10-13 — commits are made locally per increment on `vereda`, under the owner's approval of
  the plan. Nothing is pushed.
- 2026-10-14 — Q7: the worker app stays native (Expo, ADR 0001), Android first, sideloaded with
  a self-hosted update server. The PWA recommendation was withdrawn because the design's no-data
  features need native code (ADR 0007).
- 2026-10-14 — v1.2 adopted (ADR 0006 amendment). The dark tones are tokens rather than snaps.
  Field errors stay `error-600`. The palette key stays `vereda` despite the design's A8 answer
  (raised again in CR-02 A1).
- 2026-10-14 — the admin row tints are a `TableRow` `tone`, not app-level classes. The boards tint
  rows accent-50 (timer running low) and error-100 (expired).
- 2026-10-14 — Phase 2: no placeholder pages. A nav link renders only when its page exists;
  missing pages wait for the owner's order. The old admin pages keep working under their new
  section, with a tab row, until Phase 5 merges them. Redirects are 307 while the IA settles.
- 2026-10-14 — the storefront footer shows only live payment marks (SEPA, the wire rail) and
  contact lines set in the manifest. The card marks wait for the card gateway.
- 2026-10-14 — the owner took every recommendation:
  - pages in the order Support, Travel info, Blog, About;
  - only a draft Privacy notice among the legal texts;
  - Events after the policy and M10;
  - read-only admin Payments and Settings;
  - agency copy in `tenant/messages`.
  Placeholder or mock data is kept until real data is published, and each such page shows a
  sample-content notice.
- 2026-10-14 — the owner asked the build to resolve the design issues itself. Change request 02
  became a for-information notice, with the resolutions in the ADR 0006 and 0007 amendments.
  The offer SMS goes at T+0 by default.
- 2026-10-14 — "Talk to a specialist" shows from `xl` only, not as DS 07's `lg` text button,
  because the six links fill the `lg` header.
- 2026-10-14 — storefront path renames redirect with 307 until launch (as the back-office), then
  become 308. Only the 404 and 500 error pages are built; the other three wait for triggers.
- 2026-10-14 — Phase 3 built on today's data with no migration, one increment per commit. The
  boards' sample reviews and testimonials are not shown: real ones need consent. One copy set per
  route; the M-* boards' shortened strings are not used.
- 2026-10-14 — destination data is two tenant files (numbers and states) plus tenant content
  (words), so the data stays the same in every language. A destination links its packages by
  slug, not by province, because one province holds several destinations.
- 2026-10-14 — Packages filtering and Compare run client-side on the public list (no API
  change); the compare selection lives in session storage, a convenience only.
- 2026-10-14 — Join's agency copy is Spanish first (`tenant/messages/es.json`), as the board
  addresses Cuban partners; English is drafted.
- 2026-10-14 — copy that describes system behaviour follows the system, not the board: the
  sign-in link note does not promise 15 minutes (Better Auth expires it after 300 s).
- 2026-10-14 — Phase 5 Dashboard: the matrix's timer column sits right after the booking (the
  board puts it last) so the time left stays in view where the table scrolls; Open sits under
  the timer. Re-dispatch shows on amber, red and unassigned items only.
- 2026-10-14 — copy that describes behaviour follows the system: the who-acts legend says the
  desk starts dispatch (no auto-dispatch yet), a decline or timeout makes ACTION_REQUIRED, and
  there is no 48 h payment window, audio cue or 72 h SLA yet.
- 2026-10-14 — charts are one-hue bar lists named by text: no token triplet passes the
  categorical palette check (dataviz validator), so colour carries no identity.
- 2026-10-14 — Reports is one page (`/reports`, the §4.9 sections as anchors); `/analytics`,
  `/regulatory`, `/quality`, `/reports/regulatory` and `/reports/quality` redirect there (307).
- 2026-10-14 — M1 (Package v2) approved as D1(a)–D4(a): base text + one `PackageTranslation` overlay
  per locale; base price + tier delta + optional departure price; `status` replaces `active`
  (backfilled); agency-wide terms in the manifest with policy keys on the package. Migration not yet
  generated.
- 2026-10-14 — A-Suppliers is the register list; the detail page is the credential inspector.
  "Add supplier" is the `/suppliers/applications` recruitment path, not a create form. Reliability
  is the acceptance rate over the offer ledger; the board's Power and Last job columns wait for M6
  and a job-history source.
- 2026-10-14 — A-Payments stays read-only on today's data: the transaction ledger with status chips
  and rail labels. The refund queue, payout liabilities by province, next payout runs and rails
  health wait for M4 and a payouts source.
- 2026-10-14 — A-Customers adds an ops-only read model (`GET /customers`, `GET /customers/:id`);
  the list and profile show trips and the GDPR retention state. Passport, preferences, OFAC and the
  communication history wait for M2/M3. The old `/customers` → `/customers/retention` redirect is
  removed (the section home is `/customers`).
- 2026-10-15 — M1 generated and applied (`20261015000000_package_v2`): `Package.active` replaced by
  `status` (existing rows backfilled to PUBLISHED, `published_at` stamped) and the M1 catalog
  tables added. The package read model, the domain pricing/publish checks and the storefront
  tiers/departures/extras/day texts landed. The ops editor endpoints, the per-locale overlay,
  package media storage and slug redirects follow.
- 2026-10-15 — M1 write path: `POST`/`PATCH /packages` replace the tiers/departures/extras/days
  collections wholesale (same pattern as services); a slug change leaves a `PackageSlugRedirect`
  that the public `getBySlug` follows; `PUT /packages/:id/translations/:locale` upserts one locale.
  The editor UI, the public per-locale overlay, package media and the storefront 308 remain.
- 2026-10-15 — A-Package-Edit edits the M1 details and the tiers/departures/extras/day texts as
  inline lists saved in one PATCH; publishing runs the domain `packagePublishIssues` first. Media
  and the locale overlays are not in the form yet (they follow with media storage and the overlay
  read).
- 2026-10-15 — M1 closed: the public catalog overlays a `?locale=` published translation (nested
  days/tiers/extras/media by stable keys) and strips raw rows; the storefront 308s a retired slug
  to the current one; package media lives behind `packages/storage` at `packages/<id>/<uuid>.<ext>`
  with upload/serve/delete. The editor's media and locale tabs remain.
- 2026-10-15 — M2 (party and travelers) drafted in `docs/schema-m2-travelers.md` for review per Q9;
  no migration generated.
- 2026-10-15 — M2 approved as D1(a)–D4(a) and generated (`20261015010000_travelers`): app-level
  AES-256-GCM passport encryption, traveler/room/price-line tables, `ReservationRoom` rooming list,
  and `ServiceItem.travelerPrice` alongside the price lines. The surfaces follow.
- 2026-10-16 — M2 surfaces: price lines are frozen per line (each rounded; total = sum), so an
  invoice adds up; this can differ by a cent from M1's `calculatePackagePrice`, which rounds per
  group. Fees and child bands come from the manifest (M1 D4).
- 2026-10-16 — the passport cipher lives in `@ota/domain` as a separate `exports` entry rather than
  the index, because client bundles import `@ota/domain` and must not pull `node:crypto`.
- 2026-10-16 — no list shows any part of a passport number (the board's "ending 4471" is not
  drawn); the vault route returns it for one traveler, ops+super only, audited before it leaves.
- 2026-10-16 — repricing applies to package bookings only; a custom trip keeps the desk's total and
  refuses extras until custom pricing (M5 proposal). From PENDING_PAYMENT the price is locked; a
  booking priced before M2 keeps its total.
- 2026-10-16 — the custom builder's total is now the sum of its per-service prices (repeats
  counted), so the invoice's amounts add up; before, a repeated item was counted once.
- 2026-10-16 — `DELETE /reservations/:id/extras/:extraId` was added beside the requested POST so
  the panel can undo an extra.
- 2026-10-16 — Turbo dev passes `PASSPORT_ENCRYPTION_KEY` and `RATE_LIMIT_*` through; the
  e2e webServer's raised limits had silently never applied.
- 2026-10-16 — M3 drafted (`docs/schema-m3-compliance.md`); no migration until approved.
- 2026-10-17 — the owner approved M3 D1–D6 as recommended. The trigger also allows the
  recording user's link to turn null (a fourth ON DELETE SET NULL the draft missed).
- 2026-10-17 — legal texts are tenant content (`content.legal`, English source with fallback);
  the API stamps their version and SHA-256 and refuses a stale version, so a record proves which
  words were shown.
- 2026-10-17 — the voucher hold issues the invoice alone and audits `documents.held`, rather than
  failing generation, so the fiscal document is never blocked by OFAC.
- 2026-10-17 — the public cookie-banner consent route is deferred to the banner (Phase 8): no
  unused public write endpoint ships.
- 2026-10-17 — the online certification lives on the account trip page until the Booking form
  exists; the booking's owner may sign for each US traveler with that traveler's own name
  (counsel question recorded).
- 2026-10-17 — the brief pasted at the start of the session was an earlier next-session prompt whose
  tasks were all done; the owner chose to run the current prompt instead (Booking form, server
  publish checks, M4 draft).
- 2026-10-17 — guest provisioning: the owner chose **sign in first** (the magic link before the
  form) over creating an account at submit or confirming the email at submit. No public route
  creates users or bookings.
- 2026-10-17 — the publish checks run on any save that leaves a package PUBLISHED, not only on the
  move to PUBLISHED, mirroring the editor, so a published package cannot be edited into failing
  them; unpublishing is never blocked.
- 2026-10-17 — the Booking form sends choices only. The server derives each kind from the date of
  birth (an infant takes no bed, so a client-chosen kind could dodge a supplement) and builds the
  rooms from SHARE/PRIVATE; a private room is charged the tier's supplement per room of one.
- 2026-10-17 — the booking, party, lines, certifications and consents are written in one
  transaction after every check has passed, so a refused booking leaves nothing behind; the
  client sends the total it showed and a moved price is refused (409 `PriceChanged`).
- 2026-10-17 — the Booking form's design resolutions are recorded in the ADR 0006 Phase 4
  amendment (no new token).
- 2026-10-17 — M4 drafted with recommendations D1(a)–D8(a); the card fee defaults to 0 pending
  counsel (PSD2), and the first payment window's expiry goes to the desk rather than auto-cancelling
  while bank transfer is the only live rail.
- 2026-10-17 — the owner approved M4 D1–D8 as recommended and will take the counsel questions
  later; the sample terms ship as manifest placeholders and the card fee is 0 %.
- 2026-10-17 — a refund's receipt link is ON DELETE NO ACTION (the draft said RESTRICT), so a
  booking's cascade removes both rows in one statement.
- 2026-10-17 — the cancellation scale keeps its share of what was paid (A-Payments' worked
  examples); a traveler-cancellation quote applies it to everything paid on the booking, less
  refunds already made, drawn from the chosen receipt as far as it goes.
- 2026-10-17 — expired windows and overdue balances are derived on read (`paymentAlert` over
  each booking's next instalment) instead of a scheduled scan; the scan lands with the Phase 6
  reminders that need it.
- 2026-10-17 — the proof upload is on the trip page behind sign-in, not on the public wire page
  (a capability URL); the wire page points to it.
- 2026-10-17 — no PAYMENT_TERMS consent on payment yet: its words (the deposit's refundability)
  are a counsel question.
- 2026-10-17 — the JSON body limit fix (`099e0c0`) is route-scoped (upload routes at 15 MB)
  rather than global, so ordinary routes keep the 100 KB limit.
- 2026-10-17 — Phase 6 emails are branded with the tenant manifest and written in the traveler's
  locale (en/es/fr); the E-Received email is sent best-effort after the booking transaction and
  never rolls a stored request back.
- 2026-10-17 — the E-OFAC reminder is sent per booking from A-Customers, only for a trip with
  missing US certifications, and audited as `ofac.reminder_sent`; no OFAC record changes.
- 2026-10-17 — balance reminders are 7, 3 and 1 UTC calendar days before a DUE instalment. The
  audit log (`payment.reminder_sent` with `metadata.days`) is the idempotency ledger, so no
  migration was needed; the repeatable scan runs daily at 07:00 and `POST /payments/reminders/scan`
  forces a pass. A missed day is skipped, not caught up.
- 2026-10-17 — M5 is a draft only: a separate `CustomRequest`, versioned `Proposal` and
  `ProposalPriceLine`, a sign-in-only proposal and acceptance that creates an
  `ITINERARY_SUBMITTED` request to book. The owner's answers in `docs/schema-m5-proposal.md` decide
  the migration.
- 2026-10-17 — Task 3 (the Confirmation screen) was not built this session; it stays first in
  `Next`.
- 2026-10-17 — M5 approved and implemented as recommended: acceptance creates an
  `ITINERARY_SUBMITTED` request to book; the proposal page is sign-in only; the planning fee is
  transparency copy and is not added to the amount due; validity is 21 days with expiry derived on
  read; price lines are normalised and the route/days/options narrative is a validated JSON
  document; retention keeps totals/dates and redacts names, free text and the PDF. Migration
  `20261017181739_custom_proposals` applied.
- 2026-10-17 — M5 service items are created from the request's chosen catalog items; custom price
  lines are price-only until the desk maps them to services. The full designed builder and
  structured stops/days/options editing are follow-ups; the D-Proposal PDF waits for Phase 6.
- 2026-10-17 — the Confirmation screen is a standalone page like the board (not inside the Account
  frame), reached only after money was received; the booking-ease CSAT is not drawn (it needs a
  field), and the trip Review shows only on COMPLETED trips (ADR 0006 Confirmation amendment).
- 2026-10-17 — the trip detail gained `trip` (localized package/tier names) and `travelers`
  (names only) additively, rather than a second endpoint.
- 2026-10-18 — the proposal PDF is attached to the proposal email (the account's own address);
  the proposal page stays sign-in only, and a render failure never blocks sending a version.
- 2026-10-18 — the renderer relaunches a lost Chromium (a real bug: one dead browser failed every
  later document until restart); reproduced, captured in `pdf.test.ts`, disproved live.
- 2026-10-18 — the 7/3/1 reminders cover balances only; deposits and full payments are windows
  and get the 24 h/2 h reminders, recorded per deadline so an extension is reminded again.
- 2026-10-18 — E-NPS is adapted to the Review model (1–5) because a 0–10 score needs a field;
  E-Reconfirm is reduced to what the platform holds; E-Advisory and E-Options wait for M7/M8.
- 2026-10-18 — Task 2(c), the full designed Custom builder, was not started: the brief asks to
  ask the owner first.
- 2026-10-18 — the owner took every recommendation: (1a) hide work orders from travelers and
  refuse their download; (2a) build the designed builder with no migration; (3a) provider
  tracking from the dispatch ledger; (4) draft M7 first.
- 2026-10-18 — the builder's styles and sample rates live in the manifest (`customBuilder`,
  placeholder), not in code; option words live in the core catalogs so a fork overrides them in
  `tenant/messages`. Province names for the desk come from a domain list of the 16 ISO codes.
- 2026-10-18 — the builder asks no name, email or phone (it is behind sign-in) and records no
  90-day consent (no purpose fits); the request stays sign-in only.
- 2026-10-18 — M7 is drafted as advisories only (D1a recommended); blog, FAQ, media and
  conditions stay tenant content until a CMS decision.
- 2026-10-18 — the owner approved M7 D1a–D8a as recommended (advisories only; superseding
  versions; province-code regions; approval table with two distinct approvers for critical;
  audit-log delivery ledger; per-locale translations; caution/critical emails within 60 days;
  critical acknowledgements). Migration to be generated next session.
- 2026-10-18 — the owner approved limiting document downloads to the booking's owner and the
  operations roles (closes the SERVICE_WORKER gap); not implemented this session.

- 2026-10-18 — M7 generated and built as approved; the build added `request-changes`, a public
  history and an acknowledgements read, a row lock on approvals, and the window-overlap rule for
  E-Advisory (`docs/schema-m7-advisories.md` §7; ADR 0006 M7 amendment).
- 2026-10-18 — a critical advisory's first approval may come before every translation; only the
  publishing approval checks them (D6 says a missing translation blocks *publishing*).
- 2026-10-18 — info/caution dismissal is a first-party cookie rather than localStorage, so the
  server leaves dismissed banners out and nothing flashes back; it holds advisory ids only.
- 2026-10-18 — the SIGTERM fix is the narrow one (Playwright's handlers off); Nest
  `enableShutdownHooks` was not added, because a hanging `onModuleDestroy` (BullMQ close) would
  bring the same symptom back. Graceful shutdown for deploys is a separate decision.
- 2026-10-18 — document downloads limited to the owner and the ops roles, as approved.
- 2026-10-18 — M8 drafted with recommendations D1(a)–D9(a): manifest playbooks, a case with
  attached bookings, desk-set severity, one option set per case with a deadline whose default is
  derived on read, choice behind sign-in, the desk executes choices with existing tools, a
  per-booking status board, an advisory link, the audit log as case log, compensation via M4.
- 2026-10-18 — the owner approved M8 D1a–D9a as recommended (manifest playbooks; cases with
  attached bookings; desk-set severity; one option set per case with a deadline and a default
  derived on read; choice behind sign-in; the desk executes choices; a per-booking status board;
  the advisory link; the audit log as case log; compensation via M4). Migration next session.
- 2026-10-18 — M8 generated and built as approved (`docs/schema-m8-disruptions.md` §7; ADR 0006
  M8 amendment). The build decided: the traveler answers once (changes go through the desk); the
  desk records phone answers at any time and confirms the default only after the deadline; the
  option set is fixed once sent; a re-send to an unanswered booking is a new offer; a case is not
  reopened; the case drafts its banner through `POST /disruptions/:id/advisory` (MINOR→INFO,
  MAJOR→CAUTION, EMERGENCY→CRITICAL, three days); writes are Operations/Super Admin only.
- 2026-10-18 — Graceful shutdown (Task 2) raised with the owner as a question with options; not
  built.
- 2026-10-18 — the owner chose to build graceful shutdown with a timeout (close BullMQ, Redis and
  the PDF browser; force-exit after about 10 s so a hung close cannot recreate the SIGTERM hang),
  over waiting for the deploy topology or keeping the immediate exit. Next session.
- 2026-10-19 — graceful shutdown built with Nest's hooks and a forced exit armed on the first
  signal, as decided. The PDF browser and Prisma close after the HTTP drain
  (`onApplicationShutdown`) so in-flight renders finish. The dispatch scheduler, never closed
  before, is closed on destroy.
- 2026-10-19 — M6 drafted with recommendations D1(a)–D9(a): one `supplier_resources` row per
  supplier with a single confirmation stamp; staleness, the last job and the console's resources
  derived on read; desk-only writes (ops+super); vehicle/guide details and the storefront filter
  deferred. No migration until approved.
- 2026-10-20 — the owner approved M6 D1a–D9a as recommended (one `supplier_resources` row with
  a confirmation stamp; 7-day staleness, last job and the console's resources derived on read;
  desk-only writes; vehicle/guide details and the storefront filter deferred; audit log as
  history; no retention change). Migration next session.
- 2026-10-20 — the owner approved redacting cookies, authorization and set-cookie from the API
  log (`nestjs-pino` `redact`). Next session.
- 2026-10-20 — support staff stay read-only: supplier resources (M6 D4) and the M8 status board
  are written by Operations Admin and Super Admin only.
- 2026-10-20 — M6 built as approved (§7 of `docs/schema-m6-suppliers.md`). The build decided: a
  driver without litres is None and fuel 0 is not backup; the backup filter keeps stale rows,
  greyed; a casa must state its generator and a casa without one gives no generator details;
  WORKER_APP is refused on the desk route; every confirmation replaces and restamps the row;
  "involved" counts OFFERED/ACCEPTED/FULFILLED items; the console lists verified, unexpired
  suppliers with power or fuel, fresh first, plus the manifest's emergency contacts.
- 2026-10-20 — the register and inspector DTOs extend `SupplierDto` (`SupplierRowDto`,
  `SupplierDetailDto`) rather than changing it, so the verification, credential and expiring
  routes keep their shape.
- 2026-10-20 — "Backup power only" follows the board's checkbox (not a chip); the board's
  "Expiring ≤ 30 d" checkbox is not built.
- 2026-10-20 — log redaction built as approved: the three headers, with a test that logs a real
  request through the API's options.
- 2026-10-23 — the owner asked for both M6 follow-ups and the M9 draft. D7(b): the vehicle lives
  in the existing `vehicle_details` JSON and its insurance date is informational (no dispatch
  effect). D6(b): the public claim rests only on a casa confirmation under 7 days old, a package
  qualifies only when every stay does, and the wording avoids "guaranteed".
- 2026-10-23 — the register's reliability footnote was reworded to what the system does (copy
  follows the system, 2026-10-14); enforcing an 85 % floor is left to the owner (M9 D2).
- 2026-10-23 — M9 drafted with recommendations D1(a)–D9(a); no migration until approved.
- 2026-10-23 — the owner approved M9 D1a–D9a as recommended. The reliability floor (D2 note)
  stays open: the owner asked what "dispatch never checks reliability" means.
- 2026-10-23 — the owner chose to enforce both: dispatch skips suppliers below 85 % acceptance
  (after 5 answered offers; assumed, as proposed) and suppliers who blocked any day of the
  service. The desk keeps a manual offer for below-floor suppliers (the board's rule); blocked
  days are never overridden. Scorecards count answered offers only.
- 2026-10-23 — M9 built as approved (§7). The build decided: defaults = code constants + the
  manifest's payment terms, merged by the API; promotion to Super Admin rides on the invite table
  (no pending-promotion store); the token is generated when an invite is sent and stored hashed;
  acceptance needs a fresh account or a staff member; nobody changes their own role or
  deactivates themselves; the session limit and link validity are env config; copy that states a
  threshold takes the value in force.
- 2026-10-24 — the owner chose the M10 (Concierge/Events) draft plus the Phase 8 DS 07 widths,
  then approved M10 D1a–D10a as recommended (`docs/schema-m10-events.md`): events in the
  database with a desk editor; the three paths with a derived M5 request; confirmed seats as
  price lines plus a TICKETS instalment once the price is locked (the invoice question goes to
  finance/counsel); sign-in first; the 48 h answer as an M9 threshold; no dispatch for tickets.
- 2026-10-24 — the owner chose Phase 8 item 2 next (PWA, low bandwidth, larger text), with the
  display preferences per device in a cookie rather than per account (no migration), and the
  axe audit not yet. Built: the rem type scale, the cookie modes, a network-first service worker
  with an opt-in offline kit deleted at sign-out, the offline page and pill (ADR 0006 amendment).
- 2026-10-25 — the owner chose the accessibility batch (reduce motion and high contrast plus the
  axe audit) and the `@axe-core/playwright` 4.13.0 pin (the newest release older than two weeks;
  the handoff had proposed 4.11.x). The build resolved high contrast from existing tokens (alias
  text and border steps darker, also under `prefers-contrast: more`) and worded Reduce motion's
  help "No animations or transitions" (nothing cross-fades at 0 ms); ADR 0006 amendment.
- 2026-10-25 — the owner chose Phase 8 item 1 (T-Events) next, against a mock sink behind a public
  API route that only logs, on the storefront funnel first. The build resolved: the taxonomy is
  enforced by the sink (unknown events/parameters refused), the funnel stage is derived
  server-side, the user id is an HMAC keyed by `AUTH_SECRET`, `consent_set` is essential, no
  marketing switch for a tenant without marketing words, and the banner is a non-modal region
  (ADR 0006 amendment).
- 2026-10-25 — the owner chose the T-Events follow-ups next, and for the desk chose operational
  events only (essential, `role` from the session, no session/user id, no device storage, no
  banner) over a desk cookie banner or legitimate-interest analytics. The build resolved: each
  event names its surface; the role is never taken from the client and only from a live staff
  session; board parameters the desk or storefront cannot know are left out (seats left, the
  draft locale, one-click re-dispatch, approval amounts); `payment_succeeded` and
  `gallery_opened` are not built (no gateway result, no gallery viewer); an event before the
  page is left is sent at once (ADR 0006 amendment).
- 2026-10-25 — the owner chose the server-side T-Events next (over the real sink, an M9/M10
  migration doc or the manual accessibility pass), and recorded Plausible CE as the preferred
  sink and the staff passkey policy as the preferred M9 item for later. The build resolved:
  `booking_state_changed` moves to the API for every transition and the desk stops sending it
  (one count per move); `actor` adds `worker`; `reason` is a trigger code; the board's hashed
  `worker_id` and `decline_reason` are left out (no worker id was promised to the owner, and the
  reason is free text); events are fire-and-forget after the write; e2e reads a mock-sink file
  rather than a new read route (ADR 0006 amendment "server-side T-Events").
- 2026-10-26 — the owner chose the staff passkey policy next (over the Plausible sink, M10's
  migration doc and the manual accessibility pass), and approved `docs/schema-m9-passkeys.md` as
  recommended: P1a (a two-Super-Admin switch in the thresholds, off by default), P2a (a
  migration: `session.signInMethod`, so the rule fails closed, over hooks that block link
  sign-in or a marker in Better Auth's verification table), P3a (a setup-only session, no grace
  period), P4a (passkey changes need a passkey session except the first; audited and emailed),
  P5a (a Super Admin reset; `STAFF_PASSKEYS_OVERRIDE=off` break-glass; recovery codes stay
  deferred), P6a (`PASSKEY_RP_ID`, the agency name, pinned origins, user verification
  required), and `@better-auth/passkey` as a back-office dependency. The build added the
  gateways' missing session checks, put "Your passkeys" on `/passkeys` (every staff role, not
  the Super-Admin-only Security tab), and resolved the screens with existing components (ADR
  0006 amendment of 2026-10-26).

- 2026-10-27 — the owner chose the real analytics sink next: a Plausible CE `TelemetrySink`
  adapter with plain `fetch`, tested against a fake, no new dependency and no new image; live
  hosting stays open (Q10). The build resolved: one `POST /api/event` per event to
  `TELEMETRY_PLAUSIBLE_ENDPOINT` with the site domain; `page_view` mapped to Plausible's
  `pageview`; synthetic event paths; context and params
  as custom props, lists comma-joined; no session id or HMAC user id (Plausible counts visitors
  itself); the visitor's IP forwarded as `X-Forwarded-For`; a failed or bot-dropped event logged
  and swallowed; the mock remains the default and the e2e's file sink; a bad setting falls back
  to the mock.

- 2026-10-28 — the owner chose the live Plausible hosting decision next (over an M9 deferred
  item, M10's room holds/photos and the manual accessibility pass). The session wrote
  `docs/plausible-hosting-plan.md` first, as the brief asks, and asks before any spend or
  topology choice. It recommends H1a (its own EU VPS), H4a (only analytics-consented events),
  H5 (forward the User-Agent), H6a (strip identifiers, no TTL) and H7 (a new placeholder
  words version).
- 2026-10-28 — the owner approved the hosting plan as recommended: H1a (CE on its own EU VPS,
  which the owner buys; no image in the repo), H4a (only events whose consent is not
  `essential` reach Plausible, over sending everything or every storefront event), H5
  (forward the User-Agent), H6a (strip `booking_code`/`request_id`/`from_path` and keep the
  data with no retention limit, over a ClickHouse TTL) and H7 (a new placeholder words
  version now, over waiting for counsel). The build routes in a sink wrapper rather than in
  the adapter, so `PlausibleTelemetrySink` stays a plain transport and the mock keeps its file.
- 2026-10-29 — the owner chose the manual keyboard/screen-reader pass on the desk next (over
  the deployment build, unanswered, another M9 item and M10's deferred items); Plausible CE
  is not installed. The build fixed what the pass found and resolved the board's gaps
  (an off switch for single-key shortcuts, the sticky column at every width, state filters
  kept as links, announcements from crossings only); it deferred the audio cue, `A` and the
  mute (acknowledgement semantics are the owner's call) and `/` (no desk search).
- 2026-10-29 — the owner chose the same manual pass on the storefront's DS 02–05 rules next
  (over the desk acknowledgement, another M9 item, M10's deferred items and the unanswered
  deployment build); Plausible CE is still not installed. The owner also decided what
  acknowledging a desk alert means, for when that batch is built: **per desk, audited** (one
  operator's acknowledgement silences it for everyone; acknowledgements and mutes go to the
  audit log; no migration). The build met DS 02's "on touch screens" with a
  `(pointer: coarse)` variant rather than a breakpoint (a tablet with a mouse keeps 40 px), kept
  stand-alone text links at their line height where WCAG 2.5.8 passes (tall rows only for
  footer/header/strip lists), kept the language links in the phone header (currency is M9 D7),
  and deferred the design changes (stacked table cards, room for the cookie banner, the
  custom date picker).
- 2026-10-29 — the owner chose the desk's alert acknowledgement with the audio cue and
  "Mute 15 min" next (over the storefront's deferred design changes, another M9 item and
  M10's deferred items; the deployment plan is unanswered and Plausible CE is not
  installed). The build kept the state in the audit log (no migration), acknowledged red
  alerts only (amber has no repeat), keyed an alert by item and offer, made the undo local
  with the record written after the toast, offered no per-device sound switch (only the
  logged mute or an acknowledgement silences the cue), left support read-only, and sounded
  the cue on the dashboard only.
- 2026-10-29 — the owner asked that `docs/next-session-prompt.md` hold only what starts a
  session (orient, tasks, standing rules, environment) and never repeat handoff content. The
  prompt went from about 300 lines to 54; the traps and open questions that lived only in it
  moved to this handoff (Traps, Next items 3–4, the live-test list under Verified).
- 2026-10-29 — the owner chose the storefront pass's deferred design changes next (over an
  M9 item, M10's deferred items and the deployment build; the deployment plan is
  unanswered and Plausible CE is not installed), without the custom date-range picker (the
  native fields stay). The build stacked tables below sm per DS-Responsive with one
  data-driven `ResponsiveTable` (pages are server components, so no context), divided the
  cards by the row rule rather than boxing them, kept the board's full banner from md, and
  on a phone put the purposes behind a disclosure instead of shrinking the copy.
- 2026-10-31 — the owner chose the desk idle lock next (over the new-device email, runtime
  flags and the cue on other desk pages; the deployment plan is unanswered and Plausible CE
  is not installed) and approved `docs/schema-m9-idle-lock.md` as recommended: L1(b) every
  staff session locks unless marked "own device" at sign-in, L2a a `session.lastActiveAt`
  column (one migration with `session.ownDevice`), L3a only real input counts, reported at
  most once a minute, L4a unlocking is a passkey sign-in in place, L5a a locked session is
  refused everywhere including Better Auth's routes and the sockets, L6a a two-Super-Admin
  threshold (default 30, 5–240, no off), L7a the A-States lock dialog keeping the page. The
  build accepted the own-device mark only within ten minutes of sign-in, left out the
  passkey rule from Better Auth's gate (setup needs those routes), had the 401 carry the
  limit so a page rendered locked can name it, showed both unlock paths when the page could
  not tell whether the person has a passkey, and put the lock's axe check in its own spec.
- 2026-10-31 — the owner chose runtime feature flags next (M9 D8b; over the new-device email,
  the cue on other desk pages and recovery codes; the deployment plan is unanswered and
  Plausible CE is not installed) and decided as recommended: two Super Admins per change
  (over a one-person kill switch), the API refuses what an off flag covers (over pages only),
  and `interactiveSvgMap` gates the map (over listing it as unused). The build put the flags
  in the thresholds document (no migration), gated the builder's older
  `POST /me/reservations` too, refused after body validation and a traveler's ownership
  check, kept a transfer already started payable by proof, and closed `/custom` before
  asking anyone to sign in.
- 2026-10-31 — the owner chose the desk's alerts on every page next, with the flag-off
  notices on Applications and Custom proposals (over recovery codes, the new-device email
  and the IP allowlist; the deployment plan is unanswered and Plausible CE is not
  installed). The build moved the alert state into the dashboard layout rather than
  duplicating it per page (one socket, one cue, and the cue's memory survives navigation),
  reused A-Dashboard's strip with a per-booking Acknowledge where no matrix row exists,
  kept the undo open across page changes, announced "Press R" only on the dashboard, and
  showed the notices to every staff role with a link to the thresholds tab.
- 2026-11-01 — the owner chose staff recovery codes next (over the new-device email,
  permission overrides and small fixes alone; the deployment plan is unanswered and
  Plausible CE is not installed), with `A` on a booking's services and the `/join` empty
  state alongside. The design turned out to describe a Super-Admin-issued one-time code,
  not self-service backup codes (the question's wording had said "without help"); the owner
  approved `docs/schema-m9-recovery-codes.md` as recommended after that was pointed out:
  R1a (the board's issued code), R2a (a `staff_recovery_codes` table over Better Auth's
  verification table), R3a (setup-only, and issuing removes the person's passkeys), R4a
  (12 Crockford characters, five wrong tries), R5a (any one Super Admin, never oneself).
  The build enforced the 15-minute session on the sign-in time rather than `expiresAt`,
  refused issuing for a deactivated account, put the issue action on the user's row with
  Security linking to it, and had `A` on a booking page acknowledge only that service.
- 2026-11-01 — the owner chose the new-device email next (over permission overrides, M10's
  room holds and event photos, and the IP allowlist; the deployment plan is unanswered and
  Plausible CE is not installed) and approved `docs/schema-m9-new-device-email.md` as
  recommended: N1a a device cookie, N2a a `staff_known_devices` table (forgotten after 180
  days), N3a every unknown device emails, the first included, N4a staff only, N5a a
  two-Super-Admin threshold on by default, N6a resets, recovery codes and deactivation forget
  devices. The build hashed the person's id with the cookie so a shared desk PC stays known to
  each person, kept the label language-neutral, wrote the email in UTC (no tenant time zone)
  as its own template, and put the switch on Thresholds rather than as a checkbox on Security.
- 2026-11-01 — the owner chose permission overrides next (over M10's room holds and event
  photos, display currencies and the IP allowlist; the deployment plan is unanswered and
  Plausible CE is not installed) and approved `docs/schema-m9-permission-overrides.md` as
  recommended: O1a one matrix row for one person for a limited time, O2a only rows the role
  views and never a Super Admin row (so only Support asks), O3a an override never approves,
  O4a any one Super Admin approves, O5a a two-Super-Admin threshold (default 24 h, 1–24) and
  early ends on a role change, deactivation and the resets, O6a a `permission_overrides`
  table, O7a routes tagged with their row and every change audited, O8a an email to every
  Super Admin. The build also kept refund rejects and advisory change requests with the role
  (they are votes), required the route to admit an Operations Admin, put the request on each
  view-only page instead of a blocked page and the lists on Permissions, and gave the booking
  page's cards their own rows.
