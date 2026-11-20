# Known limitations and open assumptions

What the build assumed, what was never run (on a phone, against a real provider, in
production), and the questions still waiting on the owner, finance or counsel. Each entry is
dated, roughly newest first.

These entries come from the `vereda` branch's handoff, copied as they stood on 2026-11-20 when
the branch was merged into `main`. When an item is settled or built, delete it here and record
the decision in `docs/decision-log.md` or an ADR. If an entry contradicts the code, the code
wins. The owner's checklist is `docs/production-readiness.md`.

- **Traveler schedule (2026-11-20):** only the staff emails were taken out, as asked. The
  traveler's JSON still carries the refund's `note` (the desk's request note) and each
  approval's `note` (a reject reason); the storefront shows neither. Whether to drop those
  too is the owner's call.
- **Vehicle change (2026-11-20):** a non-driver asking gets 422, as the desk's `PUT
  …/vehicle` answers, not the 409 the doc's §3 named (recorded in §5). Approval supersedes only
  **verified** inspection/insurance: an upload already waiting is kept as possibly the new
  car's. A desk save drops a pre-X3a `insuranceUntil` from the JSON (the audit row keeps it).
  Nothing ran on a device: the app form was exercised in the web preview only.
- **M10 holds and photos (2026-11-20):** the hold's casa name is the catalog item's name, not
  translated; "Vedado" in the board's line became the event's province. No placeholder photo
  is seeded (§7 of the doc says why). The builder link's `from` follows Havana's day while
  `/custom` checks it against the UTC day, so between 00:00 and ~05:00 UTC on an event's
  running days a link from "today" can be ignored (the builder then opens empty); not seen,
  inferred from the code. `GET /catalog/events` is cached 60 s by the storefront, so a hold
  line can outlive its day by up to a minute.
- **Refund nudge (2026-11-19):** email stands in for push/SMS; a send failure is logged and
  the nudge (and its cooldown) stands. Approvers are found by role (`OPERATIONS_ADMIN`,
  `SUPER_ADMIN`, active), so in dev the list is long: the dev DB has seven active Super Admins
  left by earlier runs (including one named "Traveler Two"), hence the "Emailed 7 approvers"
  form. The owner kept 30 minutes as the cooldown (2026-11-20). The staff addresses in the
  traveler's schedule JSON are gone since 2026-11-20 (State).
- **W-Job (2026-11-15):** nothing ran on a device; the e2e drives the web preview, where
  `expo-location` is the browser's geolocation and the composer path (no data) is not taken.
  Assumed: Android's `sms:` link opens the default SMS app with the body filled; a fix indoors
  may take the full 10 s and fall back to the last known position. A report the desk logs from
  an SMS and the app's later copy are two incidents (no shared id), and the app's copy raises
  a second red alert. A step's time is the phone's corrected by the last home's clock; a phone
  that never synced uses its own clock. The emergency numbers 104/106/105 are Cuba's
  (ambulance, police, fire) and the desk number is the manifest's placeholder.
- **Background resend (2026-11-14, evening):** never run on a device; the web preview has no
  background, so only the unit tests and the Android bundle export (it contains the task and
  both native modules; the web bundle neither) stand behind it. Assumed: Android starts a
  headless JS runtime when the app is closed, and `expo-secure-store`, `expo-sqlite`'s kv store
  and `expo-constants` work there. The one-flush-at-a-time lock is per JS runtime: if Android
  ran the headless task while a second runtime had the app open, both could send the same
  answer, and the second would read as refused (the answer itself is recorded). Timing on a
  battery-saving phone (Doze, makers' task killers) is unknown; the field test should note it.
- **W-Credentials (2026-11-14):** the required documents per category are placeholders
  (`docs/production-readiness.md` §4, for counsel). A supplier verified before the change
  stays verified with documents missing; only a new approval or a reinstatement is gated. The
  camera, the permission prompt and the JPEG size (quality 0.6, assumed near 1 MB) are not run
  on a device; the web preview's file input stands in for both buttons. The review SMS is
  logged in development and not sent in production (no provider). Approving does not change the
  vehicle form's own `insuranceUntil`.
- **Ops Lite (2026-11-14):** urgent means a traveler waiting for a reply on a booking with an
  open case (the board's note); nothing else (an OFAC hold, an arrival today) raises a thread.
  A trip's province today is where the party sleeps (the stay covering tonight), else any
  service that day, else the last service started. The pipeline's ACTION_REQUIRED clock counts
  from `updatedAt` (the closest thing to "entered the state"; no state timestamp exists), as do
  SECURED_AND_INVOICED and CANCELLED. Each state lists three bookings picked from its first 50
  by the database order. Browser notifications are untested in a real phone browser (headless
  Chromium reports them denied); Android Chrome shows them only while the tab is alive. The
  inbox count in the bottom bar is re-read every minute and on each screen change. Opening a
  thread on the desk now also marks it read (the same hook).
- **The receipt in the app (2026-11-13, evening):** not run on a device. Assumed: Android's
  share sheet lists a PDF viewer (Drive or the phone's own) for most workers' phones; there is
  no in-app viewer and no `ACTION_VIEW` intent. The PDF stays in the app's private cache until
  Android clears it (the same receipt overwrites itself); the desk's sign-out does not clear
  it. Assumed `downloadFileAsync`'s rejection text keeps "status: NNN" (read in
  `FileSystemDownload.kt` 58.0.11); if Expo changes it, a 401 shows the generic failure
  instead of signing out.
- **W-Earnings' payouts (2026-11-13):** business days are Monday to Friday with no public
  holidays; office sessions are Havana wall-clock times, and the session's close is counted from
  Havana midnight (a daylight-saving change inside a session would shift it by an hour). A
  failed payout is paid by a new payment like a pending one, and is not counted toward the next
  pay day. A payment's day may be any day from the last picked job's end to today. Each
  receipt line shows the job's current `payout_rate`; the total is the stored amount, so a rate
  edited after payment would show a mismatch (nothing edits a settled rate today). No undo of a
  recorded payment. The worker's earnings list the latest 12 payments, the desk 50. Not run on
  a device.
- **W-Earnings (2026-11-11):** a finished job is one whose service ended (written before W-Job,
  whose last step now sets `FULFILLED`; the pay rule still uses the end); a FAILED payout still counts in "Este mes" (work done) and shows as an issue,
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
- **Price under the locks (2026-11-18):** `plan()` still prices before the transaction;
  `confirmPrice` prices again once the claim holds the departure (`FOR UPDATE`), tier and
  extras (`FOR SHARE`) and then the package row (`FOR SHARE`). Keep the package lock after the
  others: `PackagesService.update` locks departures → tiers → extras in `planCollections` and
  updates the package row last, so taking the package first deadlocks against a save. The
  storefront shows the 409's `message`, which is the API's English text in every locale (as
  for a stale `expectedTotal` before); localizing it is not built.
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

