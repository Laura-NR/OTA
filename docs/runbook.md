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
| `retention-lifecycle` | daily 05:00 | send keep-alive notices (6 months after completion) and anonymize past the 30-day grace |
| `compliance-expiry` | daily 06:00 | flag supplier credentials expiring within 30 days (also pauses auto-dispatch) |
| `analytics-digest` | Monday 07:00 | email the weekly XLSX + PDF BI digest to `ANALYTICS_DIGEST_EMAIL`/`OPS_NOTIFY_EMAIL` |
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
  `/checkout/wire/<ref>` with the agency's bank details.
- The bank details come from `tenant/agency.config.json` `payments.bankTransfer`
  (account name, bank, IBAN, BIC, reference wording). A fork edits that block; if
  it is missing the wire page shows a "not available" message. Never put account
  numbers in `.env` or core code.
- **Confirmation is manual.** When funds arrive, an operations user marks the
  receipt paid (workbench "Mark paid", or
  `POST /reservations/:id/payments/:paymentId/confirm`), which moves the booking
  to `CONFIRMED` and issues the documents. There is no public callback for this
  rail.
- The card rail still runs on the mock until TropiPay is wired; the rail ->
  provider map is `createPaymentProviders` in `packages/payments`.

## Data, migrations, backups

- Migrations: `pnpm --filter @ota/db exec prisma migrate dev` (dev),
  `prisma migrate deploy` (staging/prod). Never hand-edit an applied migration.
- Seed: `pnpm --filter @ota/db run seed` (idempotent upserts for demo data).
- Dev database volume: the `postgres` service volume in `docker-compose.yml`.
  Back it up with `docker exec ota-postgres pg_dump -U ota ota_dev > backup.sql`.
  Production backup/restore is provider-specific and not yet automated — treat
  this as an open item.
- `DATABASE_URL` lives in `packages/db/.env` (gitignored). Never commit it.

## Secrets

- `AUTH_SECRET` signs Better Auth sessions **and** retention keep-alive tokens.
  Rotating it invalidates all sessions and any outstanding keep-alive links;
  travelers simply sign in again and can be re-notified.
- `DATABASE_URL`, `S3_*`, `SMTP_*`, `REDIS_URL` are environment-only. Reference
  the variable name — never paste values into tickets, logs, or docs.

## Verify a deploy

```sh
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm e2e            # needs Docker + the dev stack; cached chromium-1243
curl -fsS http://<host>:3001/health/ready
```

`pnpm e2e` starts `pnpm dev` itself and can leave ports 3000–3002 listening;
kill them before a rebuild, and delete `apps/storefront/.next` and
`apps/backoffice/.next` if a production build ran first.
