# Operations runbook

Day-2 operations for the OTA stack. Facts here mirror the code; if they diverge,
the code wins and this file should be corrected (AGENTS Article 6).

## Service map

| Component | Local port | Notes |
|---|---|---|
| API (NestJS) | 3001 | REST, Socket.IO (`/ops`, `/conversations`), BullMQ workers |
| Back-office (Next.js) | 3002 | operator ERP |
| Storefront (Next.js) | 3000 | public site, localized es/en/fr |
| Postgres 16 | 5432 | primary datastore |
| Redis 7 | 6379 | BullMQ queues |
| Mailpit (dev) | 8025 (SMTP 1025) | catch-all inbox |
| MinIO (dev) | 9001 (S3 9000) | object storage for credentials/media |

Local start: `docker compose up -d && pnpm dev`. API dev must stay
`node --watch -r @swc-node/register src/main.ts` (tsx/esbuild breaks Nest DI).

## Health and readiness

- **`GET /health`** — liveness. Always `200 {"status":"ok"}`. It does **not**
  touch Postgres or Redis, so it never flaps during a dependency outage.
- **`GET /health/ready`** — readiness. Checks Postgres (`SELECT 1`) and, when
  `REDIS_URL` is configured, Redis (`PING`). Returns `200` when ready, `503`
  when a dependency is down. The body carries no error details (public probe);
  failures are logged by `ReadinessService`.

Wire the orchestrator/LB health check to `/health` (liveness) and route traffic
only when `/health/ready` is `200`. Example:

```sh
curl -fsS http://localhost:3001/health
curl -fsS http://localhost:3001/health/ready
# {"status":"ok","checks":{"database":{"status":"up"},"redis":{"status":"up"}}}
```

When Redis is not configured (local runs without the queue backend), the Redis
check reports `{"status":"skipped"}` and does not fail readiness.

## Scheduled jobs

All run in-process on the API via BullMQ `upsertJobScheduler`. If Redis is down,
these stop; synchronous API traffic continues but readiness fails.

| Queue | Schedule | Job |
|---|---|---|
| `retention-lifecycle` | daily 05:00 | send keep-alive notices (6 months after completion), their one reminder at day 23, and anonymize past the 30-day grace |
| `compliance-expiry` | daily 06:00 | flag supplier credentials expiring within 30 days (also pauses auto-dispatch) |
| `payment-reminders` | daily 07:00 | email balance reminders 7, 3 and 1 days before a BALANCE instalment is due (`POST /payments/reminders/scan`) |
| `payment-window-reminders` | every 15 min | email 24 h and 2 h before a deposit or full payment window closes (`POST /payments/reminders/window-scan`) |
| `traveler-notifications` | daily 08:00 | trip review request a day after completion (one reminder after 5 days) and the reconfirmation 7 days before departure (`POST /notifications/scan`) |
| `analytics-digest` | Monday 07:00 | email the weekly XLSX + PDF BI digest to `ANALYTICS_DIGEST_EMAIL`/`OPS_NOTIFY_EMAIL` |
| `fx-rates` | daily 16:30 Europe/Madrid | store the day's display-currency reference rates from `FX_RATE_PROVIDER` (see Display currencies) |
| `dispatch` | on dispatch | delayed job that fires the offer timeout (2h standard / 30min under 48h) |

Inspect/drain from the Redis CLI:

```sh
docker exec -it ota-redis redis-cli --scan --pattern 'bull:*:repeat*'
docker exec -it ota-redis redis-cli llen bull:retention-lifecycle:wait
```

## Incident playbooks

### `/health/ready` is 503

1. Read the `checks` object to see which dependency failed.
2. **database down** — check Postgres: `docker compose ps postgres` (or the
   managed instance). Restore connectivity; the API reconnects on the next
   query. If the DB is genuinely down, the API serves no useful traffic; fail
   over / restore from backup (below).
3. **redis down** — check `docker compose ps redis`. The API still serves reads
   and synchronous writes, but queued work (dispatch timeouts, compliance scan,
   retention, BI digest) is paused. Restart Redis; BullMQ resumes the schedules.
   Do **not** delete the `bull:*` keys to "fix" a backlog.
4. Re-run `curl -fsS .../health/ready` until `200`.

### Dispatch offers are not timing out

The `dispatch` queue drives timeouts. Confirm Redis is up and the delayed job
exists:

```sh
docker exec -it ota-redis redis-cli zcard bull:dispatch:delayed
```

If Redis was restarted and jobs were lost, the operations desk can re-dispatch
from the reservation workbench (one-click re-dispatch on `/escalation`).

### Email not arriving

- Dev: open Mailpit at http://localhost:8025. Magic links and the retention /
  message fallbacks all land there.
- The mailer falls back to `ConsoleMailer` (logs the message) when `SMTP_HOST`
  or `MAIL_FROM` is unset (`packages/email` `createMailer`). In production both
  must be set.
- Retention notices and the weekly digest depend on `send()` succeeding; a
  failed retention send is logged and retried on the next daily scan.

### Credential/media uploads fail

Object storage is behind `packages/storage`: MinIO/S3 when `S3_ENDPOINT` +
credentials are set, otherwise an in-memory fallback (dev only, lost on
restart). For a persistent environment, verify the S3 endpoint and bucket.

### GDPR retention actions

- Ops view: back-office `/retention`, or `GET /retention/pending` (ops role).
- Force a scan: `POST /retention/scan` (ops role).
- The keep-alive link is a stateless HMAC token signed with `AUTH_SECRET`,
  valid until the notice + 30 days. After anonymization it returns `409`.
- Anonymization is irreversible. If a traveler disputes it, there is no PII to
  restore; the reservation and fiscal rows remain.

## Payments

- **Primary rail: wire transfer** (spec §7.1, ADR 0005). The storefront's
  "Proceed to payment" creates a `wire_<uuid>` receipt, moves the booking
  `SECURED_AND_INVOICED -> PENDING_PAYMENT`, and sends the traveler to
  `/checkout/wire/<ref>`. The page reads the agency's bank details from the
  tenant manifest and the authoritative amount/booking reference from the
  public, PII-free `GET /payments/intents/:ref` (an unguessable capability URL;
  unknown refs are 404). The URL carries only `wire_<uuid>`.
- The bank details come from `tenant/agency.config.json` `payments.bankTransfer`
  (account name, bank, IBAN, BIC, reference wording). A fork edits that block; if
  it is missing the wire page shows a "not available" message. Never put account
  numbers in `.env` or core code.
- **Confirmation is manual.** When funds arrive, an operations user marks the
  receipt paid (workbench "Mark paid", or
  `POST /reservations/:id/payments/:paymentId/confirm`), which moves the booking
  to `CONFIRMED` and issues the documents. There is no public callback for this
  rail.
- The card rail still runs on the mock: TropiPay is deferred until the agency's
  legal documents exist and a business account can be created (ADR 0005). The
  rail -> provider map is `createPaymentProviders` in `packages/payments`.
- **Switching a rail off** (the bank account is frozen, the card mock must not be
  offered): Settings › Approvals & thresholds › Features, "Bank transfer rail" or
  "Card rail" Off, two Super Admins. New links on that rail are refused with 409
  `FEATURE_OFF`, desk and traveler; a transfer already started keeps its details and
  proof. The other flags there (recruitment portal, builder, map, events strip,
  instant label, AI assistant) work the same way; the manifest's values are only the
  defaults.
- **The AI assistant** ("AI assistant" in the same group) covers "Draft with AI" in
  Messages, the AI summary on Reports and `/assistant/*` (409 `FEATURE_OFF`). With
  `NODE_ENV=production` and `AI_PROVIDER` on the mock (unset or unknown counts as the
  mock), the API holds it off whatever the switch says, and Thresholds notes "Held off
  in production". The hold lifts only once a real provider is wired (A4).

## Display currencies

- Every amount charged, invoiced or refunded is EUR. A display currency (USD, CAD,
  GBP, CHF; `docs/schema-m9-display-currencies.md`) is indicative: browsing prices
  convert and round up, payable amounts show "≈" beside the euros.
- Rates: `exchange_rates`, one reference row per day and currency, written by the
  `fx-rates` job and by the first read of a day that has none (at most one try an
  hour per API process). `FX_RATE_PROVIDER` is `mock` (the board's sample rates)
  unless set to `ecb`. Check what the storefront gets with
  `curl -s localhost:3001/catalog/currencies`; the desk shows the same under
  Settings › Currencies & languages.
- **A stale rate hides the currencies.** When the latest row is more than 5 days
  old, the public read returns no currency and the storefront shows EUR only; the
  desk says "stale". With `ecb`, a failed fetch is logged as
  `Display rates not refreshed` and the older day keeps serving until it goes stale.
- The switches, the spread (default 0.6 %) and the lock point (default the
  deposit) are thresholds: two Super Admins, Settings › Approvals & thresholds ›
  Currencies.
- A booking's rate locks once (`reservation.display_rate_locked` in the audit log)
  and is never changed; a booking paid before display currencies shows EUR only.

## Rate limiting

The API mounts a dependency-free fixed-window limiter as Express middleware
*before* the Better Auth handler, so credential endpoints are protected too.

- `RATE_LIMIT_MAX` (default 600/min per IP) for normal routes; `RATE_LIMIT_AUTH_MAX`
  (default 30/min) for credential endpoints only — `/api/auth/sign-in*`,
  `/api/auth/sign-up*`, `/api/auth/magic-link*`, `/api/auth/callback*`,
  password-reset and verify-email, plus the public Support form (`/contact`), which sends
  an email per request. `/api/auth/get-session` uses the normal limit.
- `RATE_LIMIT_WINDOW_MS` (default 60000) sets the window.
- `/health` and `/health/ready` are never limited (orchestrator probes).
- A throttled client gets `429` with `Retry-After` and `X-RateLimit-*` headers.
- Counters are **in-memory and per process**: a multi-instance deployment must
  use a shared store (e.g. Redis) or each pod limits independently. Single-instance
  deploys are unaffected.
- Behind a reverse proxy set `TRUST_PROXY=1` (hop count) or `TRUST_PROXY=true`,
  otherwise every request keys on the proxy IP and shares one bucket. The same
  address is what Better Auth records for a sign-in (the API writes it into
  `X-OTA-Client-IP` and Better Auth reads only that header), so the new-device
  email's IP and the Super Admin IP allowlist depend on this setting too.

## Analytics events (T-Events)

The storefront sends consented analytics events, and the essential ones (bookings,
payments, errors, the cookie choice), to the public `POST /telemetry/events`, under the
normal rate limit; the desk sends its operational events there too (admitted only for a
live staff session). The API records the booking transitions and the dispatch offers
itself, straight to the sink, never awaited and never failing the change. Events outside
the taxonomy are refused and counted in the response. A signed-in visitor's id is an HMAC
keyed by `AUTH_SECRET`, so rotating that secret also changes every hashed id.

`TELEMETRY_SINK` selects the sink:

- `mock` (the default) keeps the latest 500 events in memory per process and logs one
  `TelemetrySink` line per batch with event names and screens (`server` for the API's
  own) only. With `TELEMETRY_SINK_FILE` set it also appends every event to that file as
  a JSON line; the e2e stack sets it. Leave the file unset in production.
- `plausible` sends the events of visitors who allowed analytics to a self-hosted
  Plausible CE instance with plain `fetch` (one `POST` per event, no SDK, a three-second
  timeout), then logs a warning for a failed or bot-filtered send; it never fails the
  intake or a booking change. Everything else (desk events, the API's own events and the
  essential events of a visitor who refused analytics) stays on the mock, which keeps
  writing to `TELEMETRY_SINK_FILE` when it is set (`docs/plausible-hosting-plan.md` H4).
  Set `TELEMETRY_PLAUSIBLE_ENDPOINT` to the full `/api/event` URL,
  `TELEMETRY_PLAUSIBLE_DOMAIN` to the domain registered in Plausible (or
  `TELEMETRY_PLAUSIBLE_SITE_URL`, from which the domain is derived), and optionally
  `TELEMETRY_PLAUSIBLE_SITE_URL`, `TELEMETRY_PLAUSIBLE_USER_AGENT` (sent only when a
  request carries none) and `TELEMETRY_PLAUSIBLE_TIMEOUT_MS`. A missing or invalid
  setting falls back to the mock with an error log, so analytics can never take the API
  down. Keep the e2e and dev stacks on `mock` (there is no Plausible there): with
  `plausible` the file still receives the server events the e2e reads, but a consenting
  visitor's events go only to Plausible.

The adapter reports synthetic event paths (`/en/<Screen>`, `/admin/<A-Screen>`) because
the taxonomy carries a screen id, not the page path, and maps the taxonomy's `page_view`
to Plausible's built-in `pageview`. It forwards the visitor's IP (as `X-Forwarded-For`)
and User-Agent, which Plausible hashes with a daily salt into its visitor id and does not
store. It does not send the session id, the HMAC user id, or the parameters that point to
one booking or request (`booking_code`, `request_id`, `from_path`; plan H6).

**Going live (plan H1–H3, approved 2026-10-28).** Plausible CE runs on its own small VPS
in an EU region (2 vCPU / 4 GB), from the upstream `plausible/community-edition` compose
repository at a pinned release tag, with its built-in TLS on `analytics.<agency domain>`.
No Plausible image lives in this repository.

1. On the analytics host: set `BASE_URL` and a 64-byte `SECRET_KEY_BASE`, start it, create
   the first account, then turn registration off (`DISABLE_REGISTRATION`; check the pinned
   release's default) and turn on two-factor sign-in for every account. Back up its
   PostgreSQL daily; the ClickHouse event data is best-effort.
2. Add one site whose domain is the storefront's public domain, and set
   `TELEMETRY_PLAUSIBLE_SITE_URL` to match it.
3. Put one edge proxy in front of both the storefront and the API, which sets
   `X-Forwarded-For` to the client's address, and run the API with `TRUST_PROXY=1`. Next's
   `/api/ota/*` rewrite neither adds nor appends the header, so without the edge proxy
   every storefront visitor reaches the API (and its rate limiter) as the Next server's
   address. If the analytics host sits behind a proxy, it must keep the incoming
   `X-Forwarded-For`, not replace it.
4. From the API host, check that Plausible sees the forwarded IP and not the API's:
   `curl -s -X POST https://analytics.<agency domain>/api/event -H 'X-Debug-Request: true'
   -H 'Content-Type: application/json' -H 'User-Agent: Mozilla/5.0'
   -H 'X-Forwarded-For: 203.0.113.7' -d '{"name":"pageview","url":"https://<site>/en/Home","domain":"<site>"}'`
   returns 200 with that IP and records nothing.
5. Set `TELEMETRY_SINK=plausible` and the settings above, restart the API, accept
   analytics on a phone over mobile data, and check Plausible's realtime view (the right
   country) and the API log (no "dropped by bot filtering" warnings).

## Graceful shutdown

On `SIGTERM` or `SIGINT` the API runs Nest's shutdown hooks, then ends with the
signal:

1. Destroy hooks: the BullMQ workers and queues (dispatch, compliance scan,
   reminders, notifications, digest, retention) and the readiness Redis client
   close. A worker waits for its active job.
2. The HTTP server and the Socket.IO gateways stop and drain in-flight requests.
3. Shutdown hooks: the PDF browser and the Prisma connections close.

`SHUTDOWN_TIMEOUT_MS` (default 10000) bounds the whole sequence. A close still
pending after it logs `Shutdown did not finish within … ms; forcing exit` and the
process exits with code 1. Keep the orchestrator's kill grace period above it
(for example a 30 s `terminationGracePeriodSeconds`) so the forced exit, not a
`SIGKILL`, ends a stuck shutdown.

## Data, migrations, backups

- Migrations: `pnpm --filter @ota/db exec prisma migrate dev` (dev),
  `prisma migrate deploy` (staging/prod). Never hand-edit an applied migration.
- Seed: `pnpm --filter @ota/db run seed` (idempotent upserts for demo data).
- Dev database volume: the `postgres` service volume in `docker-compose.yml`.
  Back it up with `docker exec ota-postgres pg_dump -U ota ota_dev > backup.sql`.
  Production backups: "Backups and restore" below.
- `DATABASE_URL` lives in `packages/db/.env` (gitignored). Never commit it.

## Secrets

- `AUTH_SECRET` signs Better Auth sessions **and** retention keep-alive tokens.
  Rotating it invalidates all sessions and any outstanding keep-alive links;
  travelers simply sign in again and can be re-notified.
- `PASSPORT_ENCRYPTION_KEY` (32 bytes, base64) encrypts travelers' passport
  numbers (AES-256-GCM, `@ota/domain/passport-cipher`). Losing it makes every
  stored number unreadable; changing it needs a re-encrypt pass, which is not
  built yet, so treat it as a key to back up, not to rotate. Unset, the API
  answers 503 to any passport write or vault read and keeps the rest working.
  Each vault read is audited as `traveler.passport_viewed`.
- `DATABASE_URL`, `S3_*`, `SMTP_*`, `REDIS_URL` are environment-only. Reference
  the variable name — never paste values into tickets, logs, or docs.
- The API's request log redacts the `cookie` and `authorization` request
  headers and the `set-cookie` response header, so session tokens never reach
  it. Keep that list (`httpLoggerOptions`, `apps/api/src/app.module.ts`) when
  changing the logger.

## Staff access (M9)

- Staff are added from Settings › Users & roles by an invitation; a Super Admin
  invitation (also the way to promote someone) is sent only after a second Super
  Admin confirms it. Invitations link to `BACKOFFICE_PUBLIC_URL`.
- To cut someone off at once, a Super Admin deactivates them (their sessions are
  deleted and the API refuses them) or uses "Sign out everywhere".
- Staff sessions end `STAFF_SESSION_HOURS` (12) after sign-in; sign-in links last
  `MAGIC_LINK_EXPIRES_MINUTES` (10). Both are config: change them by a deploy.
- A staff desk locks after "Idle lock after no input" (a threshold, default 30
  min) unless the person ticked "This is my own device" at sign-in
  (`docs/schema-m9-idle-lock.md`). Unlocking is a passkey sign-in, or signing in
  again by link. The lock holds on the API (401 `SESSION_LOCKED`), on Better Auth's
  routes and on the sockets, which are re-checked every minute. When the change
  first deploys, staff sessions idle for longer than the limit lock once.
- Operating thresholds (dispatch timers, amber, refund limits, retention clock…)
  change in Settings › Approvals & thresholds with two Super Admins; each process
  picks an applied version up within 60 s. A one-person agency changes the
  defaults by a deploy instead (`packages/domain/src/settings/operating.ts` and the
  manifest's payment terms and feature flags). Once any version has applied, the
  flags it holds win over a later edit of the manifest's `features`; change them in
  Settings instead.
- Permission overrides (`docs/schema-m9-permission-overrides.md`): Administrative
  Support asks, with a reason, to act on a row it can only view (bookings, dispatch,
  suppliers, advisories, disruptions, payments, catalog, customers) from the notice
  on that page; every active Super Admin is emailed. Any one Super Admin approves,
  declines or ends it on Settings › Permissions; it ends by itself after "Override
  expiry" (Thresholds › Security, default 24 h, 1–24) and a request no one answers
  lapses after 24 h. An override never approves refunds, advisories or supplier
  applications and never reaches thresholds, staff or the OFAC export. Each change
  made through one is audited as `permission.override_used` (row, route, record
  ids); requests and decisions are `permission.override_*`. A role change,
  deactivation, "Reset passkeys" or a recovery code ends the person's overrides.
- The desk always needs one active Super Admin: the API refuses to demote or
  deactivate the last one. If it is lost anyway, set a user's `role` to
  `SUPER_ADMIN` in the database and audit the change by hand.

## Staff passkeys

- Staff add passkeys at `/passkeys` (the "Passkeys" link under their name). The
  rule "Staff sign in with a passkey" is a threshold (Settings › Approvals &
  thresholds, two Super Admins, off by default); with it on, a staff session that
  did not come from a passkey reaches only the setup page
  (`docs/schema-m9-passkeys.md`). Travelers and suppliers are not affected.
- Before switching it on, check Users & roles: the proposal says how many active
  staff have no passkey yet; they set one up at their next sign-in.
- Lost device: another Super Admin uses "Reset passkeys" on the user's row (a
  reason is required). It deletes the passkeys, signs the user out and emails
  them; they sign in by link and set up a new one. Nobody resets their own.
- Lost mailbox (and no usable passkey): another Super Admin checks who is asking
  (a number they already know, or in person) and uses "Issue recovery code…" on the
  row, with a reason (`docs/schema-m9-recovery-codes.md`). The code shows once; read
  it out. It works once, for 15 minutes; issuing it removes the person's passkeys
  and signs them out. They type it under "Use a recovery code" on the desk login
  with their work email, which only lets them set up a passkey (for 15 minutes),
  then sign in with it. Five wrong codes withdraw it; "Withdraw code" on the row
  does the same. Issue, use, withdrawal and the wrong-try withdrawal are audited
  (`staff.recovery_code_*`, `auth.recovery_code_*`) and the person is emailed.
  A Super Admin who lost both needs a second Super Admin; nobody issues their own.
- New-device email (`docs/schema-m9-new-device-email.md`): a staff sign-in from a
  browser not seen in 180 days emails the person (device, IP, method) and audits
  `auth.new_device_sign_in`; the `ota_device` cookie is what makes a browser known.
  The switch is "Email staff on every new-device sign-in" (Thresholds › Security,
  two Super Admins, on by default); devices are still recorded while it is off.
  Someone who reports a sign-in that was not theirs: "Sign out everywhere" on their
  row, then "Reset passkeys" (which also forgets their devices); check the audit
  log for the IP. Deactivating and issuing a recovery code forget devices too.
- Last Super Admin with no passkey left: set `STAFF_PASSKEYS_OVERRIDE=off` on the
  API and restart. The rule is suspended (the API warns at every start), the
  Super Admin signs in by link and enrolls, then remove the variable and restart.
- Super Admin IP allowlist (`docs/schema-m9-ip-allowlist.md`): "Super Admin
  sign-ins only from the allowlisted IPs" and its list (Thresholds › Security, two
  Super Admins, off by default). With it on, a Super Admin session whose sign-in
  address is outside the list is refused everywhere (403 `IP_NOT_ALLOWED`); the
  desk signs it out and names the address. Other roles are never affected. Before
  switching it on, confirm `TRUST_PROXY` is right: "Your sign-in address" on the
  form must show the real public address, not the proxy's or a private one. An
  IPv6 address is kept as its /64, so IPv6 entries are /64 or wider. The apply is
  refused if the list leaves out the applying Super Admin's own sign-in address.
  Refused sign-ins are audited as `auth.sign_in_outside_allowlist`.
- Every Super Admin locked out by the allowlist (an office address changed, the VPN
  moved): set `SUPER_ADMIN_IP_ALLOWLIST_OVERRIDE=off` on the API and restart. The rule
  is suspended (the API warns at every start); a Super Admin signs in, two of them
  apply a corrected list, then remove the variable and restart.
- `PASSKEY_RP_ID` binds every passkey. Decide it with the deploy topology (the
  desk's origin must be that domain or a subdomain of it, and listed in
  `TRUSTED_ORIGINS`); changing it later means everyone enrolls again.

## Worker app sign-in

`docs/worker-app-plan.md` W1–W6; ADR 0007.

- A worker signs in on the app with their supplier phone number and a six-digit code (10
  minutes, five tries; the fifth wrong one voids it). The number is the supplier profile's
  primary phone, so correct it there first if the worker changed numbers.
- **No SMS arrives** (there is no SMS provider yet, so in production none ever does): an
  Operations Admin or Super Admin checks the worker's ID card, then Suppliers → the worker →
  "Worker app sign-in" → "Issue sign-in code…", and reads the code out. It replaces any open
  code; a "Reenviar" tap on the phone does not replace it.
- `SMS_PROVIDER`: unset logs the message (with the code) in development and sends nothing in
  production; `none` sends nothing anywhere; `console` logs anywhere (never in production: the
  log would hold sign-in codes).
- A phone stays signed in for 30 days; the app's "Salir" ends that phone's session. For a lost
  phone or one that changed hands, an Operations Admin or Super Admin opens Suppliers → the
  worker → "Worker app sign-in" → "Sign out of the worker app…": every phone signed in as the
  worker returns to sign-in at its next connection, and any code not yet used stops working
  (audited as `auth.worker_signed_out`). The worker signs in again with a new code.
- The app's session token works only as the worker app's: a staff session's token sent as a
  bearer token is refused (401).
- Answers given with no signal are kept on the phone and sent when it reconnects; an answer
  that arrives after the offer timed out is refused and the worker is told.

## Worker payouts

`docs/schema-w-earnings.md` (approved E1–E8).

- A payment is recorded after the worker has been paid, never before: Suppliers → the worker →
  Payouts → "Record payout", tick the jobs paid, the method and the day. The API sums the
  jobs' payouts; nothing moves money. It is audited as `supplier.payout_recorded`.
- Print "Receipt (PDF)" from the payments list for the worker to sign; the office keeps the
  signed paper. The receipt is rendered on demand from the payment (the API's Chromium). The
  worker can open the same PDF (unsigned) in the app: Fiabilidad y pagos → Recibos (PDF) →
  "Abrir recibo".
- A payment recorded by mistake cannot be undone from the desk: there is no route for it yet.
- "409 A picked job was paid meanwhile": another desk recorded it; reload the page.
- The method (cash at the office or bank transfer) is set on the same panel; bank details are
  not kept. The pay rule is Settings › Suppliers "Business days before a finished job is
  paid"; the office's place and sessions are `workerPayouts` in the tenant manifest (no
  sessions: no next pay day is shown).

## Hosts, sign-in and crawling

Deployment plan D7(a), D8(a), D18; build items B6–B8.

- `AUTH_ALLOWED_HOSTS` (comma-separated, e.g.
  `veredaexpeditions.com,desk.veredaexpeditions.com`) gives each site its own
  session. Better Auth answers each request on the host the browser used, read
  from `X-Forwarded-Host` (set by the Next rewrites; the API has no public
  port), so a magic link asked for on the desk opens on the desk, and its
  host-only cookie never reaches the storefront. Unset (dev), every link and
  cookie is on `BETTER_AUTH_URL`, and cookies on `localhost` are shared across
  ports.
- With `AUTH_ALLOWED_HOSTS` set, `BETTER_AUTH_URL` is the fallback for a host
  outside the list **and sets the scheme** of every link: in production it must
  be the public `https://` storefront origin, never the internal `http://api:3001`.
  An `https` scheme also gives the cookie its `__Secure-` name and `Secure` flag.
- `TRUSTED_ORIGINS` must list every allowed host with its scheme. Besides Better
  Auth's callback check, it now decides which pages may open the `/ops` and
  `/conversations` sockets: a handshake whose `Origin` is not listed is refused
  (403); one with no `Origin` goes on to the session check.
- `SITE_NOINDEX=1` makes the storefront's `/robots.txt` disallow every crawler
  (read per request, so no rebuild). Keep it on for the trial run, with the
  proxy's `X-Robots-Tag: noindex` header, and remove both at launch.

## Production stack

Deployment plan D3–D20; build items B1–B5, B9–B11, B13 (`deploy/`,
`.github/workflows/release.yml`). Procedures: "Production procedures" below.

- **Images** (`deploy/docker/`): `api` (Node 22 slim, Chromium's headless shell
  from the repo's Playwright 1.63.0; it also runs the migrations), and one
  `web.Dockerfile` for `storefront` and `desk` (`next start`). All run as
  `node` with production dependencies only. Next fixes its rewrites and
  `NEXT_PUBLIC_*` at build, so `API_URL` and the desk's `NEXT_PUBLIC_API_ORIGIN`
  (`https://desk.<domain>`) are build arguments.
- **Settings:** `deploy/.env` (Compose: hosts, image tag, database and Redis
  passwords) and `deploy/api.env` (only the API loads it), from
  `deploy/.env.production.example` and `deploy/api.env.example`. Both are
  gitignored. An optional setting stays commented out: `KEY=` is an empty value,
  not unset. Without the `S3_*` keys uploads live in memory and vanish on
  restart; without `SMTP_HOST` and `MAIL_FROM` mail is only logged.
- **Database roles:** the owner (`POSTGRES_USER`) runs `migrate` only; the API
  connects as `POSTGRES_APP_USER` (default `ota_app`): data, no DDL.
  `deploy/postgres/init/10-runtime-role.sh` creates it on an empty volume; on an
  existing one, `exec postgres /docker-entrypoint-initdb.d/10-runtime-role.sh`.
- **Edge:** only Caddy publishes ports (80, 443). `SITE_GATE=trial` puts basic
  auth (`TRIAL_USER`, `TRIAL_PASSWORD_HASH` from `caddy hash-password`) and
  `X-Robots-Tag: noindex` on all three sites; `SITE_GATE=open` at launch, with
  `SITE_NOINDEX` emptied. The desk's `/socket.io/*` goes to the API through the
  desk's host.
- **Plausible CE:** its own compose project from the upstream repo at v3.2.1,
  plus `deploy/plausible/compose.override.yml` (joins `ota_edge`, memory caps,
  log rotation). Start the platform first: it creates `ota_edge`.

```sh
C='docker compose -f deploy/compose.prod.yml'
$C pull                  # OTA_IMAGE_PREFIX and OTA_VERSION in deploy/.env ("Release images")
$C up -d postgres redis
$C run --rm migrate      # prisma migrate deploy, as the owner
$C up -d
SITE_DOMAIN=<domain> DESK_DOMAIN=desk.<domain> TRIAL_AUTH=<user>:<password> deploy/smoke.sh
```

**Rehearsal on this machine:** add `-f deploy/compose.rehearsal.yml` (project
`ota-rehearsal`, mail into the dev Mailpit) with `SITE_DOMAIN=vereda.localhost`,
`DESK_DOMAIN=desk.localhost`, `ANALYTICS_DOMAIN=analytics.localhost`; Caddy signs
`*.localhost` with its local CA, so `curl -k` and run the smoke test with
`CURL_INSECURE=1 MAILPIT_URL=http://localhost:8025 COMPOSE='docker compose -f
deploy/compose.prod.yml -f deploy/compose.rehearsal.yml'`. The first Super
Admin is made as in production ("First Super Admins" below). Backups go to the
dev MinIO: in `deploy/backup.env`, `BACKUP_REMOTE=offsite:ota-backups` with
`RCLONE_CONFIG_OFFSITE_PROVIDER=Minio` and
`RCLONE_CONFIG_OFFSITE_ENDPOINT=http://host.docker.internal:9000` (the dev
`docker-compose.yml` keys), and mail to Mailpit with `SMTP_HOST=host.docker.internal`,
`SMTP_PORT=1025`.

## Production procedures

`C='docker compose -f deploy/compose.prod.yml'` throughout, run from the
repository checkout on the server. After any of these, run `deploy/smoke.sh`
("Production stack").

### First Super Admins (once, B9)

1. Each founder requests a sign-in link at `https://desk.<domain>/login` and
   follows it once, so their account exists. Use the staff addresses: the
   command refuses an address outside the manifest's `staff.allowedEmailDomains`,
   or one with bookings or a supplier profile.
2. `$C run --rm api node dist/cli/bootstrap-super-admins.js <email> [<email>...]`

It promotes all the named addresses or none, audits each as
`staff.super_admin_bootstrapped` (no actor), and refuses for good once any
Super Admin exists: from then on, staff are invited ("Staff access"). Name both
founders: the two-person approvals need two Super Admins.

### Release images (B3)

Pushing a tag `vX.Y.Z` runs `.github/workflows/release.yml`: the CI checks
(`ci.yml`), then one job per image runs `deploy/build-images.sh` and pushes
`ghcr.io/<owner>/ota/{api,storefront,desk,backup}:vX.Y.Z`. A failed check
pushes nothing. A package starts private on its first push; check each one's
visibility on GitHub after the first release.

- **Once, on GitHub:** the repository variable `DESK_DOMAIN` (Settings →
  Secrets and variables → Actions → Variables) set to `desk.<domain>`; the
  desk image bakes it in, so changing it needs a new tag.
- **Once, on the server:** `docker login ghcr.io -u <github user>` with a
  classic personal access token that has only `read:packages` (the registry
  takes no fine-grained token), and in `deploy/.env`
  `OTA_IMAGE_PREFIX=ghcr.io/<owner, lower case>/ota`.
- Tags are never moved or reused: the server pulls a tag only when it does not
  have it yet.
- **Build on a machine instead** (no CI, or a rehearsal):
  `OTA_IMAGE_PREFIX=… DESK_DOMAIN=… deploy/build-images.sh <tag>` builds all
  four locally (`PUSH=1` pushes them). To rehearse a deploy here, put a local
  `git tag` on the commit, set `OTA_IMAGE_PREFIX` in the rehearsal
  `deploy/.env`, build with `DESK_DOMAIN=desk.localhost`, and run
  `COMPOSE='docker compose -f deploy/compose.prod.yml -f deploy/compose.rehearsal.yml' deploy/deploy.sh <tag>`;
  the images are found locally, so nothing is pulled. Delete the tag after.

### Deploy a release

1. Before tagging: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
   pass (`pnpm e2e` too before a larger release). Tag, push the tag, and wait
   for the Release workflow to pass.
2. On the server: `git fetch --tags && git checkout <tag> && deploy/deploy.sh <tag>`.
   It refuses unless the checkout is at that tag with no local changes, then
   pulls the images (missing one: it stops, nothing changed), takes the
   `pre-deploy` dump (failed: it stops, nothing changed), migrates as the
   owner, starts the stack and waits up to 5 minutes for every health check,
   and only then records `OTA_VERSION=<tag>` in `deploy/.env`. Expect about a
   minute of downtime.
3. `deploy/smoke.sh`, then sign in on both sites and open the desk dashboard.

### Roll back

- **The code is at fault:**
  `git checkout <previous tag> && deploy/deploy.sh --rollback <previous tag>`
  (no dump, no migration). Migrations are forward-only; this repo's add
  columns and tables rather than drop them, so the previous image normally
  runs on the newer schema. Check the release's migrations before relying on
  that.
- **A migration broke data:** restore the release's `pre-deploy` dump
  ("Restore over the live database") with `OTA_VERSION` set back to the
  previous tag first (in `deploy/.env`, the checkout at that tag). Everything
  written since that dump is lost.

### Backups and restore (B11)

What runs: `$C run --rm backup backup` dumps the database (`pg_dump -Fc`) and
tars the generated documents, encrypts both with `age` for `AGE_RECIPIENTS`,
uploads them with `rclone` to `BACKUP_REMOTE/daily/` (the month's first also to
`monthly/`), deletes dailies and pre-deploy dumps older than 30 days and
monthlies older than 186 days (pending counsel, D11), and emails "Backup OK" or
"Backup FAILED" to `BACKUP_MAIL_TO`. Settings: `deploy/backup.env` from
`deploy/backup.env.example`. Not covered: the uploads bucket (turn on the
provider's versioning) and Plausible's database.

- **Keys:** make the pair on a trusted machine
  (`$C run --rm --entrypoint age-keygen backup`). The public key
  (`age1…`) goes in `AGE_RECIPIENTS`; the private key goes to the password
  manager with an offline copy, never onto the server or next to the backups.
  Keep it apart from `PASSPORT_ENCRYPTION_KEY`'s copy too.
- **Schedule** (root's crontab on the server; the host clock is UTC):
  `30 3 * * * cd /srv/ota && docker compose -f deploy/compose.prod.yml run --rm backup backup >>/var/log/ota-backup.log 2>&1`
- **List:** `$C run --rm backup list`.
- **Monthly drill** (the live site keeps running): copy the private key to the
  server for the drill only, then
  ```sh
  $C up -d restore_drill_db
  $C run --rm -v /root/age-key.txt:/run/age/identity:ro backup restore drill   # newest, or name a <stamp>
  $C rm -sf restore_drill_db && shred -u /root/age-key.txt
  ```
  It decrypts both files, restores into the throwaway database, and checks
  that migrations and users came back and that an active Super Admin exists;
  it prints the restored and live row counts side by side.
- **Restore over the live database** (disaster, or a broken migration):
  ```sh
  $C stop api storefront desk
  $C run --rm -e CONFIRM_RESTORE=ota -v /root/age-key.txt:/run/age/identity:ro backup restore live <stamp>
  $C run --rm api node dist/cli/retention-scan.js
  $C up -d && shred -u /root/age-key.txt
  ```
  The restore drops and re-creates the database from the dump, re-creates the
  API's role grants (B4), and unpacks the documents over the volume. The
  retention pass anonymizes again the travelers anonymized since the dump; it
  also sends any notices that are due, as the 05:00 job would. A traveler who
  confirmed a keep-alive link after the dump has lost that confirmation: check
  the API log for `retention/keep-alive` since the dump's time before the pass.

### Rotate a secret

Edit the value in `deploy/.env` or `deploy/api.env` (mode 600), then:

| Secret | Then | Effect |
|---|---|---|
| `AUTH_SECRET` (`api.env`) | `$C up -d api` | Every session ends; keep-alive links and telemetry visitor hashes change |
| `SMTP_*`, `S3_*` (`api.env`) | `$C up -d api` (and `backup.env`'s copy) | None |
| `POSTGRES_APP_PASSWORD` | `$C up -d postgres`, `$C exec postgres /docker-entrypoint-initdb.d/10-runtime-role.sh`, `$C up -d api` | The API reconnects |
| `POSTGRES_PASSWORD` (the owner) | Before editing `.env`: `$C exec postgres psql -U ota -d ota -c '\password ota'` and type the new value | The next `migrate` and `backup` runs use it |
| `REDIS_PASSWORD` | `$C up -d redis api` | Queued jobs are kept |
| `TRIAL_PASSWORD_HASH` | `$C run --rm caddy caddy hash-password`, then `$C up -d caddy` | Single-quote the hash |
| The backup key | New pair; put the new public key in `AGE_RECIPIENTS` | Keep the old private key until its last backup expires (186 days) |
| `PASSPORT_ENCRYPTION_KEY` | **Do not rotate** | No re-encrypt pass exists ("Secrets") |

### Add or remove a staff member

From the desk, Settings › Users & roles ("Staff access"): invite by email (a
Super Admin invite waits for a second Super Admin); deactivate someone who
leaves, which ends their sessions at once. Nothing on the server changes.

### Certificates

Caddy obtains and renews them by itself; there is nothing to renew. It needs
ports 80 and 443 open and the DNS pointing at the server. Expiry notices go to
`ACME_EMAIL`. Never delete the `caddy_data` volume: it holds the certificates,
and re-issuing many at once hits Let's Encrypt's rate limits.

## Verify a deploy

```sh
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm e2e            # needs Docker + the dev stack; cached chromium-1243
curl -fsS http://<host>:3001/health/ready
```

`pnpm e2e` starts `pnpm dev` itself and can leave ports 3000–3002 listening;
kill them before a rebuild, and delete `apps/storefront/.next` and
`apps/backoffice/.next` if a production build ran first.
