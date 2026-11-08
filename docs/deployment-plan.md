# Deployment plan

- **Date:** 2026-10-29
- **Status:** Approved 2026-11-08 (see "Owner's answers" below). The domain and one mailbox are
  bought; nothing else is bought or deployed. §6: B6, B7 and B8 are built (2026-11-08); the
  rest is not.
- **Readers:** the owner, who decides; the agent that builds it afterwards.
- **Related:** `docs/runbook.md` (day-2 operations, the Plausible "Going live" checklist),
  `docs/plausible-hosting-plan.md` (H1–H7), `docs/adr/0003-payments.md` and `0005-payment-rails.md`,
  `docs/adr/0004-data-retention.md`, `docs/pii-at-rest-review.md`, `docs/adr/0007-worker-app-native-android.md`.

How to read this: §1 is the short version. §2 explains what is being deployed, and §3 covers what the
code already decides for you. §4 lists the decisions, each with options, trade-offs and a
recommendation. §5 shows the resulting setup, and §6 lists what has to be built in the repo first.
§7 is the step-by-step, and §8–§13 cover the launch checklist, ongoing care, costs, risks, growth
and the questions for counsel.

Prices and provider facts were checked on 2026-10-29 where a source is given (§14). Everything
else marked *estimate* is a judgement, so check the live price before paying.

**Owner's answers (2026-11-08):**
- D1–D24: approved as recommended.
- §6: every item marked (approval) is approved: B1 (base images), B2 (Caddy, D9), B6 (D7(a),
  per-site sign-in), B9 (Super Admin bootstrap), B11 (`age` and `rclone` on the server).
- Domain (D6): `veredaexpeditions.com`, already registered, **in the owner's name**. That is
  D2(b), the stopgap: the registrant moves to the agency once its legal entity exists, so the
  domain heads the transfer list. With D6(a) this fixes the hosts (`veredaexpeditions.com`,
  `desk.veredaexpeditions.com`, `analytics.veredaexpeditions.com`) and
  `PASSKEY_RP_ID=veredaexpeditions.com`.
- Mail (D13): one receiving mailbox, `info@veredaexpeditions.com`, bought with the domain; more
  addresses as needed. The transactional provider for magic links is still to be opened (Phase
  C). The domain keeps a single SPF record that covers both senders. Once
  `staff.allowedEmailDomains` is set, every staff member needs an address on the domain.
- Phase C waits for the agency's legal entity; the owner says when it exists. The live
  checklist of what remains is `docs/production-readiness.md`.

---

## 1. Summary

**Recommended shape:** one EU virtual server, everything in Docker. A single Caddy edge proxy is
the only thing open to the internet. The API, database, Redis and Plausible sit on private
Docker networks. Backups go off the machine every night to storage at a different provider or
region.

**Is this the next step?** Not yet. A deploy only pays off when the agency can take real
bookings: its legal entity, domain, bank account, counsel-reviewed texts and real catalog. Until
then, the cheapest path is to **build the deployment pieces in the repo** (§6, no spend), and
**rent the server a few weeks before launch** for a private trial run (D1).

**Decisions at a glance** (recommendation in bold):

| # | Decision | Recommendation |
|---|---|---|
| D1 | When to deploy | **Build now, rent the server ~4–6 weeks before launch** |
| D2 | Whose name the accounts are in | **The agency's legal entity; the owner only as a stopgap, with a transfer plan** |
| D3 | Hosting shape | **One VM with Docker Compose** |
| D4 | Provider and region | **An EU-headquartered provider, EU region; test access from Cuba first** |
| D5 | Server size and OS | **4 vCPU / 8 GB / 80–160 GB SSD, Ubuntu 24.04 LTS or Debian 12** |
| D6 | Domain layout, registrar and DNS | **One domain: apex = storefront, `desk.`, `analytics.`; EU registrar** |
| D7 | How sign-in cookies work across sites | **Per-site cookies (Better Auth dynamic base URL); code change** |
| D8 | Is the API public? | **No: only the storefront, the desk and the desk's live socket path** |
| D9 | Edge proxy | **Caddy (automatic HTTPS, simple config), with security headers** |
| D10 | Database | **Postgres in a container, with a least-privilege runtime role** |
| D11 | Backups | **Nightly encrypted dumps off-site, 30-day retention, monthly restore drill; add WAL archiving after launch** |
| D12 | File storage | **Provider S3 storage (EU) for uploads; PDFs on a backed-up volume** |
| D13 | Email | **An EU transactional provider over SMTP, with SPF/DKIM/DMARC** |
| D14 | Secrets | **Root-only env files on the server, master copy in a password manager** |
| D15 | Build and deploy | **CI builds images, pushes to a private registry, the server pulls** |
| D16 | Staging | **The pre-launch server is the staging; after launch, staging stays local** |
| D17 | Monitoring | **External uptime check, log rotation, backup-result emails, provider alerts** |
| D18 | Desk protection | **Passkeys required for staff from day one; basic auth only during the trial** |
| D19 | Time zone for scheduled jobs | **`TZ=America/Havana` on the API** |
| D20 | Plausible placement | **Same server (switch H1 from (a) to (b))** |
| D21 | CDN / DDoS protection | **None at launch** |
| D22 | First data | **No demo seed; bootstrap two Super Admins; real catalog entered on the trial server** |
| D23 | Updates | **Pinned image versions, monthly patch window, security patches within a week** |
| D24 | Load test | **A small smoke load test on the trial server (decision gate)** |

---

## 2. What is being deployed

| Component | What it is | Needs to persist |
|---|---|---|
| Storefront | Next.js 15 app (`apps/storefront`), es/en/fr | nothing (build output only) |
| Back-office ("desk") | Next.js 15 app (`apps/backoffice`) | nothing |
| API | NestJS (`apps/api`): REST, Better Auth, Socket.IO (`/ops`, `/conversations`), BullMQ workers, PDF rendering with headless Chromium | generated PDFs in `DOCUMENTS_DIR` (local disk today) |
| PostgreSQL 16 | all business data, including encrypted passport numbers | **yes, the crown jewels** |
| Redis 7 | BullMQ queues: dispatch timeouts and seven scheduled jobs | yes (delayed jobs; losing them is recoverable, see runbook) |
| Object storage (S3) | supplier credentials, inventory images | **yes** |
| SMTP provider | magic links, notifications, digests | n/a (external) |
| Plausible CE | analytics (consenting visitors only) | its Postgres (accounts, sites); ClickHouse events are best-effort |

**Not part of this deploy:** the worker app (ADR 0007, not built), SMS (no provider), the card
rail (TropiPay deferred; the storefront already shows card payments as "soon"), and a real LLM
(`AI_PROVIDER` stays on the mock).

---

## 3. What the code already decides (findings)

These came from reading the code on 2026-10-29. Each one shapes a decision or a build item.

- **F1 — There are no production images.** `docker-compose.yml` is development infrastructure
  only: the apps run on the host with `pnpm dev`. No Dockerfiles, production compose file, proxy
  config, or deploy workflow exist. → §6 B1–B4.
- **F2 — Sign-in breaks on separate subdomains as configured today.** Better Auth builds every
  magic link on the single `BETTER_AUTH_URL` origin (`better-auth/dist/plugins/magic-link`,
  `new URL(…/magic-link/verify, realBaseURL.origin)`). The session cookie it sets there is
  host-only (no `crossSubDomainCookies` in `packages/auth/src/index.ts`). In dev this works only
  because cookies on `localhost` are shared across ports. On `api.<domain>`, the cookie would
  land on the API host, and neither the storefront nor the desk would see the session. → D7.
- **F3 — The desk's live updates connect to the API directly.** `apps/backoffice/src/lib/socket.ts`
  uses `NEXT_PUBLIC_API_ORIGIN`, which defaults to `<host>:3001`. Next rewrites do not proxy
  WebSockets. The value is baked in when the desk is built, so it must be known at build time.
  → D8.
- **F4 — The real visitor IP needs an edge proxy.** Next's rewrite neither adds nor appends
  `X-Forwarded-For`. Without a proxy that sets it, plus `TRUST_PROXY=1`, every storefront visitor
  shares one rate-limit bucket and is one visitor to Plausible (plan H3). Next's proxy *does* set
  `X-Forwarded-Host` to the incoming host (`next/dist/server/lib/router-utils/proxy-request.js`),
  which D7 relies on.
- **F5 — Generated PDFs live on local disk.** `LocalDocumentStorage` writes under `DOCUMENTS_DIR`
  (`apps/api/src/documents`). They need a persistent volume that is backed up, or a later S3
  adapter. → D12.
- **F6 — The API needs Chromium.** `packages/documents` launches Playwright's Chromium (pinned
  `playwright@^1.63.0`) for vouchers, work orders, invoices and the PDF digest. The API image
  must contain a matching Chromium and its system libraries. → B1.
- **F7 — The API assumes one process.** The rate limiter, the operating-settings cache (60 s)
  and the mock telemetry buffer are per process. The Socket.IO gateways have no Redis adapter.
  Running two API copies needs work first (§12). One instance is fine for launch.
- **F8 — Scheduled jobs use the server's clock zone.** The BullMQ schedulers use cron patterns
  with no `tz` (`apps/api/src/*/bullmq-*.scheduler.ts`). In a container the zone is UTC, so
  "daily 07:00" would be 02:00 or 03:00 in Havana. → D19.
- **F9 — The demo seed is dev data.** `packages/db/prisma/seed.ts` creates `admin@example.test`,
  `founder@example.test` (both Super Admins), a demo traveler, workers and bookings. It must
  never run in production. Production has no first-admin command: the runbook's only route is
  setting a user's `role` in the database. → D22, B9.
- **F10 — The dev read-only role has a fixed password.** `infra/docker/postgres/init/00-roles.sql`
  creates `ota_ro` / `ota_ro` for tooling. Do not reuse it in production. → D10.
- **F11 — The live sockets accept any origin.** Both gateways use
  `cors: { origin: true, credentials: true }`. With D7 and D8 this becomes same-origin in
  practice, but restricting it to `TRUSTED_ORIGINS` is a cheap hardening step. → B7.
- **F12 — Nothing sets security headers.** There is no helmet, CSP or HSTS. The edge proxy can add
  the simple ones; a real CSP for Next needs nonces and is a separate build. → D9.
- **F13 — Nothing marks the site "do not index".** Only the offline page sets
  `robots: { index: false }`. A trial server on the real domain would be indexed unless the proxy
  or the apps say otherwise. → D18, B8.
- **F14 — Passkeys are bound to `PASSKEY_RP_ID` forever.** Changing it later means every staff
  member enrols again. → D6.
- **F15 — Health probes exist.** `/health` (liveness) and `/health/ready` (Postgres plus Redis);
  graceful shutdown is bounded by `SHUTDOWN_TIMEOUT_MS` (10 s). → the compose healthchecks and a
  `stop_grace_period` above 10 s.

---

## 4. Decisions

Each decision has options, pros and cons, a recommendation, and what it blocks.

### D1 — When to deploy

| Option | Pros | Cons |
|---|---|---|
| **(a) Build the deploy pieces now; rent the server ~4–6 weeks before launch** | No monthly cost while there is nothing to serve; the trial run is long enough to enter real data and test with staff; the repo work can be finished and tested locally now | Needs a date (or at least a trigger: "legal entity exists + counsel has the texts") |
| (b) Rent and deploy now, privately | Finds hosting problems early; the owner can show the real thing to partners | Monthly cost with no revenue; placeholder data on a real domain; patching and backups from day one for an empty site |
| (c) Wait until everything else is ready | Zero cost until then | Infrastructure surprises land in launch week |

**Recommendation: (a).** Treat "agency legal entity exists" as the trigger to rent the server.
Most accounts below (domain, email provider, DPAs) want it anyway.

### D2 — Whose name the accounts are in

The VPS, the domain, the email provider, the storage, the registry and the password manager all
need an account holder and a payer.

| Option | Pros | Cons |
|---|---|---|
| **(a) The agency's legal entity** | Contracts, invoices, VAT and data-processing agreements (DPAs) are in the right name; clean if the owner ever hands over; GDPR controller = the agency | Needs the entity first (the same blocker as TropiPay) |
| (b) The owner personally, transferred later | Can start now | Domain and provider transfers are tedious and sometimes not possible (some providers cannot change the account holder); DPAs in the wrong name; personal liability |
| (c) A developer's or agency partner's account | None worth having | Lock-in to one person; access risk |

**Recommendation: (a)**, with (b) only for the trial run and a written list of what to transfer.
Turn on two-factor sign-in for every account, and give a second trusted person recovery access
in the password manager (D14).

**Sanctions check, applies to every provider below.** The agency sells tourism to Cuba.
US-headquartered companies (AWS, Google Cloud, Microsoft Azure, DigitalOcean, Cloudflare,
Vercel, Twilio and others) are bound by US sanctions on Cuba. Their terms can let them refuse or
stop such a customer. Several non-US providers also refuse customers *based in* Cuba
(Servers.com, ResellerClub, Hostinger reportedly left Cuba; §14). For each provider, check: (1)
whether they accept the agency's country of registration; (2) whether their acceptable-use terms
allow Cuba-related travel business; (3) whether Cuban IP addresses can reach the service (D4).
This is part of the open "OFAC categories" question for counsel (§13).

### D3 — Hosting shape

| Option | Pros | Cons |
|---|---|---|
| **(a) One VM, Docker Compose** | Cheapest; one place to look; matches how the dev stack is built; simple to reason about; easy to move later | One machine = one point of failure; containers are not a strong security wall (a host break-in reaches everything, including the passport-encryption key on disk); manual scaling |
| (b) Two or three VMs (platform / database / analytics) | A compromise or overload of one does not take the others; the database can be sized alone | 2–3× the servers to patch and pay for; private networking to set up; more moving parts for a small team |
| (c) Managed platform (PaaS: e.g. Scalingo, Clever Cloud — both French) | No server patching; managed Postgres with point-in-time restore; easier scaling | Higher monthly cost; Chromium and long-lived sockets need checking on each platform; less control; another processor to vet for Cuba |
| (d) Kubernetes | Standard for large teams | Far too much operations work for this size; no benefit now |

**Recommendation: (a).** Keep the layout so that (b) is a later move with no code change (§12).

### D4 — Provider and region

EU-headquartered options with EU regions (check each for D2's three questions):

| Provider | Pros | Cons |
|---|---|---|
| Hetzner (Germany; DE/FI regions) | Long track record, simple, hourly billing, S3 object storage, firewall, snapshots | Two price rises in 2026; the cheapest CX/CAX lines are reported unavailable to new orders since ~September 2026, and CPX more than doubled in June (§14); left Russian customers in 2024, so it does act on sanctions |
| OVHcloud (France) | Large, EU-sovereign positioning, S3 storage, many regions | Busier control panel; support quality varies |
| Scaleway (France) | Good developer experience; S3 storage, transactional email (TEM) and a container registry at the same provider | Smaller instances can be pricier |
| netcup (Germany) | Low prices for RAM | Monthly/contract terms rather than hourly; fewer managed extras |
| Infomaniak (Switzerland) | Privacy-focused, Swiss jurisdiction | Switzerland is not in the EU (adequacy decision exists, but check with counsel) |

**Region:** an EU region (Germany, France, Finland). Round-trip time to Cuba from western Europe
is higher than from the US, but fine for web pages (*estimate*: roughly 120–200 ms). A US region
would add sanctions exposure for little gain.

**Recommendation:** pick by the sanctions answers first, price second. Before committing, rent the
smallest hourly instance for an hour. Put a test page on it, and ask someone on an ETECSA
connection in Cuba (mobile data and Wi-Fi) to load it, because staff and suppliers will work from
Cuba. That costs cents and settles the most important unknown.

### D5 — Server size and OS

Rough memory budget (*estimate*):

| Process | Typical | Notes |
|---|---|---|
| Postgres (platform) | 1 GB | more with traffic |
| API + Chromium | 0.7–1.5 GB | Chromium peaks while rendering PDFs |
| Storefront + desk (`next start`) | 0.3–0.6 GB each | |
| Redis | < 0.2 GB | |
| Plausible app + ClickHouse + its Postgres | ~2.5–4 GB | ClickHouse is the heavy one; upstream's floor is 2 GB for Plausible alone |
| Caddy | < 0.1 GB | |
| OS, Docker, headroom | 1 GB | |

| Option | Pros | Cons |
|---|---|---|
| 2 vCPU / 4 GB | Cheapest | Only without Plausible on the box; Next builds cannot run on it |
| **4 vCPU / 8 GB / 80–160 GB SSD** | Fits everything with headroom; building on the server is possible in an emergency | Costs more (*estimate*: roughly €15–40 a month depending on provider, after the 2026 price rises) |
| 8 vCPU / 16 GB | Room for growth and a staging copy | Paying for idle capacity at launch |

**CPU:** x86-64 with SSE 4.2, or ARM64 with NEON (Plausible's ClickHouse requires one of them).
ARM servers are often cheaper. The Playwright Chromium and Postgres images support ARM64, but
confirm every image in B1 has an `arm64` build before choosing ARM. x86-64 is the safer default.

**OS:** Ubuntu 24.04 LTS or Debian 12 (both have long security support and first-class Docker
packages). **Recommendation: 4 vCPU / 8 GB / 80–160 GB, x86-64, Ubuntu 24.04 LTS.** Add a 2 GB
swap file as a safety net.

### D6 — Domain layout, registrar and DNS

**Layout options:**

| Option | Pros | Cons |
|---|---|---|
| **(a) One domain, subdomains: `<domain>` (storefront), `desk.<domain>`, `analytics.<domain>`** | One domain to renew; passkeys can bind to `<domain>` and cover the desk (and later travelers on the storefront); the email sender domain matches the site | The desk's address is guessable (it is protected by sign-in, not by secrecy) |
| (b) Separate domain for the desk (e.g. `<brand>-ops.com`) | Total cookie and reputation separation from the public site | Two domains; passkeys bind to the desk's domain only |
| (c) One host, paths (`<domain>/desk`) | One certificate, one host | The back-office would need a Next `basePath` and every desk link and redirect reworked; desk and storefront share one origin, so one site's flaw is the other's |

**`PASSKEY_RP_ID`:** with (a), set it to `<domain>` (not `desk.<domain>`), so traveler or
supplier passkeys on the storefront stay possible later without everyone enrolling again (F14).

**Registrar:** an EU registrar (e.g. OVHcloud, Gandi, INWX). Avoid registrars that refuse
Cuba-related registrants (check D2). A `.travel` domain costs more each year than `.com` (check
the price). Turn on registrar lock and two-factor sign-in. Register it in the agency's name (D2).

**DNS host:** the registrar's DNS or the VPS provider's DNS, both fine. deSEC (German non-profit,
free) is an option with DNSSEC. Cloudflare DNS is US-based (D2). **Recommendation: the VPS
provider's or registrar's DNS, with DNSSEC if offered.**

**Records you will need:** `A`/`AAAA` for the apex, `desk` and `analytics` pointing at the server
(and `www` redirecting to the apex). For email (D13): `MX` if the domain also receives mail, plus
SPF, DKIM and DMARC records. Add `CAA` to allow only Let's Encrypt.

**Recommendation: (a).**

### D7 — How sign-in cookies work across the storefront and the desk (blocker F2)

Today's code cannot sign anyone in once the storefront and desk are on different hostnames. One
of these must be built before the first deploy. This changes how authentication decides where a
session lives, so it is yours to approve (AGENTS.md Article 2).

| Option | How | Pros | Cons |
|---|---|---|---|
| **(a) A cookie per site (dynamic base URL)** | Better Auth's `baseURL: { allowedHosts: [<domain>, desk.<domain>], protocol: 'https' }`. Each request's host comes from `X-Forwarded-Host`, which Next's rewrite sets (F4), so a link requested on the desk verifies on the desk and its cookie stays on the desk | A staff session is never sent to the public storefront, so a storefront bug cannot act as staff; travelers and staff are fully separate; matches how the browser already reaches the API (same-origin rewrites); allowed hosts are also added to trusted origins automatically | Small code change in `packages/auth` and `apps/api/src/main.ts` plus tests; the desk's live socket must go through the desk's host (D8); one person can't be signed in on both sites with one link (fine) |
| (b) One shared cookie for `<domain>` and all subdomains | `advanced.crossSubDomainCookies: { enabled: true, domain: '<domain>' }` | Smallest change; the socket could keep connecting to an API subdomain | A staff member who visits the storefront sends their staff session to it; a script injected into the storefront could then call the desk's API through the storefront's own `/api/ota` rewrite **as that staff member**. Better Auth's own docs advise the narrowest cookie scope |
| (c) One host with paths (D6c) | Host-only cookies on one host | No auth code change | The `basePath` rework from D6c; desk and storefront share one origin, with the same exposure as (b) |

**Recommendation: (a).** Build item B6. This choice also sets `BETTER_AUTH_URL`'s role. It
becomes the fallback for requests that arrive with no allowed host, and the keep-alive link uses
`API_PUBLIC_URL` (D8).

### D8 — What is public

| Option | Pros | Cons |
|---|---|---|
| **(a) Only Caddy is public. `<domain>` → storefront; `desk.<domain>` → desk, plus `desk.<domain>/socket.io/*` → API; `analytics.<domain>` → Plausible. The API, Postgres and Redis have no public port** | Smallest attack surface; the desk socket carries the desk's own cookie (D7a); CORS stops mattering | The retention keep-alive link (`API_PUBLIC_URL`) must go through a public host: set it to `https://<domain>/api/ota` so the storefront rewrite carries it to the API's public `GET /retention/keep-alive` |
| (b) Also expose `api.<domain>` | Easy debugging; a future mobile worker app could call it directly | Larger surface; with D7a the cookie is not sent there, so it adds little now |

**Recommendation: (a).** When the worker app exists (ADR 0007), add `api.<domain>` then, for
token-authenticated mobile calls only. Settings that follow (B5 writes them into the production
env template):

- `NEXT_PUBLIC_API_ORIGIN=https://desk.<domain>` (desk build time)
- `API_URL=http://api:3001` (both Next apps, internal network)
- `TRUSTED_ORIGINS=https://<domain>,https://desk.<domain>`
- `AUTH_ALLOWED_HOSTS=<domain>,desk.<domain>` (B6)
- `BETTER_AUTH_URL=https://<domain>` (the fallback; it also sets every link's scheme, so never
  the internal `http://api:3001`)
- `SITE_NOINDEX=1` during the trial run only (B8)
- `TRUST_PROXY=1`
- `STOREFRONT_PUBLIC_URL`/`PORTAL_URL=https://<domain>`
- `BACKOFFICE_PUBLIC_URL=https://desk.<domain>`
- `API_PUBLIC_URL=https://<domain>/api/ota`
- `PAYMENT_CHECKOUT_BASE_URL=https://<domain>`

**Hop count check:** a storefront request goes client → Caddy → Next → API. Caddy sets
`X-Forwarded-For` to the client, and Next passes it on without appending. With `TRUST_PROXY=1`,
Express takes that entry. The desk socket goes client → Caddy → API, which gives the same result.
B10 verifies this live.

### D9 — Edge proxy

| Option | Pros | Cons |
|---|---|---|
| **(a) Caddy** | Automatic HTTPS (Let's Encrypt) and renewal; a ~30-line config; replaces any client-sent `X-Forwarded-For` by default (good against spoofing); WebSockets work with no extra config | Fewer tutorials than nginx |
| (b) Traefik | Configured from Docker labels; good dashboards | More concepts; label sprawl; its own learning curve |
| (c) nginx + certbot | Well known, very fast | Certificate renewal is a separate moving part; easy to misconfigure forwarded headers |

**Recommendation: (a)**, as a pinned image. It is a new third-party component in the repo, so
it needs your approval. Headers Caddy should add on all three sites:

- `Strict-Transport-Security: max-age=31536000` (no `preload` until you are sure every subdomain
  is HTTPS forever)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: DENY` (or `frame-ancestors 'none'`)
- a restrictive `Permissions-Policy`

A full Content-Security-Policy is a later build: Next needs per-request nonces for its inline
scripts.

Plausible CE ships with its own built-in HTTPS. Behind Caddy, publish no ports from Plausible,
point Caddy at its port 8000 on the internal network, and set its `BASE_URL` to
`https://analytics.<domain>`. Check the pinned release's `compose.yml`: an override file cannot
remove a port the base file publishes (§14).

### D10 — Database

| Option | Pros | Cons |
|---|---|---|
| **(a) Postgres 16 container on the VM** | Free; same as dev; full control | Backups, upgrades and tuning are yours (D11) |
| (b) Managed Postgres (OVH, Scaleway, Aiven (Finland)…) | Point-in-time restore, automatic patching, a separate machine | *estimate*: €15–60+ a month extra; network latency to the app; another processor |

**Recommendation: (a)**, with these settings:

- No published port.
- A strong generated password.
- **Two roles.** The owner role runs `prisma migrate deploy`. A runtime role used by the API has
  data read and write but no DDL. This limits what an API bug or break-in can do to the schema
  (B4).
- Do not create the dev `ota_ro` role (F10).
- `pg_stat_statements` is optional.

Move to (b) when bookings are steady and an hour of lost data would hurt.

### D11 — Backups

**Decide your loss tolerance first:**
- **RPO:** how much recent data you can afford to lose.
- **RTO:** how long you can be down.

Bookings are confirmed by hand from wire transfers, so a lost day means re-entering a day's
bookings from emails and bank statements.

| Option | RPO | Pros | Cons |
|---|---|---|---|
| **(a) Nightly `pg_dump`, encrypted, off-site** | up to 24 h | Simple, easy to test, small files | A day of loss in the worst case |
| (b) (a) plus continuous WAL archiving (pgBackRest or WAL-G) | minutes | Point-in-time restore | Another tool to learn and monitor; a new third-party component |
| (c) Managed database (D10b) | minutes | The provider does it | Cost; you still need an off-provider copy |

**What gets backed up:**

| Data | How | Where |
|---|---|---|
| Postgres (platform) | nightly `pg_dump -Fc`, encrypted with `age` before it leaves the server | object storage at a **different provider or region** than the VM |
| Generated PDFs (`DOCUMENTS_DIR` volume) | nightly sync, encrypted | same |
| Uploads bucket (S3) | provider versioning plus a weekly copy off-provider | same |
| Plausible's Postgres | nightly dump | same (ClickHouse events are best-effort, per the plan) |
| `tenant/` | already in git | — |
| Secrets (`AUTH_SECRET`, `PASSPORT_ENCRYPTION_KEY`, DB passwords, S3/SMTP keys, the backup decryption key) | password manager, plus one offline copy | **never** next to the database backups |

**Key point:** the passport numbers in a backup are encrypted with `PASSPORT_ENCRYPTION_KEY`. Keep
the key and the backups apart, and make sure the key itself is backed up. Losing it makes every
stored passport number unreadable (runbook "Secrets"). The handoff already lists "the
passport-key backup" as open: this closes it.

**Retention and GDPR:** the retention job anonymises travelers in the live database, but old
backups still hold their data until the backups expire. Keep backups for a fixed time (recommend
30 days of dailies plus 6 monthlies, *pending counsel*) and say so in the privacy notice.
Re-running anonymisation after a restore is part of the restore procedure (B11).

**Restore drills:** monthly, restore the latest dump into a throwaway container and run a
row-count and sign-in check. A backup that was never restored is a hope, not a backup.

**Recommendation: (a)** at launch with restore drills; add (b) once there are real bookings
every day.

### D12 — File storage (uploads and PDFs)

**Uploads** (supplier credentials, inventory images) go through `packages/storage` (S3-compatible).

| Option | Pros | Cons |
|---|---|---|
| **(a) The provider's S3 object storage (EU)** | Durable, separate from the VM's disk, no software to run; versioning available | A few euros a month (*estimate*); one more account |
| (b) MinIO container on the VM (as in dev) | Free; identical to dev | Data sits on the VM's disk (back it up yourself); MinIO changed how it distributes its free edition in 2025, so check the image's maintenance status before relying on it |
| (c) Garage (self-hosted, made in France) | Light, built for small clusters | Another system to learn |

**Generated PDFs** (`DOCUMENTS_DIR`):

| Option | Pros | Cons |
|---|---|---|
| **(a) A Docker volume, included in the nightly backup** | No code change | Tied to this VM; must be in the backup |
| (b) A `DocumentStorage` adapter over `packages/storage` (S3) | PDFs live with the uploads; a second API instance becomes possible | A small build (the interface exists; `LocalDocumentStorage` says so) |

**Recommendation: uploads (a), PDFs (a) now and (b) later.** B12 lists the adapter as optional.

### D13 — Email

The API sends over SMTP (`packages/email`). With `SMTP_HOST`/`MAIL_FROM` unset it only *logs*
messages, so in production both must be set, or nobody can sign in.

| Option | Pros | Cons |
|---|---|---|
| **(a) An EU transactional provider with SMTP (e.g. Brevo, Mailjet, Scaleway TEM — all French)** | GDPR-friendly; free or cheap tiers for low volume; deliverability tools | Check each one's acceptable-use terms for Cuba-related business (D2) |
| (b) Postmark or Amazon SES (US) | Excellent deliverability (Postmark), very cheap (SES) | US-based (D2) |
| (c) Your own mail server | No processor | Deliverability is very hard; not recommended |

**Domain authentication (required for magic links to reach inboxes):**
- SPF and DKIM records from the provider.
- DMARC starting at `p=none` with reports, then `quarantine` after a couple of clean weeks.
- `MAIL_FROM` such as `no-reply@<domain>` (or `notifications@`).

Test magic links to Gmail, Outlook and a Cuban `nauta.cu` address.

**Receiving mail** (`info@`, `reservas@`) is a separate service, a mailbox provider (e.g.
Proton, Infomaniak, OVH, Microsoft 365, Google Workspace; the last two are US-based). It is not
part of the platform. Set `OPS_NOTIFY_EMAIL`/`ANALYTICS_DIGEST_EMAIL` to the agency's real
inbox.

**Recommendation: (a)**, and update the privacy notice's list of processors.

### D14 — Secrets

| Option | Pros | Cons |
|---|---|---|
| **(a) An `.env` file per service on the server, owned by root, mode 600, outside the repo; the master copy in a password manager** | Simple; no extra system | Changing a secret is a manual edit plus a restart |
| (b) Docker Compose secrets (files mounted at `/run/secrets`) | Values not visible in `docker inspect` | The apps read env vars today, so it needs a small entrypoint change |
| (c) SOPS/age-encrypted env files in a private repo | Versioned, reviewable | More tooling |
| (d) A secrets manager (Vault, a cloud KMS) | Strong controls | Overkill now |

**Recommendation: (a)**, moving to (b) later if wanted. Generate everything fresh for production:
- `AUTH_SECRET`: 64 random bytes.
- `PASSPORT_ENCRYPTION_KEY`: 32 random bytes as base64.
- New database, Redis and S3 passwords. Never reuse dev values.

The password manager (e.g. Bitwarden, Proton Pass, 1Password) needs two-factor sign-in and a
second trusted person with emergency access.

### D15 — Build and deploy

| Option | Pros | Cons |
|---|---|---|
| **(a) CI (GitHub Actions) builds images on a tag, pushes to a private registry (GitHub Container Registry), the server pulls and restarts** | The server never builds (no memory spike, no build tools on it); every release is a named, repeatable image; rollback = previous tag | CI config to write (a task of its own, B3); GitHub is US-based (the repo already is) |
| (b) The server pulls git and builds | No registry | Next builds need a lot of memory and slow the live site; the build toolchain lives on production |
| (c) The owner's machine builds and pushes | No CI | Depends on one laptop; harder to repeat |

**Release procedure (to be scripted, B3):**
1. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` pass (and `pnpm e2e` before larger
   releases).
2. Tag `vX.Y.Z` → CI builds `api`, `storefront`, `desk` images. `NEXT_PUBLIC_API_ORIGIN` is passed
   at desk build time.
3. On the server: take a pre-deploy database dump, then
   `docker compose pull`,
   `docker compose run --rm migrate` (`prisma migrate deploy` as the owner role), and
   `docker compose up -d`.
4. Check `/health/ready`, sign in on both sites, open the desk dashboard (live socket).

**Rollback:** start the previous image tag. Migrations are forward-only. If a migration itself
broke something, restore the pre-deploy dump, which is why step 3 takes one. Expect a minute of
downtime per deploy. That is fine at this size, so there is no blue-green setup.

**Recommendation: (a).**

### D16 — Staging

| Option | Pros | Cons |
|---|---|---|
| **(a) Before launch the production server *is* the staging (trial run, D18); after launch, test locally (`pnpm e2e`) and release carefully** | No extra cost; the trial run tests the real thing | After launch, risky changes are tried on production directly (mitigated by the pre-deploy dump and rollback) |
| (b) A second compose project on the same VM | Cheap | Competes for memory with production; a staging bug can affect production on the same host |
| (c) A small separate staging VM | Real isolation | Another server to pay for and patch |

**Recommendation: (a)**; add (c) when there is more than one person changing things or before a
risky migration.

### D17 — Monitoring and logs

**Minimum set (recommended):**
- **External uptime check** of `https://<domain>`, `https://desk.<domain>/login` and readiness. For
  readiness, either expose `/health/ready` through Caddy on a hard-to-guess path, or check a
  storefront page that needs the API. It must run *outside* the VM: a check on the same box goes
  down with it. Options: Uptime Kuma on a tiny second server, or a hosted checker (Better Stack,
  UptimeRobot, others; check where each is based).
- **Log rotation:** Docker's `json-file` logging with `max-size`/`max-file` on every service.
  Without it, logs eventually fill the disk.
- **Backup results:** the backup script emails success or failure every night (failure must be
  loud).
- **Provider alerts:** CPU, disk and memory alerts from the VPS provider's panel.
- **TLS expiry:** Caddy renews certificates automatically; the uptime checker can also warn on
  expiry.

**Later options:**
- error tracking: Sentry (US) or self-hosted GlitchTip. Either is a new dependency, so it needs
  approval.
- metrics dashboards (Prometheus + Grafana): heavy for one server.

### D18 — Protecting the desk

- **Passkeys for staff:** turn on "Staff sign in with a passkey" as soon as every staff member has
  enrolled during the trial (the rule exists; two Super Admins switch it on). **Recommended.**
- **Basic auth on all three sites during the trial run** (Caddy `basic_auth`), plus an
  `X-Robots-Tag: noindex` header, so search engines and strangers see nothing before launch.
  Remove both at launch. **Recommended.**
- **IP allowlist for the desk:** M9 deferred it. Staff in Cuba often have changing addresses, so an
  allowlist would lock them out. **Not recommended now.**
- **`staff.allowedEmailDomains`** in the tenant manifest: set it to the agency's domain once staff
  mail lives there. **Recommended.**

### D19 — Time zone for scheduled jobs (F8)

| Option | Pros | Cons |
|---|---|---|
| **(a) `TZ=America/Havana` on the API container** | "Daily 07:00" means 07:00 in Cuba, where operations and travelers are; Cuba's daylight-saving changes are followed automatically | A job scheduled inside Cuba's daylight-saving change (around midnight–01:00) could run twice or be skipped that night; none is: the daily jobs run 05:00–08:00 and the 15-minute payment-window job uses a fixed interval, not a clock time |
| (b) Leave UTC | Simplest; no daylight-saving effects | Reminders arrive at 02:00–03:00 Cuban time |
| (c) Pass `tz` in code per scheduler | Explicit in code | A code change for what an env var does |

**Recommendation: (a).** Keep the database and logs in UTC (they already store timestamps in UTC).

### D20 — Plausible placement (revisits H1)

You approved H1 (a), its own small VPS, on 2026-10-28. With one VM for everything, (b) becomes
attractive.

| Option | Pros | Cons |
|---|---|---|
| (a) Own VPS (as approved) | ClickHouse cannot starve the booking site; can go up independently | A second server to pay for, patch and back up |
| **(b) Same VM, separate compose project and network, its own Postgres** | One server; the API reaches it on the internal network (nothing public except the dashboard) | Needs the 8 GB size (D5) and memory limits on ClickHouse |

**Recommendation: (b)**, with Docker memory limits (*estimate*: ClickHouse 2 GB, Plausible
1 GB). No code change: only `TELEMETRY_PLAUSIBLE_ENDPOINT` points at the internal address. If you
agree, the plausible plan's H1 is updated to (b).

### D21 — CDN and DDoS protection

| Option | Pros | Cons |
|---|---|---|
| **(a) None at launch** | Nothing to configure; no extra processor | A large attack could take the site down; no edge caching |
| (b) Bunny.net (Slovenia, EU) CDN for static assets | EU-based; cheap; faster images far from the server | Configuration; another processor |
| (c) Cloudflare | Strong DDoS protection; free tier | US-based (D2); it would sit in front of everything; Plausible would then see Cloudflare's address unless `CF-Connecting-IP` is handled |

**Recommendation: (a)**; revisit if traffic or attacks justify it.

### D22 — First data in production

- **Never run the demo seed** (F9). Run only `prisma migrate deploy`.
- **First Super Admins.** Both founders request a sign-in link on the desk, then a one-off,
  audited bootstrap command promotes them to `SUPER_ADMIN` (B9). Two are needed for the
  two-person approvals (Super Admin invitations, thresholds). Everyone else is invited from
  Settings › Users & roles.
- **Real data.** On the trial server, enter or import the real catalog (the bulk import exists),
  suppliers, packages, the tenant manifest values (MINTUR licence, bank details, emergency
  contacts, staff email domain) and the counsel-reviewed texts. All of this replaces the
  placeholders listed in `tenant/README.md`.
- **Before launch, wipe trial bookings.** Delete test travelers and bookings made during the trial,
  so analytics and fiscal exports start clean. It is a data change, so it needs your explicit go
  (a scripted, reviewed one-off).

### D23 — Updates and patching

- Pin every image to an exact version (or digest): Postgres 16.x, Redis 7.x, Caddy 2.x, the Node
  22 base, the Playwright image matching `playwright` 1.63.x, and Plausible CE at a release tag.
- **OS:** turn on unattended security upgrades; reboot in the monthly window.
- **Monthly window:** image patch updates, then the restore drill.
- **Security advisories** (Next.js, Better Auth, Node, Postgres): patch within a week, or the same
  day if critical.
- **Major upgrades** (Postgres 17, Next 16, Prisma 7): planned work with an ADR, never in the
  monthly window (AGENTS.md pins TS 6 and Prisma 6).

### D24 — Load test (decision gate)

A small smoke load test on the trial server before launch. It should check that a burst of visitors
on the storefront and a few concurrent PDF renders do not exhaust memory. Run it with a tool such
as k6 or `autocannon` from outside, at a modest rate, *estimate*: 20–50 requests a second for a
few minutes. It is listed as a decision gate in the handoff, so approve the tool and the rate
first. **Recommended: yes, once, on the trial server.**

---

## 5. The recommended setup

```text
                Internet (HTTPS only: 80 → 443 redirect, 443)
                                 │
                    ┌────────────▼────────────┐
                    │   Caddy (edge proxy)    │  TLS, security headers, X-Forwarded-For,
                    │                         │  basic auth during the trial
                    └──┬───────────┬───────┬──┘
           <domain>    │ desk.<d>  │       │ analytics.<domain>
                       │           │       │
            ┌──────────▼─┐  ┌──────▼─────┐ │      ┌─────────────────────────────┐
            │ storefront │  │    desk    │ │      │ Plausible CE (own project)  │
            │ next start │  │ next start │ │      │ app :8000 · ClickHouse ·    │
            └─────┬──────┘  └──┬─────────┘ │      │ its own Postgres            │
   /api/ota/*,    │  /api/*    │  /socket.io/* ──┐ └──────────────▲──────────────┘
   /api/auth/*    │            │           │     │                │ events (internal)
                  └──────┬─────┘           └─────┤                │
                         ▼                       ▼                │
                    ┌───────────────────────────────┐             │
                    │ API (NestJS + Chromium + jobs)│─────────────┘
                    │ TZ=America/Havana, TRUST_PROXY=1
                    └──┬──────────┬──────────┬──────┘
                       │          │          │
                ┌──────▼───┐ ┌────▼────┐ ┌───▼─────────────────┐
                │ Postgres │ │  Redis  │ │ volume: DOCUMENTS_DIR│
                └──────────┘ └─────────┘ └──────────────────────┘
                       │ nightly encrypted dumps + PDFs
                       ▼
        Off-site object storage (other provider/region)      Provider S3 bucket (uploads)
        SMTP provider (outbound mail)                         External uptime checker
```

Only Caddy publishes ports. Docker's published ports bypass the host firewall (`ufw`), so the
other containers must publish none. They talk on internal Docker networks.

---

## 6. What has to be built in the repo first

The agent can do all of this before any spend. Items marked **(approval)** need your yes first
(AGENTS.md Article 2).

| # | Item | Notes |
|---|---|---|
| B1 | Production Dockerfiles: `api` (on the Playwright image matching 1.63.x, so Chromium and its libraries are included), `storefront`, `desk` (Node 22 slim, `next start`); multi-stage, non-root user, pnpm deploy pruning | **(approval)** the base images are new third-party components. Next's `output: 'standalone'` would shrink the images, a small config change |
| B2 | `deploy/compose.prod.yml` + `deploy/Caddyfile` + a Plausible compose override, with healthchecks (`/health`, `/health/ready`), `stop_grace_period: 30s` (F15), memory limits, log rotation, internal networks, Redis with `appendonly yes`, a password and `maxmemory-policy noeviction` (BullMQ requires it) | **(approval)** Caddy image (D9) |
| B3 | CI workflow: on a tag, build and push the three images to the registry; a `deploy.sh` for the server (pre-deploy dump → pull → migrate → up → health check) | A CI change is its own task, so it is fine once you ask for it |
| B4 | Database roles: a migration-owner role and a least-privilege runtime role, created by an init script for production (not the dev `ota_ro`) | Production setup, not a schema migration |
| B5 | `deploy/.env.production.example`: every variable from §4 with comments, no values | |
| B6 | **D7(a): Better Auth dynamic base URL** from an env list (e.g. `AUTH_ALLOWED_HOSTS`), `BETTER_AUTH_URL` as the fallback, tests that a desk-host request yields a desk-host magic link and cookie; the runbook updated | **(approval)** changes how authentication decides (D7). *Built 2026-11-08: `AUTH_ALLOWED_HOSTS`, `siteBaseURL` in `packages/auth`; runbook "Hosts, sign-in and crawling".* |
| B7 | Restrict the two Socket.IO gateways' CORS to `TRUSTED_ORIGINS` (F11), plus the authorization tests | Hardening. *Built 2026-11-08: CORS and the handshake's `Origin` (`allowRequest`), since CORS does not cover a WebSocket upgrade.* |
| B8 | A `noindex` switch for the trial (Caddy header, plus a `robots.txt` on the storefront that follows an env flag) | *The storefront half is built 2026-11-08 (`SITE_NOINDEX`, read per request); the Caddy header comes with B2.* |
| B9 | A one-off, audited bootstrap command to promote named emails to Super Admin, refusing to run when any Super Admin exists | **(approval)**: it writes production data when you run it |
| B10 | A deploy smoke script: `/health/ready`, magic-link round trip on both hosts, socket handshake on `desk.<domain>/socket.io`, the forwarded-IP check (runbook "Going live" step 4) | |
| B11 | Backup and restore scripts: `pg_dump` + `age` encryption + upload; a restore-into-a-throwaway-container drill; the "re-run anonymisation after restore" step | **(approval)** `age` and the upload tool (e.g. `rclone`) are new tools on the server |
| B12 | *Optional:* an S3 `DocumentStorage` adapter (D12b) | |
| B13 | Runbook: a "Production" section (deploy, rollback, restore, rotate a secret, add a staff member, renew nothing because Caddy does) | |

*Estimate:* B1–B11 and B13 are about two to three sessions of agent work, verified locally with a
production-like compose stack on your machine before any server exists.

---

## 7. Step by step

### Phase A — Decide (you, now)
1. Answer D1–D24 (or say "as recommended" with exceptions). *Done 2026-11-08: as recommended.*
2. Approve the §6 items marked (approval). *Done 2026-11-08: all approved.*
3. Send counsel the §13 questions, the sanctions one first: it can change the provider choice.

### Phase B — Build and rehearse locally (agent, no spend)
4. Build B1–B13 in the repo.
5. Run the full production compose on the dev machine with fake domains (e.g. `*.localhost`) and
   Caddy's internal certificates. Prove: sign-in on both hosts, the desk socket, PDF generation,
   the scheduled jobs (clock zone), a backup, and a restore drill.
6. Normal verify (lint, typecheck, test, build, e2e) to make sure nothing in dev broke.

### Phase C — Accounts (you; triggered by D1)
7. Password manager with two-factor and an emergency contact.
8. Register the domain (registrar lock, two-factor, agency as registrant). *The domain is
   registered in the owner's name (2026-11-08): turn on the lock and two-factor now, and change
   the registrant to the agency here.*
9. Open the VPS provider account; do the hourly Cuba-access test (D4).
10. Open the S3 storage account(s): one for uploads near the VM, one for backups at a different
    provider or region.
11. Open the email provider account; verify the domain (SPF/DKIM/DMARC).
12. Sign the DPA with each provider (usually a click-through in the account settings) and record
    them for the privacy notice.
13. Create the container registry access token for the server (read-only).

### Phase D — Server (agent with you; spends money)
14. Create the VM (D5) in the chosen EU region with your SSH key only. Turn on the provider firewall:
    22 from your address if you have a fixed one, otherwise rate-limited; 80 and 443 open.
15. Harden the server:
    - a non-root user with `sudo`;
    - SSH: keys only, no root login, no passwords;
    - unattended security upgrades, a 2 GB swap file, time sync on.
16. Install Docker Engine and the compose plugin from Docker's repository.
17. Create `/srv/ota` with the compose files, root-owned env files (mode 600), and the volumes.
18. DNS: point `<domain>`, `desk`, `analytics` (and `www`) at the server; add `CAA`.

### Phase E — First deploy (trial run, private)
19. Start Postgres and Redis.
20. Run the role script and `prisma migrate deploy`. Do **not** seed.
21. Start the API, storefront, desk and Caddy, with basic auth and noindex on. Caddy obtains
    certificates.
22. Run the B10 smoke script. Fix anything red before going on.
23. Bootstrap the two Super Admins (B9). Each enrols a passkey on `/passkeys`.
24. Install Plausible CE (pinned tag) on the same VM per the runbook's "Going live" steps 1–2,
    with its built-in HTTPS turned off behind Caddy (D9/D20). Run steps 4–5, then set
    `TELEMETRY_SINK=plausible`.
25. Turn on nightly backups. Run the first restore drill the same day.
26. Turn on the external uptime check and the provider alerts.

### Phase F — Fill and rehearse (you and staff, 4–6 weeks)
27. Enter the real catalog, suppliers and packages; replace every placeholder in the tenant
    manifest and messages (`tenant/README.md` lists them); put in the counsel-approved texts.
28. Invite the staff; everyone enrols a passkey. Two Super Admins switch on the staff passkey rule.
29. Rehearse complete bookings end to end with test travelers:
    - booking → dispatch → payment link → a real small wire transfer → mark paid → documents;
    - messages, a disruption, and the retention keep-alive link.
30. Run the D24 load test.
31. Test from Cuba: the desk on ETECSA mobile data, magic links to a `nauta.cu` address.

### Phase G — Launch
32. Go through the §8 checklist.
33. With your go, wipe the trial bookings and test travelers (D22).
34. Remove basic auth and noindex; deploy.
35. Watch logs, uptime and email bounce rates closely for the first week.

### Phase H — Run it
36. Follow §9.

---

## 8. Launch checklist (go / no-go)

Legal and business:
- [ ] Agency legal entity exists; accounts are in its name (or a transfer is scheduled).
- [ ] Counsel has approved: terms (M4/M5), privacy notice (with processors and hosting
      location), cookie words (`cookies-analytics@2026-10-28`), sanctions/OFAC position, backup
      retention.
- [ ] MINTUR licence, bank details and emergency contacts are real in the manifest.
- [ ] DPAs signed with hosting, storage, email (and the registry if it stores anything personal).

Platform:
- [ ] Every placeholder in `tenant/README.md` replaced or consciously kept.
- [ ] Two Super Admins with passkeys; the staff passkey rule on.
- [ ] `staff.allowedEmailDomains` set to the agency domain.
- [ ] Sign-in works on both sites from Gmail, Outlook and `nauta.cu`.
- [ ] A real wire-transfer booking has gone end to end, and its PDFs are correct.
- [ ] The desk works from Cuba.
- [ ] Plausible shows a visit with the right country, and no "dropped by bot filtering" warnings.

Operations:
- [ ] Backups run nightly and are off-site; a restore drill passed within the last week.
- [ ] `PASSPORT_ENCRYPTION_KEY` and `AUTH_SECRET` are in the password manager and an offline copy.
- [ ] Uptime checks and alerts reach a phone.
- [ ] The runbook's production section has been read by whoever is on call.
- [ ] Basic auth and noindex removed.

---

## 9. Running it (day 2)

| When | What |
|---|---|
| Daily (automatic) | backups; the backup email; uptime checks |
| Weekly (you, 10 min) | glance at the backup emails, disk space, the desk's retention page, email bounces |
| Monthly (30–60 min) | patch window (images and OS reboot); restore drill; check certificate and domain expiry dates; review who has desk access |
| Quarterly | review costs; check the provider's sanctions terms have not changed; re-test from Cuba |
| Yearly | renew the domain (auto-renew on); review the privacy notice's processors; consider rotating `AUTH_SECRET` (signs everyone out, changes hashed analytics ids, see the runbook) |
| Never rotate casually | `PASSPORT_ENCRYPTION_KEY`: there is no re-encrypt pass yet |

---

## 10. Monthly cost (*estimate*, check live prices)

| Item | Estimate |
|---|---|
| VPS 4 vCPU / 8 GB, EU | €15–40 |
| Uploads S3 storage | €1–6 |
| Off-site backup storage | €1–6 |
| Transactional email (low volume) | €0–25 |
| Domain | €1–8 a month equivalent (`.travel` at the top end) |
| External uptime checker | €0–10 |
| Registry (GitHub, private) | €0 at this size, usually |
| Plausible CE | €0 (self-hosted) |
| **Total** | **roughly €20–100 a month** |

A managed database would add roughly €15–60+ a month, a second VM €15–40.

---

## 11. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| A provider drops the account over Cuba | Medium | Site down, scramble | D2 checks; counsel; backups off-provider so a move is a restore, not a rebuild |
| Cuban networks cannot reach the provider | Low–medium | Staff and suppliers locked out | D4 hourly test before committing |
| Server compromise | Low | Severe (PII) | Only Caddy public; patched; SSH keys; passkeys for staff; passport numbers encrypted; least-privilege DB role |
| Lost encryption key | Low | Passport numbers unreadable | Key in password manager plus offline copy |
| Backup silently failing | Medium | Severe after an incident | Nightly result email; monthly restore drill |
| Magic links in spam | Medium | Nobody can sign in | SPF/DKIM/DMARC; reputable provider; test inboxes |
| Disk full from logs or PDFs | Medium | Site errors | Log rotation; disk alert; PDFs counted in sizing |
| Memory pressure (ClickHouse, Chromium) | Medium | Slow or crashing site | Memory limits; 8 GB; load test |
| One person holds every key | High today | Lock-out | Second person with emergency access (D2, D14) |

---

## 12. Growing later (what changes when one VM is not enough)

In order of likely need:

1. **Move Plausible off the box** (back to H1 a): only `TELEMETRY_PLAUSIBLE_ENDPOINT` changes.
2. **Move Postgres to a managed service** or its own VM: only `DATABASE_URL` changes; restore from
   a dump.
3. **More than one API instance** needs, first:
   - a shared rate-limit store (F7);
   - the Socket.IO Redis adapter (a new dependency);
   - PDFs on S3 (B12);
   - a check that every BullMQ scheduler is safe with several workers (`upsertJobScheduler` is
     idempotent; the workers share the queue).

   The operating-settings cache already converges within 60 s.
4. **A CDN** for images (D21b).

---

## 13. Questions for counsel (and the accountant)

1. **Sanctions:** with the agency's country of registration and its customers' nationalities, may
   it use EU providers that apply US-style Cuba restrictions? Should US-headquartered providers
   (including GitHub for code and images) be avoided? Which OFAC categories matter (already
   open)?
2. **Hosting location:** EU hosting for a Cuba-facing agency; any Cuban data-localisation rules
   for traveler or supplier data?
3. **Backup retention:** is 30 daily + 6 monthly backups acceptable given the anonymisation
   policy (ADR 0004), and how should the privacy notice say it?
4. **Processors:** the list for the privacy notice (hosting, storage, email, analytics on own
   servers), and the DPAs needed.
5. **Fiscal retention of PDFs** (PII Tier 2, already open): how long invoices and vouchers must be
   kept.
6. **Accountant:** in whose name and country the provider invoices should be (VAT).

---

## 14. Sources (checked 2026-10-29)

- Better Auth, cookies and cross-subdomain cookies: https://www.better-auth.com/docs/concepts/cookies
- Better Auth, dynamic base URL: https://better-auth.com/docs/guides/dynamic-base-url.md
- Plausible CE (hosting repo, ports and built-in TLS): https://github.com/plausible/community-edition
  and https://github.com/plausible/hosting; reverse-proxy notes in a fork:
  https://git.bbaovanc.com/configs/plausible/raw/commit/f055f1d0aa5f595cf44822a0653c470913dcc97a/reverse-proxy/README.md
- Hetzner 2026 price changes: https://wz-it.com/en/blog/hetzner-price-increase-june-2026-cpx-ccx-alternatives/,
  https://capitalandcompute.net/md/hetzner-price-increase-2026.md,
  https://docs.hetzner.cloud/whats-new
- Hetzner ending service to Russian customers (2024):
  https://mangohost.net/blog/hetzner-announces-termination-of-services-to-russian-customers-migrate-asap/
- Providers excluding Cuba: https://www.servers.com/docs/account/embargoed-countries/,
  https://www.resellerclub.com/help/article/Permitted-Countries-of-Operation-and-Restricted-Regions-Explained,
  https://www.directoriocubano.info/actualidad/hostinger-sale-de-cuba-y-suspende-sus-servicios-de-alojamiento-web
- Code facts: the files named in §3, read 2026-10-29.
