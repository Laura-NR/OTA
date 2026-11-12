# Handoff — vereda — updated 2026-11-12 21:45

## Goal
Build the design team's handoff into the platform. The current handoff is `design/vereda-v1.2/`;
`design/vereda-v1.1/` is kept for the record. Plan and phases: `docs/design-v1.1-plan.md`.
Decisions: ADR 0006 (design system; amended through 2026-10-24 for Phase 4, M4–M10, Phase 6, the
Confirmation screen, the Custom builder, the DS 07 widths, Phase 8 item 2 and, on 2026-10-25,
reduce motion, high contrast, the axe audit, Phase 8 item 1, T-Events, its follow-ups and the
server-side T-Events, on 2026-10-26 the staff passkeys, on 2026-10-27 the Plausible CE sink
on 2026-10-29 the accessibility passes, the alert cue and the storefront design changes, and
on 2026-10-31 the desk idle lock, the runtime feature flags and the alerts on every desk
page, on 2026-11-01 the staff recovery codes, the new-device email, permission overrides and
display currencies, on 2026-11-02 the Super Admin IP allowlist, on 2026-11-04 the emails'
"about" lines, on 2026-11-06 the package editor's refusals, on 2026-11-07 "Keep building the
trip", on 2026-11-09 the AI assistant flag and the worker app's first screens, on 2026-11-10 the
desk's worker sign-out, on 2026-11-11 W-Calendar, its block reasons and W-Earnings) and
ADR 0007 (worker
app; amended 2026-11-09 for the first slice, 2026-11-10 for the desk's sign-out and 2026-11-11
for W-Calendar, again for its block reasons and for W-Earnings). The worker app:
`docs/worker-app-plan.md` (approved W1, W3, W7; §7 as built). W-Earnings' payouts:
`docs/schema-w-earnings.md` (**proposed E1–E8, awaiting the owner**, a migration; §7 is the
read-only slice as built). W-Calendar's block reasons: `docs/schema-w-calendar-reasons.md`
(approved K1a–K6a 2026-11-11, §7 as built, a migration). Staff passkeys:
`docs/schema-m9-passkeys.md` (approved P1a–P6a, §7 as built). The idle lock:
`docs/schema-m9-idle-lock.md` (approved L1(b), L2a–L7a, §7 as built). Recovery codes:
`docs/schema-m9-recovery-codes.md` (approved R1a–R5a, §7 as built). The new-device email:
`docs/schema-m9-new-device-email.md` (approved N1a–N6a, §7 as built). Permission overrides:
`docs/schema-m9-permission-overrides.md` (approved O1a–O8a, §7 as built). Display currencies:
`docs/schema-m9-display-currencies.md` (approved C1a–C7a, §7 as built; the emails' lines C7b
§8, 2026-11-04). The IP allowlist:
`docs/schema-m9-ip-allowlist.md` (approved I1a–I7a, no migration, §6 as built). The analytics sink: ADR 0006's 2026-10-27 amendment and `docs/runbook.md` "Analytics
events (T-Events)".

## State
- **2026-11-11 (evening): W-Earnings, read-only**, the owner's pick over W-Credentials,
  background resend and W-Job (`93b7ccb`…`a5e9c39`). No migration, no new dependency, one
  route.
  - Domain `packages/domain/src/worker/earnings.ts`: `isFinishedJob` (taken, service ended,
    booking not cancelled), `workerPayoutState` (ACCRUED/PROCESSING → PENDING, SETTLED → PAID,
    FAILED → ISSUE), `workerEarnings` (cents; pending, this month and paid this year on
    Havana's calendar; issue; the newest 20), `workerReliability` (every offer, the thresholds'
    floor and minimum). 9 unit tests.
  - API: `GET /worker/earnings` (`SERVICE_WORKER`, own profile; RBAC matrix +1);
    `apps/api/src/suppliers/payouts.ts` (read filter, cents, DTO);
    `SupplierDetailDto.payouts` through `SuppliersService.payouts` (same rule).
  - App: `EarningsScreen.tsx` from W-Home's "Fiabilidad y pagos": score or "—" with "llevas N
    de 5", the three shares and the floor, Pendiente / Este mes / Pagado · trabajos de <año>, a
    failed payout notice, Historial with state chips. Needs a connection; pull to refresh.
  - Desk: the supplier page's "Payouts" panel (four tiles with job counts, en/es/fr).
  - e2e: `worker-app.spec.ts`'s fifth test (an accepted job ended an hour ago, unpaid, and a
    paid one; the app and the desk panel read both).
  - Found: nothing in the API sets `FULFILLED` or `SETTLED`, so a job is finished by its end
    date and "Pagado" stays 0 until payouts can be recorded; reviews rate the booking, not a
    worker. Both wait on `docs/schema-w-earnings.md` (proposed: `supplier_payouts` table,
    `service_items.payout_id`, `supplier_profiles.payout_method`; E1–E8).
- **2026-11-11: the pull request's CI is green.** The owner pushed `vereda`; run 43093630546 on
  `b018609` passed every step, including "Install the PDF browser" and Test. No `v*` tag yet,
  so the Release workflow has not run.
- **2026-11-11 (later): W-Calendar's block reasons**, the owner's pick, approved K1a–K6a as
  recommended (`717e228`…`f88183f`). One migration, `20261111171409_w_calendar_block_reasons`
  (nullable enum `availabilities.block_reason`: FAMILY, VEHICLE_REPAIR, OTHER_JOB, OTHER;
  applied to the dev DB). No new dependency, no new route.
  - Domain `WORKER_BLOCK_REASONS`, `workerBlockReason` (picked, else `OTHER`; none when freed).
  - API: `PUT /worker/availability` takes an optional `reason`, written on every changed day
    and in the audit metadata (`reason`); the calendar's days carry `reason` (blocked days
    only). The desk's `AvailabilityDayDto.blockReason`; the desk's upsert writes `NULL` (K4).
  - App: "Motivo" chips (radio groups, 48 dp) under a blocked day (saves at once, "Motivo
    guardado: …") and on the range card ("Otro" by default); the day's spoken label ends with
    its reason. Desk: the supplier calendar tooltip "Blocked · Vehicle in the garage" (en/es/fr).
  - e2e: `worker-app.spec.ts`'s fourth test picks Familia on a day and Carro en taller on a
    range, and reads the desk tooltip.
- **2026-11-11: CI fixed.** The pull request's CI (runs 42478297525 on 2026-11-08 and
  43009958771 on 2026-11-11) failed in Test: `apps/api/test/shutdown.test.ts` renders a real PDF
  and the runner had no Playwright browser. `c0026a9` adds "Install the PDF browser"
  (`pnpm --filter @ota/documents exec playwright install --with-deps --only-shell chromium`)
  before Test in `.github/workflows/ci.yml`; `release.yml`'s gate is that workflow, so the first
  tag would have failed the same way. Green on GitHub since (run 43093630546, see above).
- **2026-11-11: W-Calendar** (Phase 7), the owner's pick: built on the existing tables, with a
  migration document for the block reasons (`dab1360`…`d69336f`). No migration, no new
  dependency.
  - Domain `packages/domain/src/worker/calendar.ts`: day states (job > offer > blocked >
    available, Havana days), `workerDaysRefusal` (past, backwards, past the end of the twelfth
    month ahead, more than 62 days), `planWorkerDays` (job and offer days kept),
    `longBlockedRun` (more than 14 in a row from today). 10 unit tests.
  - API (`SERVICE_WORKER`, own profile; RBAC matrix +3 rows): `GET /worker/calendar?month=`
    (days, jobs ACCEPTED/FULFILLED on live bookings, open offers, `longBlock`, `fuel` for
    drivers), `PUT /worker/availability` (`{from,to,isAvailable}`; `updateMany` + `createMany`
    in one transaction; one `supplier.availability_set` audit row with `days` and `via:
    WORKER_APP`), `PUT /worker/fuel` (drivers; 422 otherwise) through the new
    `SuppliersService.recordResources` (the write `confirmResources` now calls; via
    `WORKER_APP`, row replaced, `supplier.resources_confirmed` audited). `SuppliersModule`
    exports its service; `WorkerModule` imports it. The supplier detail gains `longBlock`.
  - App: `CalendarScreen.tsx` from W-Home's "Calendario y disponibilidad"; range picked on
    the grid (the button reads "Bloquear días" until both ends are picked, `e24313d`); fuel
    card for drivers; changes need a connection (not queued).
  - Desk: the supplier page's Availability panel shows a warning alert for the long block
    (`backoffice.supplierDetail.longBlockTitle`/`longBlock`, en/es/fr).
  - e2e: `worker-app.spec.ts` gains a fourth test (block/free a day, 16-day range, 40 L as a
    driver, the desk alert).
- **2026-11-10: the desk signs a worker out of the worker app**, the owner's pick of Next 3's
  first agent item (`a4603e0`…`7ca870d`). No migration, no new dependency, no domain rule (the
  filter is the existing `WORKER_CODE_SIGN_IN_METHOD`).
  - API: `POST /suppliers/:id/worker-sign-out` (Operations Admin, Super Admin, no override;
    RBAC matrix +1 row) → `WorkerCodesService.signOut`: deletes the worker's sessions with
    `signInMethod = worker_code` and the `worker-code:<userId>` verification row in one
    transaction, audits `auth.worker_signed_out` (`supplierId`, `sessions`, `codes`), answers
    `{sessions}` (`workerSignOutSchema`). 404 for an unknown supplier; any role's account works
    (nothing to end returns 0).
  - Desk: `worker-sign-out.tsx` beside "Issue sign-in code…" in the "Worker app sign-in" panel;
    copy under `backoffice.supplierDetail.signInCode.signOut` (en/es/fr), the panel description
    gained one sentence.
  - The app needed no change: its next request gets 401 and it returns to Login with "Tu sesión
    terminó"; saved answers stay queued for the next sign-in (W6).
- **2026-11-09 (evening): Phase 7 started, the worker app's first slice.** The owner approved
  Expo and W1, W3, W7 as recommended (`664d131`…`45766de`). No migration. New dependencies: Expo
  SDK 58.0.19 and the exact versions it pins (React Native 0.88.0, `expo-secure-store`,
  `expo-sqlite`, `expo-status-bar`, `expo-constants`, `react-native-safe-area-context`; dev/test
  only: `react-native-web` 0.21.4, `react-dom` 19.3.0, `@expo/metro-runtime`).
  - Domain `packages/domain/src/worker/`: the code rules (6 digits, 10 min, 5 tries, 45 s
    resend, 30-day session), `normalizeWorkerPhone` (8 digits → `+53`), `maskWorkerPhone`,
    `workerCodeSms` + `fitsOneSmsSegment` (GSM-7, 160), and the answer-queue rules.
  - Auth `packages/auth/src/worker-code.ts`: `POST /sign-in/worker-code/send` (always
    `{status:true}`) and `/sign-in/worker-code` (answers `{token, expiresAt}`, sets no cookie;
    the session records `worker_code`). `workerBearerPlugin`: the stock bearer conversion, only
    on `/get-session` and only for `worker_code` sessions; any other signed token throws
    `BEARER_NOT_ALLOWED`, which `AuthService.getSession` reads as no session (401).
  - API: `WorkerCodesService` (hash in Better Auth's `verification` table as
    `worker-code:<userId>`; a desk code stands against SMS resends), the SMS channel
    (`SMS_PROVIDER`; console in dev, nothing in production), `GET /worker/home`,
    `POST /worker/sign-out`, `POST /suppliers/:id/sign-in-code` (ops write, no override). RBAC
    matrix +3 rows.
  - Desk: the supplier page's "Worker app sign-in" panel and dialog (Ops Admin, Super Admin),
    en/es/fr. `@ota/theming` exports `themePrimitives`.
  - App `apps/worker-app`: Login, Home, Offer in one state machine; answers saved first
    (`expo-sqlite/kv-store`) and resent with backoff; the last home cached; the API's clock
    for countdowns. `build` = the Android JS export; `preview` = the web export on :3003 with
    the API proxied. `e2e/worker-app.spec.ts` (2 tests); Playwright has a second webServer.
- **2026-11-09: A4, the AI assistant flag**, the owner's pick with the "on + mock guard" default
  (`708784b`…`300fed3`). No migration, no new package, no new route (the three `/assistant/*`
  routes were already in the RBAC matrix).
  - Domain `packages/domain/src/settings/features.ts`: `aiAssistant` is the eighth flag (default
    on; manifest schema `packages/config` too). `heldOffFeatures({production, aiProviderIsMock})`
    → `['aiAssistant']` in production on the mock; `featuresInForce(flags, heldOff)` only ever
    switches a flag off. `@ota/ai` `llmProviderName(AI_PROVIDER)`: unset or unknown → `mock`.
  - API: `HELD_OFF_FEATURES` (`settings.tokens.ts`; `heldOffByDeployment(env)` in
    `settings.module.ts`). `OperatingSettingsService.features()` (so `requireFeature` and
    `GET /tenant/config`) applies the hold; the overview DTO gains `heldOff`. Every
    `/assistant/*` route calls `requireFeature('aiAssistant')` (409 `FEATURE_OFF`).
  - Desk: `getFeaturesInForce()` (`lib/operating.ts`); Messages hides "Draft with AI", Reports
    skips the AI summary fetch, Thresholds › Features has "AI assistant" and, when held off, a
    `text-warning-700` caption under the value. en/es/fr. ADR 0006 amendment of 2026-11-09;
    readiness A4 ticked; runbook "Switching a rail off" gains the AI bullet.
- **2026-11-08 (late night): B3, the last deployment build item**, the owner's pick
  (`db65f62`…`be2f649`). No migration, no new package, no new GitHub action.
  - `.github/workflows/release.yml`: a `v*` tag runs `ci.yml` (now also `workflow_call`), then
    a four-job matrix (`api`, `storefront`, `desk`, `backup`) logs into GHCR with plain
    `docker login` and runs `PUSH=1 deploy/build-images.sh <tag> <image>` →
    `ghcr.io/<owner lower case>/ota/<image>:<tag>`. The desk bakes the repository variable
    `DESK_DOMAIN` (the job fails without it).
  - `deploy/build-images.sh <tag> [<image>...]` (`OTA_IMAGE_PREFIX`, `DESK_DOMAIN` for the
    desk, `PUSH`, `OTA_SOURCE_URL` label): the same `docker build` arguments compose uses.
  - `deploy/deploy.sh [--rollback] <tag>`: refuses unless HEAD carries the tag with no tracked
    changes and `deploy/.env` sets `OTA_IMAGE_PREFIX`; `pull --policy missing` → pre-deploy dump
    → `migrate` → `up -d --wait` (300 s) → writes `OTA_VERSION` to `deploy/.env`. Each failure
    says what state it left. `--rollback` skips the dump and the migration.
  - Runbook "Release images", "Deploy a release" and "Roll back" rewritten; plan B3 row and
    readiness A2 marked built.
- **2026-11-08 (night): B9, B11 and B13** (`29c2996`…`4eb6ae3`), handoff Next 2. No migration,
  no new package; the backup image adds Debian's `age`, `rclone` (approved, B11) and `curl`.
  - B9: `superAdminBootstrapRefusals` (`packages/domain/src/settings/staff.ts`, unit tests in
    `settings.test.ts`) and `node dist/cli/bootstrap-super-admins.js <email>...`
    (`apps/api/src/cli/`, core `apps/api/src/staff/super-admin-bootstrap.ts`): all or none in a
    serializable transaction, audited `staff.super_admin_bootstrapped` with a null actor;
    refuses once any Super Admin row exists. Live test
    `super-admin-bootstrap.integration.test.ts` (rolls back).
  - B11: compose service `backup` (profile `ops`; `deploy/docker/backup.Dockerfile`,
    `deploy/backup/ota-backup.sh`: `backup [daily|pre-deploy]`, `list`, `restore drill|live`),
    `restore_drill_db` (profile `drill`, tmpfs), settings `deploy/backup.env`
    (`backup.env.example`, gitignored), the result emailed (D17), and
    `node dist/cli/retention-scan.js` (the daily job's pass, for after a restore).
  - B13: runbook "Production procedures" (first Super Admins, deploy, roll back, backups and
    restore, rotate a secret, staff, certificates). Plan §6 and readiness A2 updated.
- **2026-11-08 (evening): the storefront 404 shell, then B1, B2, B4, B5 and B10**, the owner's
  pick (`4e35bcf`…`5b21aa7`). No migration, no new package; `prisma` moved from dev to prod
  dependencies in `@ota/db` (same pin) so the image can migrate.
  - 404 (`4e35bcf`, test `8f2bde1`): an **unmatched** path is now a server-rendered 404 with the
    whole layout. The `[locale]/[...rest]` catch-all (which called `notFound()` while rendering)
    is gone; a pass-through `app/layout.tsx` lets Next serve its `/_not-found` route, and
    `app/not-found.tsx` renders `SiteDocument` (the locale layout's `<html>`, lifted into
    `components/site-document.tsx`) with `NotFoundContent` in the middleware's locale. A page's
    **own** `notFound()` (a missing package/destination/blog/event slug, a page switched off,
    16 pages) still gets Next's error document: Next 15.5 cannot catch it on the server (Traps).
  - `deploy/`: images (`docker/api.Dockerfile`, `docker/web.Dockerfile`), `compose.prod.yml`,
    `caddy/` (gates `trial`/`open`), `plausible/compose.override.yml`, `postgres/init/`
    (runtime role), `compose.rehearsal.yml` (`*.localhost`), `smoke.sh` (18 checks), and the two
    settings templates `.env.production.example` (Compose) and `api.env.example` (API only).
    Runbook "Production stack"; plan §6 rows marked built.
- **2026-11-08 (afternoon): security patches, the small hardening and B6**, the owner's pick
  (`a902f76`…`80bce5a`). No migration or new dependency.
  - Patches (`a902f76`): `pnpm audit --prod` 33 → 2 by in-range updates (Next 15.5.29, Better
    Auth/passkey 1.7.18, Zod 4.6.7, Nodemailer 10.3.1, Nest 12.4.0 → express 5.3.0, body-parser
    2.4.0, multer 2.5.0, qs 6.17.1; Vitest 5.1.0 → vite 8.3.6; sharp 0.35.5, source-map-js
    1.2.2) and `overrides: 'next>postcss': ^8.5.32` in `pnpm-workspace.yaml` (Next pins 8.4.31).
    Left: `deepmerge-ts` 7 (high; Prisma's CLI config merge) and `uuid` 8 (moderate; exceljs
    calls only `v4()`), both fixed only in a major (owner's call, Next).
  - `GET /catalog` answers `CatalogItemDto` (no `supplierId`; `3d9abec`).
  - B7 (`6927b54`): `SOCKET_ORIGIN_OPTIONS` (`apps/api/src/common/trusted-origins.ts`) on both
    gateways: CORS plus `allowRequest` on the handshake's `Origin`; `main.ts` reads the same
    `trustedOrigins()`.
  - B8 (`0418ff1`): `apps/storefront/src/app/robots.ts` (dynamic) follows `SITE_NOINDEX`
    (`siteNoindex`, `packages/config`). The Caddy `X-Robots-Tag` half belongs to B2.
  - B6 (`80bce5a`): `siteBaseURL` (`packages/auth/src/site-base-url.ts`); `createAuth` takes
    `allowedHosts` from `AUTH_ALLOWED_HOSTS`. Runbook "Hosts, sign-in and crawling"; plan D8's
    settings list gained `AUTH_ALLOWED_HOSTS`, `BETTER_AUTH_URL`, `SITE_NOINDEX`.
- **2026-11-08: owner decisions, docs only; no code changed.** The owner approved the
  deployment plan (D1–D24 as recommended, plus every §6 (approval) item: B1, B2, B6, B9, B11) and
  asked for security patches first. The domain `veredaexpeditions.com` is registered in the
  owner's name (D2(b) stopgap) with one mailbox `info@veredaexpeditions.com`. Supplier
  confirmations wait for the worker app (ADR 0007 amendment). Counsel and the team come next on
  the owner's side, and the owner will say when the legal entity exists. The owner's checklist
  is the new `docs/production-readiness.md`; `docs/deployment-plan.md` is now Approved.
  The owner asked for the pull request into `main`; the agent's push failed (no GitHub
  credentials in its shell, no `gh`), so the owner pushes and opens it from the compare page.
  `main` is an ancestor, so a merge commit makes `main` equal `vereda`.
- **Phases 0, 1, 0b, 2, 3 and 5 are done; M1–M10 are complete with their surfaces; Phase 8 items
  1–4 are done** (item 1 also has its real sink adapter). Commits are local on `vereda`; the
  owner pushes (`git log --oneline origin/vereda..vereda`).
- **2026-11-07: a tier or extra changed under a booking**, the owner's pick; no migration,
  dependency, route or screen (`a775c55`). Reproduced on the live DB: a save between the Booking
  form's checks and its transaction that removed the chosen tier or extra gave a raw Prisma FK
  error (500); one that withdrew an extra (`active: false`) sold it. The desk's party edit had
  the same gap for its tier.
  - `claimPackageChoices` (`apps/api/src/travelers/departure-seats.ts`) runs after
    `claimDepartureSeats` in both writers: `FOR SHARE` on the tier and the extras (in id order),
    then 409 "That tier is no longer offered…" / "An extra is no longer offered…". A save that
    comes during a booking now waits on those rows and then refuses (`TIER_BOOKED`,
    `EXTRA_BOOKED`).
  - The save's extras `FOR UPDATE` now goes `ORDER BY id`, as the claim does, so a booking
    holding two extras cannot deadlock against a save. Lock order stays departures → tiers →
    extras.
- **2026-11-07: "Keep building the trip"** (M10's deferred builder edit), the owner's pick, editable
  until the desk sends a proposal; no migration or dependency, one route (`2629b61`…`f08cbb6`;
  `docs/schema-m10-events.md` §8, ADR 0006 amendment of that day). A desk version is created and
  sent in one step, so "until sent" is request `OPEN` + proposal `DRAFT` (`customRequestEditable`).
  - Rules `packages/domain/src/proposals/request-edit.ts`: `customRequestEditable`,
    `customRequestChanges` (which parts changed, for the desk), `eventLinkRefusals` (a live
    event request's nights, seats and province must still fit the trip).
  - API: `PUT /me/proposals/:id/request` (`ProposalsService.updateRequestForUser`), the whole
    answers again, under `FOR UPDATE` on the proposal; 409 `RequestNotEditable` /
    `RequestLinkedToEvent` (`refusals`). `createVersion` takes the same lock and an optional
    `requestUpdatedAt`; a change since is 409 `RequestChanged`. Edits are audit rows
    `custom_request.edited` with `changed`; the DTOs gained `request.updatedAt`,
    `request.lastEdit`, `editable`, the queue's `editedAt` and the event result's `proposalId`.
  - Storefront: `/custom?edit=<proposal id>` opens the builder on the request (or a "with our
    team" card once sent); links from the proposal page while being priced and from the event
    request's confirmation (the board's button). No funnel telemetry for an edit.
  - Desk: the request card's "Changed by the traveler on … : dates, route." Alert, the composer's
    "can still change" note, a kept draft on `RequestChanged`, the queue's "Changed" badge.
  - e2e `storefront-keep-building.spec.ts`; the event-seat refusal in `events.spec.ts`.
- **2026-11-06: the departure seat race**, the owner's pick; no migration, dependency, route or
  screen (`8250bcc`). Two paths took seats, not one: the Booking form and the desk's party edit
  both counted places before their transaction with nothing held, so both bookings could take
  the last seats (reproduced: 2 bookings on a 2-seat departure, 4 seats sold).
  - `claimDepartureSeats` (`apps/api/src/travelers/departure-seats.ts`) runs first in each
    writing transaction: `FOR UPDATE` on the departure, then its status, capacity and booked
    seats. `plan()` and `assertDeparture` no longer decide any of these, only "on this package".
  - A departure closed or removed after the form's checks is now a 409, not a booking or a
    foreign-key 500.
  - Lock order is departures, then tiers, then extras everywhere. `planCollections` used to lock
    tiers first, which deadlocks against a booking holding its departure.
- **2026-11-06: stable package rows**, the owner's pick; no migration, dependency or route
  (`c2fd8a9`…`ecd46ed`; ADR 0006 amendment of that day). This was a real bug, larger than Next
  said: every editor save deleted and recreated the package's departures, tiers and extras, so
  `ON DELETE SET NULL` cleared `departure_id`, `tier_id` and `package_extra_id` on every booking
  and the departure's seats read as free (the places check sums `partySize` by `departureId`).
  - Rules `packages/domain/src/packages/collection-edit.ts`: `planCollectionEdit` matches a
    save to the stored rows on the natural key (departure date, tier/extra code);
    `collectionEditRefusals` and `departureCapacityRefusals`. "Bookings" means not `CANCELLED`,
    as the places check does.
  - API: `PackagesService.planCollections` in the save's transaction, after `FOR UPDATE` on
    the submitted collections (a booking's foreign key then waits, so none lands between the
    check and the write). 409 `PackageRowsInUse` with `refusals` (`packageRowsInUseSchema`),
    naming the rows and booking codes. Services and days are still replaced wholesale: nothing
    points at them.
  - Desk: the editor sends back every row field it hides (departure status, tier description,
    an extra's duration, catalog item, day and active flag, a day's meals; each save used to
    reopen a closed departure and wipe the rest). `PackageExtraDto` gained `inventoryItemId` for
    that. A status select on each departure, so "Closed" is reachable; the refusal is a
    destructive Alert listing each row, five booking codes and "and N more". en/es/fr.
  - Storefront: the package page lists only OPEN departures, as the Booking page already did.
  - e2e `packages-edit.spec.ts` "a package with a booking"; live tests in
    `packages.integration.test.ts`, including a booking mid-transaction during a save.
- **2026-11-04: the display-currency "about" lines in the emails** (M9 C7b), the owner's pick;
  no migration, dependency or route (`4eab849`…`3458fdf`; ADR 0006 amendment of that day;
  `docs/schema-m9-display-currencies.md` §8). Copy is a placeholder in en/es/fr.
  - Rule `referenceRate` (`packages/domain/src/money/display-currency.ts`): the booking's lock
    wins, else today's offered rate for the traveler's currency, else nothing.
  - E-Received's total gets "(about CA$4,588; the rate locks when you pay the deposit)";
    E-Invoice's deposit and full amount get "(about CA$918)" plus one note on EUR charging and
    when the rate locks (DEPOSIT "when you pay", INVOICE "when you choose how to pay"); a lock
    reads "rate locked on {date}". Whole units, rounded up.
  - API: `CurrenciesService.emailReference` (a failed read logs and returns null, so the email
    still goes); the Booking form's request takes an optional `displayCurrency`, kept with
    `adoptShown` when none is saved, as the payment link already did; E-Invoice reads the
    traveler's saved currency and `rateLockOf(reservation)`. The storefront form sends
    `useDisplayMoney().code`.
  - e2e: `display-currencies.spec.ts` books through the form with a CAD cookie and reads both
    emails in Mailpit; `storefront-packages.spec.ts` now restores the traveler's currency.
  - Fix `0b76560` (found by the new test): the Booking page reads the package uncached
    (`getPackage(slug, { fresh: true })`). A package save in the editor then deleted and
    recreated its departures, and the 60 s fetch cache served the old ids on
    the next visit (stale-while-revalidate), so the request was refused ("Departure … is not on
    this package"). The package page still caches 60 s, so its departure list can lag an edit
    by one visit. The root cause was fixed on 2026-11-06 (stable package rows); the uncached
    read stays because a save can still remove an unbooked departure.
- **2026-11-02: the Super Admin IP allowlist** (M9), the owner's pick, approved I1a–I7a with no
  migration or dependency (`4aa90fc`…`ae43155`; ADR 0006 amendment of that day). Off by default.
  - Rules `packages/domain/src/settings/ip-allowlist.ts`: IPv4/IPv6/IPv4-mapped ranges without
    a library, `superAdminIpRefused` (Super Admins only; an unknown address is refused),
    `ipAddressText` (an IPv6 sign-in address shown as its /64), and two keys in the thresholds
    document (`superAdminIpAllowlistOn`, `superAdminIpAllowlist`, ≤ 20 labelled entries, IPv6
    /64 or wider); `changedThresholds` now compares a list by its entries.
  - Address source: the API writes `req.ip` (under `TRUST_PROXY`) into `X-OTA-Client-IP` for
    `/api/auth` and Better Auth reads only that header (`packages/auth/src/client-ip.ts`), so
    `session.ipAddress` (also the new-device email's IP) can no longer be set by a client's
    `X-Forwarded-For`.
  - API: `SessionPolicy.ipRefused` in `refusal`/`gateRefusal` (guard 403 `IP_NOT_ALLOWED`,
    sockets and Better Auth's routes too), the apply check (422 `IP_ALLOWLIST_EXCLUDES_YOU`),
    `signInAddress` on `GET /settings/operating`, the sign-in audit
    `auth.sign_in_outside_allowlist`, the break-glass `SUPER_ADMIN_IP_ALLOWLIST_OVERRIDE=off`.
  - Desk: Thresholds › Security's list editor ("Add my sign-in address", warnings), the
    Security fact, and a refused session sent to `/login?refused=ip&address=…`, which signs it
    out and names the address. en/es/fr. e2e `e2e/ip-allowlist.spec.ts`.
- **2026-11-01 (late night): display currencies** (M9 D7), the owner's pick, approved C1a–C7a
  on migration `20261101221301_display_currencies` (`7dc5ae0`…`ff63b39`; ADR 0006 amendment
  of that day). No dependency or spend; rates are the mock's (the board's samples).
  - Rules `packages/domain/src/money/display-currency.ts`: USD/CAD/GBP on, CHF off (four
    threshold switches), default from the browser language's region (en-US → USD, en-CA/fr-CA
    → CAD, en-GB → GBP, else EUR), saved choice > `ota_currency` cookie > default, rate =
    reference × (1 + `fxSpreadPercent`, default 0.6), browsing prices round up to the unit, a
    rate older than 5 days is not shown, `fxLockAt` DEPOSIT (default) or INVOICE.
  - API `apps/api/src/currencies/`: `FxRateProvider` (mock; the ECB reader only with
    `FX_RATE_PROVIDER=ecb`), daily `fx-rates` job 16:30 Europe/Madrid plus the first read of a
    day, `GET /catalog/currencies` (public, 60 s cache), `GET /settings/currencies` (desk),
    `PUT /me/display-currency` (audited). The first PAID receipt locks the booking's currency
    and rate (`reservation.display_rate_locked`), or the first link under INVOICE; the traveler's
    payment link sends the currency shown, kept when none is saved. Schedule DTO `rateLock`;
    the invoice prints the reference line.
  - Storefront: the listbox in the header from md to lg and in the footer from lg (no room
    in the header there: es and signed-in en scrolled sideways), drawer and Account › Preferences radios,
    converted browsing prices + "Prices set in EUR", "≈" captions on payable totals (locked rate
    once there is one); telemetry `currency` is the visitor's. Desk: Settings › Currencies
    table, Thresholds › Currencies, the locked rate on a booking's payment panel. en/es/fr.
    e2e `e2e/display-currencies.spec.ts`.
  - Also `b5cae6c`: Support no longer sees a customer's certification reminder (the API
    refuses it) unless a `customers` override runs; the profile shows the override notice.
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
- **Not built:** W-Earnings' payout recording, paid dates, method, next pay day, receipts,
  ratings, reliability trend and window choice (`docs/schema-w-earnings.md`); SMS/push; the live Plausible hosting decision (the adapter is built);
  worker events (`offer_viewed` and the rest wait for the worker app); desk page views and nav clicks
  (counsel on staff analytics); `gallery_opened` (no gallery viewer);
  queued offline writes; the
  D-OfflineKit PDFs; A-Content's blog/FAQ/media/conditions tabs; guide specialities; M9's other
  deferred items (manifest editing beyond the flags); checking each request's address against
  the IP allowlist, or other roles; display currencies' rounding tolerance, gateway rate source,
  a budget field in the chosen currency, and the "about" line in the builder's requests (no
  E-Received there) and in other emails; changing "own device" after sign-in; passkeys for travelers and suppliers; M10's deferred room holds, event photos and "Keep building the trip"; the
  desk's `/` (no desk search); self-service backup codes and a no-deploy recovery for the
  last Super Admin; Ops Lite;
  a real screen-reader run; the custom date-range picker (owner: native fields).
- **Placeholders:** M4 terms, card fee 0 %, legal texts, OFAC categories, pricing samples, the
  deposit's refundability and proof retention, the M5 sample terms, the builder rates, the M8
  crisis framework, the backup-power wording, the cookie banner's analytics words and the
  privacy notice's cookies paragraph, the concierge fee and the events copy
  (`content.events`, en/es; the US note waits for counsel); dev seed as before plus two events.

## Verified (2026-11-12, W-Earnings read-only, dev stack stopped for the build)
- CI: the pull request's run on GitHub is green (public API, no `gh`); nothing to fix.
  `pnpm audit --prod`: the same 4 settled advisories (deepmerge-ts, uuid, glob, minimatch).
- No migration this session.
- `pnpm lint`, `pnpm format:check` green. `TURBO_FORCE=true pnpm typecheck` **34/34**;
  `TURBO_FORCE=true pnpm test` **31/31 tasks, 1388 passed / 53 skipped** (+14: domain 9,
  api 3, worker app 2); `TURBO_FORCE=true pnpm build` **19/19**.
- Mutation checks on `packages/domain/src/worker/earnings.ts`, each failing
  `worker-earnings.test.ts`: `PROCESSING` read as paid (2 tests), the month taken in UTC (the
  Havana boundary test), cancelled bookings counted (2), a score before `minAnswered` (1).
  Restored byte-for-byte; 9/9.
- Full `pnpm e2e` (seven projects, 1.2 h, run on ports `ss` showed free): **171 passed, 2
  failed, 3 skipped, 1 did not run**. All five worker-app tests passed, the W-Earnings one
  included. The two failures are last session's: display-currencies "a traveler saves GBP…"
  (`displayCurrency` null after Mark paid; its serial follow-up did not run) and `[ds07-414]`
  responsive customer pages (first-compile `goto` timeout, this time on `/join`). Alone on a
  fresh stack: display-currencies **3 passed**, `[ds07-414]` responsive **3 passed** (1
  skipped). An earlier full run this session was void (stale Next servers; see Traps).
- Live (`RUN_DB_INTEGRATION=1`, `REDIS_URL=redis://localhost:6379`) **52/52**, 13 files.
- Browser (a temporary Playwright spec against the restarted dev stack and the preview on
  :3003, deleted after with its fixture worker: 4 finished jobs ACCRUED 45, PROCESSING 60,
  SETTLED 30.50, FAILED 12, and 6 answered offers 5/1): at 390/1024/1280 the app reads score
  83 (40/46 700, `#1F1B17`), "Por debajo del mínimo: sin ofertas automáticas" in `#C62828`,
  83/17/0 %, pending "€ 105" (28/34 700) with 2 jobs, "Este mes" € 147,50 (4), "Pagado ·
  trabajos de 2026" € 30,50 (1), the issue notice "€ 12 con incidencia en el pago (1
  trabajo)"; chips Pagado `#1B5E20` on `#E8F5E9`, Pendiente `#92400E` on `#FEF3C7`,
  Incidencia `#C62828` on white, radius 4 px. The desk's Payouts panel shows €105.00 (2 jobs),
  €147.50 (4), €30.50 (1), €12.00 (1) in the page's shared `Stat` tile (16 px mono), two by
  two at 390, one row at 1024/1280. No sideways scroll anywhere.
- Owner's dev stack restarted with Task 0's settings and left running: `/health` 200 (:3001),
  storefront `/` 200 (:3000), desk `/login` 200 (:3002). The preview on :3003 was stopped.
- Not run: an APK or any Android device; a clean full e2e run in one pass.

## Assumptions & unknowns
- **W-Earnings (2026-11-11):** a finished job is one whose service ended (nothing sets
  `FULFILLED`); a FAILED payout still counts in "Este mes" (work done) and shows as an issue,
  not as pending. "Pagado · trabajos de <año>" buckets by the job's end, not a paid date. A
  booking cancelled after a job ended drops that job from the worker's totals. The reliability
  shown reads every offer, as the floor does, not the board's 12 months (doc E8). Home's
  reliability still uses the constant `RELIABILITY_MIN_ANSWERED` (5), the earnings screen and
  the desk the threshold `reliabilityMinAnswered`; they differ only if a Super Admin changes
  it. The pay rule, office hours and payout method in the doc are the board's samples, not
  business values. Not run on a device.
- **Block reasons (2026-11-11):** a reason sent with `isAvailable: true` is ignored rather
  than refused. Re-blocking an already blocked day from a range replaces its reason. A day
  that became a job or offer between the app's read and a chip tap is kept, and the app then
  shows the "kept" message instead of "Motivo guardado". Nothing reads the reason except the
  app and the desk tooltip (no analytics, no dispatch effect, doc §4). Not run on a device:
  `aria-checked` on native RN 0.88 is assumed to reach TalkBack as a checked radio.
- **W-Calendar (2026-11-11):** build choices not on the board: the 62-day cap per change, the
  horizon (end of the twelfth month ahead), job and offer days never changed from the app, the
  long block counted from today (blocked days already past are ignored), and only the first
  long run shown. A worker's fuel declaration is a resources confirmation, so it also resets the
  desk's staleness for that driver; a driver's row holds only the fuel reserve, so replacing
  it loses nothing. The worker's availability audit is one row per change with a `days` array
  (the desk's is one row per day with `date`); nothing reads either shape. The desk alert says
  "call them before high season" with no date for the season. Nothing ran on a device. The CI
  fix (`c0026a9`) was reproduced and checked locally, not on GitHub's runner.
- **Desk sign-out (2026-11-10):** only worker-code sessions end (the only ones the app's bearer
  can carry); a worker's magic-link browser session, if any, stays. A thief holding the SIM could
  ask for an SMS code once an SMS provider exists; today none is sent in production. Found, not
  changed: the runbook's "Worker app sign-in" says to correct a changed number on the supplier
  profile's primary phone, but nothing on the desk or the API edits `primaryPhone` after the
  application's approval (a hand fix today). Answers queued on a lost phone are sent if someone
  signs in on it again (W6, unchanged).
- **Phase 7 (2026-11-09):** a worker is a `SERVICE_WORKER`, not deactivated, whose supplier
  `primaryPhone` normalises to the typed number; a pending or suspended supplier may sign in
  (the home says so). Two workers on one number get no SMS (no unique index: a migration).
  The desk phone in the app is `branding.supportPhone`, else the first emergency contact
  (today the placeholder `+53 5555 0100`). The Android id `com.veredaexpeditions.worker`
  comes from the tenant id and is permanent once installed: confirm before the first APK.
  Nothing ran on a device: Hermes' `Intl` with `timeZone: 'America/Havana'`, the keystore and
  SQLite are assumed. No desk action ends a worker's sessions (Settings → Users is staff
  only); the runbook gives the hand fix. A decline is sent as the Spanish reason label. The
  worker app is not in the Release workflow's images (it ships as an APK later).
  (Since 2026-11-10 the desk's "Sign out of the worker app…" replaces the hand fix.)
- **A4 (2026-11-09):** "production" is `NODE_ENV=production`, which the API image sets (B1).
  A deployment that ran the API without it would not hold the mock off; the switch still
  works. The held-off caption was seen in a browser only with the API started alone as
  `NODE_ENV=production` (dev runner, see Verified), not in the production image. Translation has
  no desk surface; it is gated at the API only. Found, not changed (it predates A4): at 390 px
  the Messages composer squeezes its input to about 26 px beside "Draft with AI" and Send; the
  desk targets tablet width and up (DS 07), so it is left for the owner.
- **B3 (2026-11-08):** the workflow has never run: no `actionlint` here and no tag pushed, so
  the GHCR login, the push with `GITHUB_TOKEN` (`packages: write`), the lower-cased owner
  path and the reusable `ci.yml` call are unproven until the owner's first `v*` tag. A
  package's first push is private by GitHub's default (repository visibility not checked: no
  `gh` here). The server's `docker login ghcr.io` with a classic `read:packages` token and a
  real registry pull were not rehearsed (the rehearsal used local images, so `--policy
  missing` pulled nothing). An unhealthy `up --wait` was not provoked; its message is
  untested. Tags are assumed never reused: the server does not re-pull a tag it has.
- **B9 (2026-11-08):** "any Super Admin exists" counts deactivated ones too (the stricter
  reading of plan B9), so the command is never a recovery path; a lost last Super Admin stays
  the runbook's hand `psql` fix. It applies the invite's eligibility (fresh traveler or staff)
  and `staff.allowedEmailDomains`. One address is accepted (a one-person agency) with a printed
  reminder that two-person approvals need a second.
- **B11 (2026-11-08):** not built: a copy of the uploads bucket (the provider's versioning is
  the runbook's answer) and Plausible's database dump (D11 lists both). Retention 30 d / 186 d is
  pending counsel. The result email uses the API's SMTP settings with opportunistic STARTTLS
  (`curl --ssl`), as the API's mailer does (`secure: false`). A live restore unpacks documents
  over the volume (files made since the dump stay). A keep-alive confirmed after the dump is
  lost by a restore; the runbook says to check the API log first. The retention command was
  run in the image on fresh data only (nothing due); its anonymizing is
  `retention.integration.test.ts`'s proof of `RetentionService.scan`. Not run: a real
  off-site provider, a host cron, a dump larger than a few hundred KB.
- **Data-driven 404s (2026-11-08, settled: leave as is, Decisions):** a page's own `notFound()`
  stays on Next's error document (status 404, the page after hydration). Not verified: whether
  Next 16 renders a thrown `notFound()` on the server; weigh it if a Next 16 upgrade comes up.
- **Images (2026-11-08):** the API image is 2.3 GB and each Next image ~1.4 GB, partly because
  pnpm auto-installs `better-auth`'s optional peers (Next, SWC, TypeScript) into the API's
  production tree. Shrinking (Next `output: 'standalone'`, `auto-install-peers=false`) was not
  tried. Caddy 2.11.9 was two days old when pinned; the base images are pinned by tag, not
  digest. Not run: an arm64 build, a build in CI (B3), Plausible itself (the override was
  checked with `docker compose config` against the fetched upstream v3.2.1 file only).
- **B6 (2026-11-08):** the host is trusted from `X-Forwarded-Host` because a Next rewrite
  replaces any client value with the incoming `Host` (`next/dist/server/lib/router-utils/
  proxy-request.js`) and Caddy routes by `Host`; this holds only while the API has no public port
  (D8a). The storefront's and desk's server-side session reads go straight to `API_URL` without
  that header and land on the fallback, which is fine because the cookie name depends only on the
  scheme. With a dynamic base and no `PASSKEY_RP_ID`, the passkey rpID would follow each host;
  production sets it (A6). Proven live on `*.localhost` only, not behind Caddy (Phase B).
- **B7:** a handshake without `Origin` is allowed (a same-origin poll may omit it; non-browser
  clients carry no victim cookie). Better Auth's wildcard origins are not honoured for sockets
  (exact origins only); none are configured.
- **Audit leftovers:** the owner chose to leave `deepmerge-ts` and `uuid` (unreachable from a
  request) until Prisma and exceljs update them; re-run `pnpm audit --prod` each session.
- **Owner's answers (2026-11-08):** the owner wrote the mailbox as `info@veredqexpeditions.com`;
  assumed a typo for `veredaexpeditions.com` (the domain they bought). The owner spoke of "six"
  (approval) items; the plan marks five rows (B1, B2, B6, B9, B11; Caddy is B2/D9). Recorded all
  marked items as approved. The registrar's name and Cuba terms are unknown. A6 in
  `docs/production-readiness.md` lists the config values the domain fixes; none is set yet (they
  belong to the deploy, and the dev seed/e2e use `example.test` addresses).
- **Keep building (2026-11-07):** the words are placeholders for the copy review (the board has
  only the English button; es/fr are ours). Assumed: an edit is a whole replacement (PUT), so
  the builder sends the notes back and a cleared box clears them; an event-derived request's
  system note ("Event request VX-E-… · name") shows in that box and the traveler can delete it
  (the link itself is `EventRequest.customRequestId`, untouched). A stop without a stay opens on
  the tenant's default, so saving an event-derived trip lists "stays" only if a shared stop's
  style changes. The event fit checks only live requests (SUBMITTED/REQUESTING/CONFIRMED) and
  only a non-empty route's province. `requestUpdatedAt` is optional, so a client that omits it
  skips the stale check (the desk always sends it). No email tells the desk about an edit (the
  queue badge and the card do); no funnel events for an edit (assumed, to keep the funnel's
  counts honest).
- **Seat claim (2026-11-06):** the refusals' wording is the API's English, shown as it stands by
  the Booking form in every locale (as before; `booking-flow.tsx` prints `body.message`). A full
  or closed departure is now refused after the price and certification checks, so a request
  with both problems hears about those first. Bookings on one departure queue on its row for the
  whole transaction, including the affidavit upload; waiting counts against Prisma's 5 s
  interactive timeout. Measured: 20 at once on 8 seats took 207 ms, in-memory storage, not S3. A
  tier or extra removed or withdrawn after the form's checks is a 409 since 2026-11-07.
- **Stale price window (2026-11-07, not fixed):** `plan()` prices from the package it read
  before the transaction. A save that changes a kept tier's, extra's or departure's price in
  place between the two (milliseconds) leaves the booking at the price shown, which the
  traveler accepted; the claim checks only that the rows still exist and are offered.
  Re-pricing under the locks would close it, if the owner wants that.
- `PASSPORT_ENCRYPTION_KEY` is set in `apps/api/.env` (dev); back it up. A production key differs.
- **Deploys:** keep the orchestrator's kill grace period above `SHUTDOWN_TIMEOUT_MS`. Env from M9:
  `STAFF_SESSION_HOURS` (12), `MAGIC_LINK_EXPIRES_MINUTES` (10), `BACKOFFICE_PUBLIC_URL`;
  `PASSKEY_RP_ID` binds every passkey, so it belongs to the deploy-topology decision (still
  open; `docs/deployment-plan.md` D6 recommends the apex domain): the desk's origin must be
  that domain or under it, and in `TRUSTED_ORIGINS`.
- **IP allowlist (2026-11-02):** only as good as `TRUST_PROXY`: behind the planned Caddy → Next
  → API chain it is `TRUST_PROXY=1` (plan D8), not verified live (B10). Without it every
  sign-in records the proxy's address. The check is on the sign-in address, so a session runs
  its 12 h wherever the laptop goes (I1a). Sessions from before the switch are judged on the
  address now recorded; ones created before this build recorded Better Auth's own reading
  (`X-Forwarded-For` or 127.0.0.1 in dev). Better Auth's own rate limiter (production only)
  now keys on the same header. A Super Admin on a mobile network has no fixed address: the
  agency needs a VPN with a fixed exit before switching it on (plan D18 says not yet).
- **Stable package rows (2026-11-06):** a changed date or code counts as a removal plus a new
  row, so it is refused on a booked row rather than moved (assumed: moving a date would leave
  the booking's service dates behind). A completed booking also holds its row, so a past
  departure with bookings stays in the editor for good. A cancelled booking does not hold one,
  and loses its link when the row goes (its price lines keep the record). Closing or cancelling
  a departure only stops new bookings: nothing is sent to those already on it. A row's `id`
  still changes if staff remove an unbooked row and add it again. The refusal words are
  placeholders. The public package read now carries an extra's `inventoryItemId` (the same kind
  of id services already expose). After a refusal the form keeps the person's edit, so a removed
  row stays off the screen until they reload (nothing was saved).
- **Email "about" lines (2026-11-04):** the words are placeholders for the email-copy review.
  E-Received under INVOICE reuses the storefront's "the rate locks when we send the invoice",
  though the payment link is what locks it (E-Invoice says "when you choose how to pay"); the
  storefront wording is unchanged. Booking through the form now saves the shown currency
  (also EUR) when none was saved, so a traveler's later region default no longer applies to
  them; the menu still changes it. A dynamic-builder request saves nothing, so its E-Invoice
  has the line only for a traveler with a saved currency. Ops-created payment links lock
  under INVOICE too, which "when you choose how to pay" does not describe.
- **Display currencies (2026-11-01):** the 0.6 % spread, the deposit lock point, showing USD at
  all and the sample rates are placeholders for finance and counsel (all changeable on
  Thresholds, no deploy). Switching to the ECB (`FX_RATE_PROVIDER=ecb`) is the owner's Q10 call;
  the reader is tested against a saved XML sample, never against the live feed. The rate
  cache and the hourly retry are per API process. A traveler whose region default is USD but
  who never opens the menu has USD saved when they ask for a payment link. Region detection is
  the browser language only (no geo-IP).
- **Permission overrides:** any one Super Admin approves (O4a), so one Super Admin can give
  Support a row for up to 24 h. Reasons and notes are staff free text kept with the override
  (not traveler PII; outside the retention purge). The customer profile's reminder now follows
  `deskAccess` (`b5cae6c`); the list's only link is to the read-only retention desk. Two requests sent at the same instant for the same row are not locked against each
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
- **A single-spec e2e leaves Next dev servers behind (2026-11-12):** after
  `pnpm e2e e2e/<one>.spec.ts`, `next dev -p 3000` and `-p 3002` can outlive the run. Deleting
  `apps/*/.next` under them leaves them accepting connections but never answering, and the next
  `pnpm e2e` reuses them (`reuseExistingServer`): all 177 tests then time out (one wasted ~23 h
  run). **`lsof -ti tcp:<port> -sTCP:LISTEN` does not show `next-server` listeners** (it shows
  the API's node); `ss -ltnp | grep -E ':300[0-3]\b'` does, with the pid. Before a full e2e, kill
  every listener on 3000–3003 by the pid `ss` gives (and the `next dev` / `swc-node` parents
  `ps` lists) and confirm `ss` shows none; only then delete `.next`. A full `pnpm e2e` leaves
  the same set behind.
- **Nothing marks a job done or paid (2026-11-11):** `service_items.status` never becomes
  `FULFILLED` and `payout_status` never becomes `SETTLED` in the API (only the payment webhook
  path writes ACCRUED/FAILED). Any "done" or "paid" read by status alone shows nothing; W-Earnings
  uses the service's end date. Analytics' `payoutsSettled` is 0 for the same reason.
- **The suppliers test fake branches on `supplierId` (2026-11-11):** in
  `suppliers.e2e.test.ts`, `serviceItem.findMany` with `supplierId: {in: [...]}` answers the
  job rows (`jobs`) and with a plain string answers the payout rows (`payoutJobs`). A new
  inspector read of service items needs one of those shapes or the fake throws.
- **RN-web ignores `accessibilityState` (2026-11-11):** react-native-web 0.21.4 never reads
  `accessibilityState` on View/Pressable; it maps `aria-checked`/`aria-selected` (and the
  legacy `accessibilityChecked`). So the web preview (e2e, screenshots) showed every reason chip
  unchecked until they used `aria-checked` (`755bc3b`). Found, not changed: W-Offer's decline
  reasons (`accessibilityState={{ checked }}`) and the calendar's day buttons
  (`{ selected }`) have the same gap on the web preview only; `disabled` survives because the
  `disabled` prop is passed too. Native RN reads both forms.
- **Two chip groups, one name (2026-11-11):** the day card and the range card both render
  reason chips; with one shared group name, `getByRole('radio', { name: 'Otro' })` is
  ambiguous. They are named apart ("Motivo del bloqueo de este día", "Motivo de los días");
  scope radios by their group.
- **CI has no browser unless it installs one (2026-11-11):** a unit test that launches
  Chromium passes locally (the cache in `~/.cache/ms-playwright`) and fails on the runner.
  To reproduce CI here, point `PLAYWRIGHT_BROWSERS_PATH` at an empty directory, and run turbo
  with `--env-mode=loose`: in its default strict mode turbo drops that variable and the run
  stays green. `gh` is not installed; `curl https://api.github.com/repos/Laura-NR/OTA/actions/runs`
  and `…/check-runs/<job id>/annotations` read run states and failure lines without a token
  (job logs need one: 403).
- **`recordResources` stamps the real clock (2026-11-11):** a test with a fixed `NOW` that
  checks fuel staleness must measure from `Date.now()`.
- **RN-web text matching (2026-11-11):** Playwright's `getByText('Trabajo asignado')` also
  matches the calendar hint ("…con trabajo asignado…"): pass `{ exact: true }`.
- **Worker app (2026-11-09):** `pnpm dev` runs every workspace's `dev` script, so the app's
  Metro command is `start`, not `dev`. `app.config.ts` imports `@ota/config` and
  `@ota/theming` from `dist`: build them before `expo export`. The preview (:3003) rebuilds
  the web export on start and is left running by Playwright like the others: kill 3000–3003
  by PID after `pnpm e2e`. A desk `next-server` once ignored SIGTERM and Playwright kept
  reusing it (every desk `page.goto` timed out): `kill -9` it and delete `apps/*/.next`.
  2026-11-10: the storefront's did the same after a full run (3.4 GB RSS): a plain `kill` by
  port PID printed "killed" but the port stayed bound, and the next isolated run of
  `[ds07-414]` failed on the hung server. After killing, check `ss -ltnp` for 3000–3003 and
  `kill -9` whatever is still listening before re-running anything. 2026-11-11: the desk's
  hung again after only `worker-app.spec.ts` (4 tests): a later magic-link `page.goto` failed
  with `net::ERR_ABORTED` and `curl :3002` hung until it was `kill -9`ed.
- The full `pnpm e2e` has failed the same two storefront tests on 2026-11-10 and 2026-11-11
  (`storefront-keep-building.spec.ts`'s "Keep building" click, `[ds07-414]` responsive's blog
  `goto`), both late-run dev-server slowness; both pass alone on a fresh stack. A failure
  elsewhere, or one of these failing alone, is a real regression. 2026-11-11 (later):
  `display-currencies.spec.ts`'s GBP deposit read `displayCurrency` as null right after Mark
  paid in the full run and passed alone (3/3); if it fails again, look at whether the desk's
  "CONFIRMED" text can show before the rate-locking write is visible to the spec's Prisma read.
- **Better Auth bearer (2026-11-09):** the stock `bearer()` plugin's after-hook puts every new
  session's token in a readable `set-auth-token` header (staff ones too), so only its
  before-hook is used. User hooks run before plugin hooks, so the session gate never sees a
  bearer session: the conversion is limited to `/get-session`. Native requests carry no
  cookie, so Better Auth's origin check skips them; the web preview's proxy drops cookies for
  the same reason.
- **e2e workers leak into dispatch (2026-11-09):** a spec that creates a supplier must delete
  it in `afterAll`. `worker-app.spec.ts` once left its active La Habana guide behind, and the
  next full suite failed three `dispatch.spec.ts` tests on the extra candidate (dispatch runs
  first, so the leftover came from an earlier run). Now it deletes the user (the profile cascades) after `afterEach` has
  removed the fixture's service items and offers, which do not cascade.
- **Prisma and optional ids (2026-11-09):** `AuthUser.sessionId` is optional, and
  `deleteMany({ where: { id: undefined } })` matches every row: guard before using it.
- **Calendar dates (2026-11-09):** a credential expiry is midnight UTC; formatted in Havana time
  it shows the day before. The worker app formats such dates in UTC (`calendarDate`).
- **Stopping servers (2026-11-09):** `pkill -f "<pattern>"` run through the agent's shell also
  matches that shell's own command line (it contains the pattern) and kills it (exit 144),
  leaving the servers up. Find PIDs with `ss -ltnp | grep -E ':300[0-2]'` and `kill <pid>`.
- **A4 hold (2026-11-09):** `OperatingSettingsService`'s third constructor parameter
  (`heldOff`) defaults to `[]`, so services built by hand (tests, `cli/retention-scan.ts`)
  never hold anything; only the Nest module reads the environment. A stored settings version
  without `aiAssistant` merges it from the defaults (no data change), as the D8b flags did.
  The desk's raw `values.aiAssistant` can say On while the flag in force is off: read
  `getFeaturesInForce()`, not `getThresholds()`, for anything the hold covers.
- **B3 deploy script (2026-11-08):** `docker compose config --images <service>` also prints
  the service's dependencies' images (postgres, redis), so do not use it to name one image;
  a pull that cannot get an image already exits non-zero (`denied` from GHCR). `deploy.sh`
  refuses a checkout with tracked changes: stash uncommitted docs before a rehearsal run
  (`git stash push -- <paths>`, pop after). Rehearsal tags are local lightweight tags on HEAD
  (`v0.0.1-rh`); delete them after so the owner never pushes them. The rehearsal ran on
  `-p ota-b11` (now down, volumes kept; its MinIO `pre-deploy/` holds 3 dumps). `deploy/.env`
  got a new trial password hash (the password is in this session's scratchpad only;
  regenerate next time); the `OTA_IMAGE_PREFIX`/`OTA_VERSION` lines were removed again.
- **The storefront 404 shell (2026-11-08, fixed for unmatched paths):** Next 15.5 renders any
  `notFound()` thrown while rendering as its bare error document (`<html id="__next_error__">`,
  the real page after hydration), because React's server renderer has no error boundaries;
  even a bare Next app does this, nested or not, dev or `next start`. Only an **unmatched** URL
  is rendered in full (Next's `/_not-found` route under the root `app/layout`). So never add a
  catch-all page that calls `notFound()`; unknown paths must stay unmatched. Wrapping pages in
  `<Suspense>` keeps the layout but turns the status into 200. Probe:
  `curl -s localhost:3000/en/no-such-page | grep -o '<html[^>]*>'` (now `lang="en"`); a slug
  page (`/en/packages/nope`) still shows the error document.
- **The root layout is a pass-through (2026-11-08):** `app/layout.tsx` returns its children and
  both `[locale]/layout.tsx` and `app/not-found.tsx` render `<html>` through `SiteDocument`.
  Change the site's `<html>`, providers or chrome in `components/site-document.tsx`, never in
  one of the two callers. Following a link from the root 404 swaps the whole document on the
  client (checked: one `html`/`body`/`main`, no console errors).
- **Docker builds (2026-11-08):** no `buildx` here, so Compose falls back to the classic
  builder; keep the Dockerfiles free of BuildKit-only syntax (`RUN --mount`). pnpm 12's `fetch`
  has no `--frozen-lockfile` (install does). Turbo runs `build` in strict env mode, so the
  Dockerfiles pass `--env-mode=loose` or Next would build without `API_URL`. Next fixes its
  rewrites and `NEXT_PUBLIC_*` at build: a changed `DESK_DOMAIN` needs a desk rebuild. No
  package declares `files`, so `pnpm deploy` would drop the gitignored `dist/`; the images do a
  filtered `pnpm install --prod` and copy `dist/` in. `@prisma/client` is `@ota/db`'s, not the
  API's: probe it from `/app/packages/db`.
- **Compose settings (2026-11-08):** `KEY=` in an env file is an empty string, not unset, and
  `AI_PROVIDER ?? 'mock'`, `S3_REGION ?? …`, `API_PUBLIC_URL ?? BETTER_AUTH_URL` then take the
  empty value: optional settings stay commented out in the templates. Single-quote values with
  `$` (Caddy's bcrypt hash). Postgres runs `deploy/postgres/init` only on an empty volume.
- **Rehearsal (2026-11-08):** `deploy/.env` and `deploy/api.env` on this machine hold throwaway
  rehearsal values (gitignored); the basic-auth password is in the session scratchpad only, so
  regenerate the hash (`caddy hash-password`) next time. Better Auth's routes are mounted before
  Nest, so they never appear in the API's request log: check forwarded headers on an
  `/api/ota/*` route. The rehearsal holds host ports 80/443 while up; `down` after.
- **Rehearsal projects (2026-11-08, night):** the B9/B11 rehearsal ran as `-p ota-b11` (fresh
  volumes, Super Admins made by the command, `ota-backups` bucket in the dev MinIO); the older
  `ota-rehearsal` volumes hold a hand-promoted Super Admin, so B9 refuses there. Both are down
  with volumes kept. `deploy/backup.env` holds rehearsal values; the age key and trial password
  are in that session's scratchpad only (regenerate: `age-keygen` in the backup image,
  `caddy hash-password`).
- **Backup script (2026-11-08):** `.dockerignore` excludes `deploy/`; a file an image needs is
  re-included by name (`!deploy/backup/ota-backup.sh`). `pg_dump -Fc` into a pipe writes no data
  offsets, so `pg_restore` reads a decrypted file, never stdin. `set -e` is off inside an `if`
  condition, so `backup` runs itself as a child (`_backup`) to email the result. Mailpit's JSON
  escapes `&` as `&`: read links from the parsed `Text`, not by grepping the JSON.
  `RCLONE_CONFIG=/dev/null` silences rclone's "config file not found" notice.
- **New env vars and `pnpm dev` (2026-11-08):** turbo runs `dev` in strict env mode, so a
  variable set in the shell reaches the apps only if it is in `turbo.json` `passThroughEnv`
  (`AUTH_ALLOWED_HOSTS`, `TRUSTED_ORIGINS`, `SITE_NOINDEX` were added). Values in
  `apps/api/.env` still load, and `process.loadEnvFile` does not override the shell.
- **Rehearsing per-site sign-in (2026-11-08):** on plain `localhost` cookies are shared across
  ports, so separation cannot show. Use `vereda.localhost:3000` and `desk.localhost:3002` with
  `AUTH_ALLOWED_HOSTS` and `TRUSTED_ORIGINS` listing both (curl and Chromium resolve
  `*.localhost` to loopback). The desk dashboard is then Spanish for curl (no Accept-Language).
- **`robots.ts` is prerendered by default:** without `dynamic = 'force-dynamic'` the build bakes
  `SITE_NOINDEX` in. The build table must show `ƒ /robots.txt`.
- **`pkill -f` with a pattern from your own command line kills your shell** (exit 144); kill by
  the PID from `ss -ltnp` instead.
- **Keep building (2026-11-07):** `createVersion` now runs `$queryRaw` (the proposal lock) first in
  its transaction, so a fake Prisma on that path needs `$queryRaw` returning `[{ updated_at }]`.
  Prisma's `@updatedAt` moves on any client write to `custom_requests`: an e2e or fixture that
  updates a request invalidates an open desk page's stamp (`storefront-keep-building.spec.ts`
  does this on purpose to force `RequestChanged`). A PUT without `notes` clears them; the first
  live event test failed on exactly that.
- **Storefront dev server (2026-11-06):** the first customer-pages audit timed out on 3 of 8
  cold starts today, with RSS 6–8 GB within 20 minutes; once, every page then timed out, even
  `curl` at 90 s. Cause not found. 2026-11-07: the customer-pages audit wedged 3 of 3 (one
  full run, two fresh reruns) with the machine at 17/23 GB and 10 GB swap; the 404 page still
  answered, home did not. Not the pages: all 19 customer pages went idle in about 4 s each in a probe of the same list; not the
  API: the A/B above. The body "16 px" failure is a symptom of it, not a font bug. Check `curl`
  on :3000 before believing a storefront failure. `reuseExistingServer` reuses a wedged server,
  so back-to-back `playwright test` runs are not fresh, and each run clears `test-results`:
  copy the trace out before the next. A fresh server also needs the `sh -c next dev` parents
  killed. Kill by the PIDs `ss -ltnp` and `ps` show: `pgrep -f 'next dev'` inside a shell
  command also matches that shell, and `kill` then ends the command itself (exit 144).
- **Seat locks (2026-11-06):** call `claimDepartureSeats` before the reservation is written. The
  row's foreign key takes a share lock on the departure, and two transactions upgrading theirs
  deadlock. Any new lock in a package save or a booking must follow departures → tiers → extras.
  A fake Prisma on these paths needs `$queryRaw` returning the departure's row
  (`package-booking.e2e`, `travelers.e2e`). In `packages.integration.test.ts`, earlier tests
  remove `booked.departureId`, so a later test must save `saved` and use what comes back; a
  lock on the stale id matches nothing and still "works" until the insert fails. `vi.spyOn` a
  bound method and restore in `afterEach`: a failed test that skips `mockRestore` stacks spies
  into a stack overflow that hides the real result.
- **Published e2e fixtures (2026-11-06):** a package published by a spec and shown on the
  storefront enters the 60 s list cache and outlives its deletion; `storefront-compare` then
  read "Showing 2 of 2 trips", and retrying `Clear all` cannot help (the filter is client-side).
  Keep fixtures DRAFT, or wait for a fresh read before asserting that something is absent
  (`storefront-packages.spec.ts` "lists only the departures").
- **Package saves (2026-11-06):** a new form field on a package row must go through the DTO and
  back in the PATCH: an in-place update writes what the request holds, and `status`/`active`
  default in the schema, so a field left out is reset. A `$queryRaw` lock in `planCollections`
  means any fake Prisma that saves a collection needs `$queryRaw` and that collection's
  `findMany` (`packages.e2e.test.ts` has them). Killing only the `next-server` PIDs that `ss`
  prints is not enough: `next dev` restarts them in seconds, so a verify run next to them is
  not "stack stopped" (this session's first build was thrown away for that). Kill the
  `next dev` parents too, and check `ss -ltn` shows nothing before building. A live test that
  fails before its cleanup leaves its rows, and `afterAll` then trips on the user's foreign key.
- **Shell (2026-11-04):** `pgrep -f`/`pkill -f '@turbo/linux-64/bin/turbo run dev'` inside a
  Bash call matches that call's own shell, which then signals itself and stops mid-command
  (twice this session). Find turbo with `ps -eo pid,comm | awk '$2=="turbo"'` and free ports
  by the PID `ss -ltnpH "sport = :3000"` prints. The DS 07 projects are ds07-320, 375, 414,
  768, 1024 and 1440 (there is no ds07-1280).
- **Email "about" lines (2026-11-04):** `emailReference` swallows a failed read, so a fake
  Prisma without `operatingSettings` (use `withNoSettingsVersion`) or `exchangeRate` silently
  sends the email with no line (the first `package-booking.e2e.test.ts` case failed that way).
  A hand-built `MeService` needs a real or faked `CurrenciesService` now that `bookPackage`
  calls `adoptShown` (the live `package-booking.integration.test.ts` had `{}`; fixed in
  `3458fdf`). `NotificationsService` takes `CurrenciesService` as its 7th argument. Any spec
  that books through the form with the default EUR cookie saves EUR on the traveler; restore
  `displayCurrency` in its cleanup. Any storefront read whose ids are posted back must not use
  the 60 s cache: Next serves the stale copy on the first request after expiry. The machine's
  Next dev servers grew to 4–5 GB each and stalled within minutes on 2026-11-06 (10 GB in
  swap); kill them by PID and use short runs on fresh servers when that happens.
- **IP allowlist (2026-11-02):** Better Auth 1.7 trusts a single `X-Forwarded-For` value as
  sent (and, in dev/test, falls back to 127.0.0.1); never point it back at that header. Next's
  rewrites pass `X-Forwarded-For` through unchanged and add none; the desk's server-side
  fetches carry no client address at all, which is why the rule judges the sign-in address,
  not each request's. Chromium reaches `localhost` over `::1`, so dev and e2e sign-ins record
  `0000:…:0000` (IPv6 cut to /64), shown as `::/64`. A threshold whose value is a list breaks
  any `a !== b` comparison (use `changedThresholds`), and jsonb reorders object keys, so never
  compare entries by `JSON.stringify`. `@ota/auth` is ESM: the API takes `CLIENT_IP_HEADER`
  from the dynamic import in `main.ts`, never a static import. e2e moves a session "outside"
  by rewriting `session.ip_address` in the DB; getSession has no cookie cache, so that takes
  effect at once. `SignInDevicesService` now takes `SessionPolicy` (5th argument).
- **Display currencies (2026-11-01):** Playwright's en-US defaults to USD, so
  `playwright.config.ts` seeds `ota_currency=EUR` beside `ota_consent`; a spec that clears all
  cookies loses it (`storefront-display.spec.ts` does, but asserts no price). A new storefront
  price is `browsingPrice`/`<BrowsingPrice>` while browsing and EUR plus `<ApproxPrice>` when
  payable; the helpers take the amount's own currency and convert only EUR. Next-intl formats a
  number placeholder to 3 decimals, so the desk passes the locked rate pre-formatted. Do not
  run `prisma format`: it re-aligns ~380 unrelated lines of `schema.prisma`. A fake Prisma used
  by a payment confirmation needs `paymentReceipt.count`, `reservation.findUnique` with
  `select` (the lock's) and `exchangeRate`. The header row has no slack at lg–xl: anything
  added there must be measured signed in and in es/fr at 1024 and 1280 (the DS 07 spec checks
  `/en` only). French already scrolls 30–34 px at 1024 and 3–7 px at 1280 without the currency
  (pre-existing, not fixed). During long e2e runs the storefront's `next-server` restarts (a
  newer PID than the API's) and later storefront pages time out; rerun those on a fresh stack.
  The live tests build `MeService`, `PaymentsService` and others by hand with positional
  arguments and are skipped by `pnpm test`; a new constructor argument breaks them only under
  `RUN_DB_INTEGRATION=1`, so run the live list after changing a service's constructor.
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
  `kill -9`. Again on 2026-11-09: a re-run on the stack left by the worker spec failed six
  tests at the magic-link `page.goto` (`ERR_ABORTED`). The tell was `ss -ltnp` showing a
  Recv-Q above 0 on :3002. Never re-run on a left-behind stack; start from free ports.
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
  `apps/*/.next`, rerun the failed specs alone. Same remedy (2026-11-08, 1.5 h run, no suspend):
  the storefront next-server restarted itself mid-run, then sat at 7.4 GB RSS and 200% CPU
  answering nothing, so a late `page.goto` timed out at 240 s.
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
- **Raw-SQL fakes (2026-11-07):** `apps/api/test/package-booking.e2e.test.ts` and
  `travelers.e2e.test.ts` answer `$queryRaw` by the table named in the SQL text (departures,
  tiers, extras). A new raw lock in a booking writer makes 18 of their tests fail until the fake
  answers that table too.
- **Proving a lock (2026-11-07):** the FOR SHARE test in `packages.integration.test.ts` fails
  with a Prisma FK error when `FOR SHARE` is removed; the race tests in
  `package-booking.integration.test.ts` insert the change with `afterPlanning` (Booking form)
  or a one-shot `$transaction` wrapper (desk party edit).
- **AGENTS.md §C lines proposed (owner edit)**, in addition to the earlier ones still pending
  (M7, SIGTERM, document downloads, M8, graceful shutdown, Nest 12, M6, log redaction):
  - "2026-11-11: W-Earnings is `GET /worker/earnings` (`SERVICE_WORKER`, own profile) and the
    supplier inspector's `payouts`; both reduce through `workerEarnings` in
    `packages/domain/src/worker/earnings.ts`. A job is finished when its service has ended (no
    code sets `FULFILLED`), and nothing sets `payout_status = SETTLED` until the payouts
    migration (`docs/schema-w-earnings.md`) lands. The worker's reliability reads every offer,
    as the dispatch floor does; change both together or neither."
  - "2026-11-11: W-Calendar's block reasons ride on migration
    `20261111171409_w_calendar_block_reasons` (nullable `availabilities.block_reason`, additive,
    no backfill). Only the worker app writes a reason; the desk's availability upsert writes
    NULL. In the worker app, state for the web preview goes through `aria-*` props
    (`aria-checked`), not `accessibilityState`, which react-native-web ignores."
  - "2026-11-09: the worker app (`apps/worker-app`, Expo SDK 58, Android first) signs in with a
    phone number and a six-digit code (`/api/auth/sign-in/worker-code`, SMS or desk-issued)
    and sends its session as a bearer token, which the API accepts only for `worker_code`
    sessions and only through `getSession`. `pnpm --filter @ota/worker-app run build` is the
    Android JS export; `run preview` serves the web export on :3003 for screenshots and the e2e
    only. The app reads tenant values at build time in `app.config.ts`, never at runtime.
    `POST /suppliers/:id/worker-sign-out` (2026-11-10) ends a worker's `worker_code` sessions and
    open code for a lost phone; a staff route that touches worker sessions must keep that
    filter."
  - "2026-11-11: the worker's calendar is `GET /worker/calendar`, `PUT /worker/availability`
    and `PUT /worker/fuel` (`SERVICE_WORKER`, own profile); the rules live in
    `packages/domain/src/worker/calendar.ts`. Job and offer days are never changed from the
    app. A driver's fuel goes through `SuppliersService.recordResources` with `via:
    WORKER_APP`, the desk's own write; keep one write path for `supplier_resources`."
  - "2026-11-11: CI installs Playwright's Chromium headless shell before Test (the API's
    shutdown test renders a real PDF). A new unit test that launches a browser needs nothing
    more; one that needs another browser must add it to that step."
  - "2026-11-09: the desk's AI (`/assistant/*`, Draft with AI, the Reports summary) follows the
    `aiAssistant` runtime flag, and the API holds it off (`HELD_OFF_FEATURES`) while
    `NODE_ENV=production` and `llmProviderName(AI_PROVIDER)` is `mock`; a real adapter added to
    `packages/ai` lifts the hold. The desk reads the flags in force with
    `getFeaturesInForce()`."
  - "2026-11-08: storefront paths no route serves must stay unmatched (never a catch-all page
    calling `notFound()`): Next 15.5 serves a `notFound()` thrown while rendering as its bare
    error document, and only Next's `/_not-found` route renders a 404 with the layout on the
    server. `app/layout.tsx` is a pass-through; `components/site-document.tsx` is the site's
    `<html>` for both `[locale]/layout.tsx` and the root `not-found.tsx`."
  - "2026-11-08: `deploy/` is the production stack (images, `compose.prod.yml`, Caddy, the
    Plausible override, the runtime-role init script, `smoke.sh`). Settings live in
    `deploy/.env` (Compose) and `deploy/api.env` (the API only; it connects as the runtime
    role, never the owner), both gitignored; an optional setting stays commented out, never
    `KEY=`. Dockerfiles avoid BuildKit-only syntax (no buildx on the dev machine), and Next
    images take `API_URL`/`NEXT_PUBLIC_API_ORIGIN` as build arguments."
  - "2026-11-08: with `AUTH_ALLOWED_HOSTS` set, Better Auth answers each request on the host
    in `X-Forwarded-Host` (`siteBaseURL`, `packages/auth`; `advanced.trustedProxyHeaders`),
    so each site keeps its own host-only session cookie; `BETTER_AUTH_URL` is the fallback and
    sets every link's scheme. Unset (dev), everything stays on `BETTER_AUTH_URL`."
  - "2026-11-08: the `/ops` and `/conversations` gateways take `SOCKET_ORIGIN_OPTIONS`
    (`apps/api/src/common/trusted-origins.ts`): a handshake whose `Origin` is not in
    `TRUSTED_ORIGINS` is refused in CORS and in `allowRequest` (CORS does not cover a
    WebSocket upgrade); no `Origin` goes on to the session check. The list is read on each
    call because the decorators run before `main.ts` loads `.env`."
  - "2026-11-08: the public `GET /catalog` answers `CatalogItemDto` (the inventory item without
    `supplierId`); a public read must never carry a supplier or worker id."
  - "2026-11-08: one-off commands ship in the API image as `apps/api/src/cli/*.ts` (plain
    `PrismaClient`, no Nest context): `bootstrap-super-admins.js` (B9, refuses once any Super
    Admin exists) and `retention-scan.js` (after a restore). Run them with
    `docker compose -f deploy/compose.prod.yml run --rm api node dist/cli/<name>.js`."
  - "2026-11-08: releases are `v*` tags: `.github/workflows/release.yml` pushes
    `ghcr.io/<owner>/ota/{api,storefront,desk,backup}:<tag>` via `deploy/build-images.sh`
    (repository variable `DESK_DOMAIN` baked into the desk), and the server runs
    `deploy/deploy.sh <tag>` from a checkout at that tag (pull, pre-deploy dump, migrate,
    `up --wait`, then `OTA_VERSION` in `deploy/.env`); `--rollback <tag>` skips dump and
    migration. Never move or reuse a tag: the server does not re-pull one it has."
  - "2026-11-08: backups are the compose service `backup` (`deploy/backup/ota-backup.sh`):
    age-encrypted for public keys only, uploaded by rclone from `RCLONE_CONFIG_*` variables;
    the private key is mounted at `/run/age/identity` for a restore only. Settings in
    `deploy/backup.env` (gitignored)."
  - "2026-11-08: `SITE_NOINDEX=1` makes the storefront's `/robots.txt` (`force-dynamic`) disallow
    everything; `next 15` pins postcss 8.4.31, overridden to the patched 8.5 line in
    `pnpm-workspace.yaml` `overrides` (drop it once Next's own pin is patched)."
  - "2026-11-07: a custom request is editable only while it is OPEN and its proposal DRAFT
    (`customRequestEditable`). `PUT /me/proposals/:id/request` and `createVersion` both take
    `FOR UPDATE` on the proposal first; a send carrying `requestUpdatedAt` refuses a request
    changed since (409 `RequestChanged`). Edits are `custom_request.edited` audit rows with
    `changed`, not a column; an edit must keep its live event requests' seats
    (`eventLinkRefusals`)."
  - "2026-11-06: a departure's seats, status and capacity are decided only by
    `claimDepartureSeats`, first in the transaction that writes them (`FOR UPDATE` on the
    departure). Anything that takes seats must call it before writing the reservation, and
    package locks go departures, tiers, extras."
  - "2026-11-06: a package save matches departures on their date and tiers/extras on their
    code and updates them in place (`planCollectionEdit`); bookings point at those rows, so never
    delete and recreate them. A row bookings use (not `CANCELLED`) cannot go and a departure
    cannot shrink below its booked seats: 409 `PackageRowsInUse`. Services and days have no
    references and are still replaced wholesale."
  - "2026-11-02: a session's address comes only from `X-OTA-Client-IP`, which `main.ts` sets
    from Express's `req.ip` (`TRUST_PROXY`) on every `/api/auth` request; Better Auth ignores
    `X-Forwarded-For`. The Super Admin IP allowlist (`docs/schema-m9-ip-allowlist.md`) is two
    threshold keys, judged on that sign-in address in `SessionPolicy` (403 `IP_NOT_ALLOWED`);
    the break-glass is `SUPER_ADMIN_IP_ALLOWLIST_OVERRIDE=off`. Threshold values may be lists:
    compare documents with `changedThresholds`."
  - "2026-11-01: display currencies (migration 20261101221301_display_currencies) are
    indicative: every amount charged, invoiced or refunded stays EUR. Rates live in
    `exchange_rates` (one reference row per day and currency) from `FX_RATE_PROVIDER` (mock
    unless `ecb`); the shown rate adds the `fxSpreadPercent` threshold. The first PAID receipt
    locks a booking's `display_currency`/`display_rate`, never changed after. Storefront
    browsing prices use `browsingPrice`/`<BrowsingPrice>`, payable totals EUR plus
    `<ApproxPrice>`; e2e starts on an `ota_currency=EUR` cookie."
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

  - "2026-11-07: a booking writer (the Booking form, the desk's party edit) holds its departure
    `FOR UPDATE` (`claimDepartureSeats`), then its tier and extras `FOR SHARE`, extras in id
    order (`claimPackageChoices`, `apps/api/src/travelers/departure-seats.ts`), before its
    row is written; a package save locks departures, tiers, then extras `FOR UPDATE` in the
    same order. Keep both orders when adding a lock."

## Next
1. Owner: push `vereda` again (W-Earnings and its docs are local) and check the pull request's
   CI; the last run (on `b018609`, with the PDF-browser fix) was green.
2. Owner, before the first release: set the repository variable `DESK_DOMAIN`
   (`desk.veredaexpeditions.com`), then push a `v*` tag and watch the Release workflow (its
   first real run; runbook "Release images"). On the server: `docker login ghcr.io` with a
   classic `read:packages` token. The deployment build (B1–B11, B13) is complete; B12 (S3
   documents) stays optional.
3. Phase 7, owner: a machine with the Android SDK and a JDK for the first APK (our own signing
   key, backed up twice), the Android id, and two or three suppliers for the field test. Agent,
   in order (W-Calendar and its block reasons landed 2026-11-11): background resend (needs the
   owner's yes to `expo-background-task` 58.0.11, `expo-task-manager` 58.0.12 and
   `unimodules-app-loader` 58.0.2, Expo's own SDK 58 pins; no web support, so only unit tests
   until an APK); W-Earnings' payouts (owner: decide E1–E8 in `docs/schema-w-earnings.md`, a
   migration; the read-only screen landed 2026-11-11); W-Credentials (needs a migration doc
   first: four documents per worker, a renewal under review beside the current one); W-Job and
   its SMS SOS; distribution (download page, update prompt, self-hosted `expo-updates`). Ops
   Lite (Phase 7 item 2) not started.
4. Owner, waiting on the legal entity and counsel (the owner says when): Phase C accounts, the
   counsel package (also the AI provider and sanctions question), the business values, the
   tenant placeholders, the SMS provider. The full list is `docs/production-readiness.md` §4;
   do not re-ask what it records as decided.
5. The AI provider (open; suggestions in `docs/production-readiness.md` §6): production holds
   the mock off by itself (A4), so this does not block launch.
6. Deferred, the owner's call: M10 room holds/photos (migration doc), the stale price window,
   the desktop cookie banner, a real screen-reader run, manifest editing beyond flags, PII purge
   Tiers 2–3, the load test (D24), SMS.
7. Before the merge into `main`: graduate this handoff (facts → AGENTS.md §C via the owner,
   decisions → ADRs/PR) and delete it in the merge; merge with a merge commit.

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
- 2026-11-01 — the owner chose display currencies next (over the IP allowlist, M10's room holds
  and event photos; the deployment plan is unanswered and Plausible CE is not installed), with
  the small fix hiding Support's refused customer actions, and approved
  `docs/schema-m9-display-currencies.md` as recommended: C1a browsing converts, payable stays
  EUR with "≈", C2a USD/CAD/GBP on and CHF off with a browser-region default else EUR, C3a a
  mock provider with the ECB reader built but off, C4a a cookie plus a saved choice, C5a a
  daily `exchange_rates` table, 0.6 % spread, EUR only past 5 days, C6a the lock at the first
  payment as a threshold (DEPOSIT or INVOICE), C7a storefront, desk and invoice (emails
  deferred). The build let the traveler's payment link save the shown currency when none is
  saved, locked only on the first PAID receipt, worded the invoice line "at the rate locked
  on" (not "ECB rate"), kept payable line items and the price filter in EUR, put the controls
  on Thresholds, and seeded e2e with an EUR cookie.
- 2026-11-02 — the owner chose the IP allowlist next (over the display-currency email lines,
  M10's room holds and event photos, and answering the deployment plan; the plan is unanswered
  and Plausible CE is not installed) and approved `docs/schema-m9-ip-allowlist.md` as
  recommended: I1a judge the sign-in address, not each request's; I2a take it from Express's
  `req.ip` under `TRUST_PROXY` through a header the API writes; I3a refuse the session
  everywhere like the passkey rule; I4a refuse an apply that leaves out the applier, show
  "your sign-in address", break-glass by env; I5a two keys in the settings document (no
  migration); I6a Super Admins only; I7a off by default. The build showed an IPv6 address as its
  /64 (`ipAddressText`), audited the refusal at sign-in in the new-device hook, and ran the
  apply check whatever the break-glass says.
- 2026-11-04 — the owner chose the display-currency email lines next (C7b; over "Keep building
  the trip", M10's room holds and event photos, and answering the deployment plan; the plan is
  unanswered and Plausible CE is not installed). Built without a migration or new route. The
  build wrote "about" (the email boards' word, not the web's "≈"), put the guide beside each
  amount payable now in E-Invoice with one lock note, worded the lock as the code locks it,
  had the Booking form send and keep the shown currency (as the payment link does), and let a
  failed rate read drop the line rather than the email.
- 2026-11-06 — the C7b e2e exposed stale departure ids on the Booking page after a package save;
  fixed narrowly by reading the package uncached there (`0b76560`) rather than keeping
  departure ids stable across editor saves (an API persistence change, left for the owner).
- 2026-11-06 — the owner chose stable package ids next (over "Keep building the trip", M10's
  room holds and event photos, and answering the deployment plan; the plan is unanswered and
  Plausible CE is not installed), and chose to refuse a save that removes a row bookings use or
  cuts a departure below its booked seats (over retiring the row, or only warning). The build
  matched rows on their natural keys rather than sending ids (no request change, and a changed
  date is refused rather than moved), took row locks in the save, kept the fields the editor
  hides, added the departure status select the refusal's "Closed" advice needs, and filtered
  the package page to open departures. The uncached Booking page read `0b76560` stays.
- 2026-11-06 — the owner chose the departure seat race next (over "Keep building the trip", M10's
  room holds and event photos, and answering the deployment plan; the plan is unanswered and
  Plausible CE is not installed). A row lock on the departure in the writing transaction, over
  a seat counter (a migration) or SERIALIZABLE retries. The check moved there rather than being
  repeated, so one place decides. Moved the save's departure lock ahead of its tier lock rather
  than taking a tier lock on every booking. Fixed the desk's party edit too, as the same bug.
- 2026-11-07 — the owner chose "Keep building the trip" next (over the tier/extra 500, M10's room
  holds and photos, and answering the deployment plan; the plan is unanswered and Plausible CE
  is not installed), editable until a proposal is sent (over until the desk starts a draft, or
  any time it is open). Since a version is created and sent at once, that is OPEN + DRAFT. Chose
  a row lock on the proposal in both the edit and the send, plus the desk's `updatedAt` stamp,
  over a request version column (a migration); the edit history lives in audit rows. An edit
  that would strand event seats is refused rather than unlinking the event request.
- 2026-11-07 — the owner chose the tier/extra 500 next (over M10's room holds and photos, the
  desktop cookie banner, and answering the deployment plan; the plan is unanswered and
  Plausible CE is not installed). Chose `FOR SHARE` on the booking's tier and extras after
  the departure claim, over re-reading the whole package under locks or re-pricing there.
  Also refused an extra withdrawn in the window (the same check `plan()` makes) and fixed the
  desk's party edit tier, as the same bug.
- 2026-11-08 — the owner approved the deployment plan as recommended with every (approval)
  item, chose security patches as the next batch, kept supplier confirmations for the worker
  app (over the desk "confirmed by phone" action first; that stays the fallback), and asked for
  the pull request into `main`. Chose a merge commit over squash or rebase for that merge,
  because `main` is an ancestor of `vereda` and the history stays reviewable. The AI provider
  stays open: suggested Mistral (EU) if counsel flags US providers, else a trial of Mistral and
  Claude on anonymised desk messages.
- 2026-11-08 — security patches by in-range updates plus a same-major override of Next's
  postcss pin, over forcing majors: the two majors left (`deepmerge-ts`, `uuid`) are
  unreachable from a request and go to the owner. The public catalog drops `supplierId` with a
  separate DTO rather than changing the desk's. B7 checks the handshake's `Origin` as well as
  CORS, because CORS alone does not stop a cross-origin WebSocket. B8's flag is read per request
  so one image serves the trial and launch. B6 takes the links' scheme from `BETTER_AUTH_URL`
  rather than a new variable or `X-Forwarded-Proto`, since behind the proxy the API is reached
  over http.
- 2026-11-08 — the owner took the agent's recommendations: leave the two major-only audit fixes
  (`deepmerge-ts`, `uuid`) until Prisma and exceljs update them, and fix the storefront 404
  shell before B1/B2.
- 2026-11-08 — the 404 fix makes unknown paths unmatched (Next's `/_not-found` under a
  pass-through root layout) rather than wrapping pages in `<Suspense>`, because only the former
  keeps status 404; a page's own `notFound()` stays on Next's error document until the owner
  decides (Next 1). The API image is Node 22 slim plus Playwright's own Chromium install rather
  than the Playwright image, to keep Node 22 (the image ships 24) and drop two browsers. The
  images prune with a filtered `pnpm install --prod` (`pnpm deploy` would drop `dist/`), and
  `prisma` became a production dependency so the same image runs `migrate deploy`. The desk gets
  `X-Frame-Options: SAMEORIGIN` (it frames a credential from its own origin) where the plan said
  DENY. B4 split the settings into `deploy/.env` (Compose) and `deploy/api.env` (API only) so
  the API never holds the owner's password.
- 2026-11-08 — the owner chose to leave a page's own `notFound()` on Next's error document
  (status 404, the page after hydration) rather than a 200 soft 404 or a Next 16 upgrade;
  unmatched paths already get the server-rendered 404.
- 2026-11-08 — B9 is a command in the API image, not an HTTP route: nothing public can ever
  promote, and it reuses the image's Prisma client and the tenant manifest. It refuses on any
  Super Admin row, deactivated or not, and promotes all named addresses or none.
- 2026-11-08 — B11 runs in a container built on the database's own `postgres:16.15` image
  (matching `pg_dump`), so `age`/`rclone` are never installed on the host; only public keys
  live on the server. A live restore drops and re-creates the database (not `--clean`) so a
  failed migration's leftovers go too, restores with `--no-owner --no-privileges`, then
  re-runs the B4 role script. "Re-run anonymisation" is a command running the daily job's own
  pass, not a desk button (no UI change). The month's first good daily is its monthly.
- 2026-11-08 — B3 uses plain `docker login`/`docker build`/`docker push` in the workflow
  rather than Docker's build/push actions (no new third-party action), through one script
  (`deploy/build-images.sh`) that CI and a local rehearsal share. The release reruns `ci.yml`
  as its gate instead of trusting the tagged commit's earlier run. `deploy.sh` pulls before
  the pre-deploy dump (the plan listed the dump first) so a missing image changes nothing,
  requires the checkout at the tag so the compose file and Caddy settings match the images,
  and records `OTA_VERSION` only after every health check passes.
- 2026-11-09 — the owner chose A4 with the recommended default: the `aiAssistant` flag defaults
  on (dev and e2e unchanged) and production on the mock holds it off at the API, rather than a
  hand switch before launch or a default-off flag. The hold is a deployment fact removed from
  the flags in force, not a stored value, so no settings version or data changes and the
  Thresholds board still shows what the Super Admins set. The desk hides the draft button
  rather than disabling it with a reason, since nobody can switch it on from Messages.
- 2026-11-09 — the owner approved Expo and started Phase 7 rather than the desk "confirmed by
  phone" action, with W1 (a code by SMS or read out by the desk), W3 (bearer tokens for
  worker-code sessions only) and W7 (Expo's web target for screenshots and the e2e only). The
  build chose: codes in Better Auth's `verification` table (no migration); three screens in
  one state machine rather than `expo-router`; the system font; the SMS console only outside
  production; a desk code stands against SMS resends; the stock bearer plugin's response side
  left out; Expo's exact pinned versions, all at least two weeks old.
- 2026-11-09 — the owner deferred the two advisories Expo brought (`glob` 13 → 14, `minimatch`
  10 → 11, moderate), like deepmerge-ts and uuid: they run only in Expo's build-time CLI on our
  own files, and the fixes are new majors. The audit is re-run each session; take Expo's patch
  once it bumps them.
- 2026-11-10 — the owner chose the desk's worker sign-out over availability/W-Calendar and
  background resend. It ends only worker-code sessions rather than every session of the account
  (the staff "Sign out everywhere" shape), because the app's bearer can carry nothing else, and
  it also voids an open code so one read out or texted before the loss cannot sign the phone
  back in. The confirm button is primary, not destructive: a new code undoes it.
- 2026-11-11 — CI installs the Chromium headless shell (with its system packages) before Test,
  rather than skipping `shutdown.test.ts` where no browser exists: the test's point is that a
  real Chromium is closed on SIGTERM. The install uses `packages/documents`' playwright so the
  browser build matches.
- 2026-11-11 — the owner chose W-Calendar now on the existing tables, with a migration document
  for the rest, over a migration-first calendar or background resend. The build found the fuel
  declaration needs no migration (`supplier_resources` and the `WORKER_APP` channel exist), so
  only the block reasons wait. It chose: the range picked on the grid (no date-picker
  dependency), at most 62 days per change up to the end of the twelfth month ahead, job and
  offer days left as they are, the long block counted from today, the fuel written through the
  desk's resources path, and no offline queue for calendar changes.
- 2026-11-11 — the owner approved the block reasons as recommended (K1a–K6a), over W-Earnings
  or background resend. The build chose: the board's chips at the app's 48 dp rather than 36 px;
  a chip on a blocked day saves at once (no separate save); the range card's reason returns to
  "Otro" after each block; a freed day drops its reason whatever is sent (not a 400); a job or
  offer day hides a stored reason; the two chip groups named apart; `aria-checked` over
  `accessibilityState` so the web preview shows the picked chip.
- 2026-11-11 — the owner chose a read-only W-Earnings on the existing tables over W-Credentials,
  background resend and W-Job. The build chose: a job is finished by its end date (not
  `FULFILLED`, which nothing sets); the worker's reliability is the floor's reading (every
  offer) rather than the board's 12 months, so the number shown is the one that decides; the
  board's "a timely decline keeps the number high" is dropped as untrue of the rule; "Pagado"
  by the job's year until a paid date exists; no ratings (a review rates the booking); the
  desk gets the same payouts on the supplier page; recording payouts, method, receipts and
  the pay rule go to `docs/schema-w-earnings.md` for approval.
