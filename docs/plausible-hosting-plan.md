# Plausible CE live hosting: plan for review (Q10)

**Status:** **Approved 2026-10-28 as recommended (H1a, H4a, H5, H6a, H7) and built the same
day** (§6). The VPS is the owner's to buy and nothing is deployed. No migration, no new
dependency, and no Plausible image in this repo.
**Date:** 2026-10-28
**Scope:** the last open piece of plan Q10. The adapter, `PlausibleTelemetrySink`
(`apps/api/src/telemetry/plausible-sink.ts`), was built on 2026-10-27 and tested against a
fake (ADR 0006 amendment of 2026-10-27, `docs/runbook.md` "Analytics events (T-Events)"). This
doc covers where Plausible Community Edition runs, which site it records, how the visitor's IP
reaches it, which events it may receive, how long it keeps them, and the words that describe
it. Two of the decisions (H4, H5) mean small code changes to the adapter; §5 lists them.

## 1. What this covers

| Item | Today | Proposed |
|---|---|---|
| Where CE runs | Nowhere; `TELEMETRY_SINK=mock` everywhere | Its own small EU VPS, run by the agency (H1) |
| The site | None registered; the live proof used a local server | One site: the storefront's public domain (H2) |
| The visitor's IP | Lost on the storefront path (finding F1) | The edge proxy sets `X-Forwarded-For`; the API runs `TRUST_PROXY=1` (H3) |
| Which events reach Plausible | All of them, as built | Only events from visitors who allowed analytics (H4) |
| The visitor's User-Agent | One fixed value for every event (finding F2) | The visitor's own, forwarded like the IP (H5) |
| Identifiers in the event properties | `booking_code`, `request_id`, `from_path` are sent | Removed before sending (H6) |
| Retention | CE has no retention setting | Keep indefinitely once identifiers are out; counsel confirms (H6) |
| Analytics words | "on our own systems", with no mention of location | A new version that mentions approximate location (H7) |

## 2. What the code does today (verified 2026-10-28)

**F1 · On the storefront path the API cannot see the visitor's IP.** The storefront sends
events to `/api/ota/telemetry/events`, and a Next rewrite proxies that to the API. On that path
Next (15.5.25, `router-server.js` → `proxy-request.js`) uses http-proxy without `xfwd`, so it
neither adds nor appends `X-Forwarded-For`. It passes along whatever header came in. I checked
this with Next's own compiled http-proxy and the same options: with no header in, none comes
out; with `203.0.113.7` in, `203.0.113.7` comes out; the API's socket peer is always the Next
server. The API forwards Express's `request.ip`
(`apps/api/src/telemetry/telemetry.controller.ts:51`). Without a proxy that sets the header,
plus `TRUST_PROXY`, `request.ip` is the Next server's own address. Every storefront visitor
would then share one IP: Plausible counts them as one visitor, or drops them as server
traffic. **The rate limiter has the same flaw today**: it keys on `request.ip`, so every
storefront request shares one 600/min bucket. H3 fixes both. The desk calls the API directly
(`browserApiUrl`), so only the edge proxy sits in front of it.

**F2 · Every event carries one fixed User-Agent.** The adapter sends `VeredaTelemetry/1.0`.
Plausible's visitor id is `hash(daily_salt + domain + IP + User-Agent)`, and its Browser, OS
and Device reports come from that header. With a fixed value, two travelers behind one hotel
or mobile-carrier IP count as one, and those three reports stay empty.

**F3 · Server events have no visitor.** They carry no IP, so Plausible would see the API
host's address: bot filtering drops them (`x-plausible-dropped: 1`), or they count as one fake
visitor on `/server` and skew bounce rate and visit counts. The booking transitions they
describe are already in the database and the audit log, and `/analytics` reports on them.

**F4 · Some properties can be linked to a person.** `booking_code` (eleven storefront events, plus one desk and one server event),
`request_id` (`proposal_requested`) and `from_path` (`error_page_shown`, which records
`window.location.pathname` and can be `/account/reservations/<id>`) each point to a
reservation, and through it to a traveler. Plausible stores custom properties with no
retention limit.

**Plausible facts relied on** (CE v3.2.1, its README and the Events API docs, read
2026-10-28): it runs with Docker Compose (Plausible, PostgreSQL, ClickHouse). It needs a CPU
with SSE 4.2 or NEON, and at least 2 GB of RAM. It has built-in Let's Encrypt when bound to
ports 80/443. The Events API uses the first valid IP in `X-Forwarded-For` (or
`CF-Connecting-IP` when present). It always answers 202, even for a dropped event. An
`X-Debug-Request: true` request returns 200 with the IP it would use and records nothing.
Custom properties are capped at 30 per event; ours have at most 15. Plausible does not store
raw IPs or User-Agents: the visitor hash uses a daily salt, which is deleted every 24 hours,
and only country, region and city are kept from the IP. CE has no built-in retention period.

## 3. Decisions (options and recommendation)

**H1 · Where CE runs.**
- **(a) Its own small VPS in an EU region, run by the agency.** Plausible's upstream compose
  repo is pinned to a release tag, on a subdomain such as `analytics.<agency domain>`, with
  CE's built-in TLS. It does not depend on the platform's deploy topology, which is still
  open: the API only needs outbound HTTPS to it. Size: 2 vCPU / 4 GB. ClickHouse is the
  memory user, and 2 GB is upstream's floor, not a comfortable size. Cost: a VPS subscription,
  typically a few to roughly €15 a month depending on the provider (check the price first).
  This is spend, so it is yours to approve.
- **(b) On the platform's own host, once the deploy topology is decided.** No extra machine,
  but ClickHouse competes with Postgres and the API for memory, and the plan waits on the
  topology decision.
- **(c) Plausible's managed cloud.** No operations work, but it is a third-party processor,
  the words "on our own systems" become untrue (H7), and it is a monthly subscription. The
  adapter would still work, since the API is the same.
- **Recommendation: (a).** It keeps the cookie words true, can be set up before the platform
  is deployed, and an analytics outage or upgrade never touches the booking stack. The
  provider and region follow whatever counsel says about where the agency's data lives (the
  same question as the platform host).

**H2 · The registered site.** One site whose domain is the storefront's public domain, which is
not chosen yet (the live proof used `vereda.travel` as a placeholder). Set
`TELEMETRY_PLAUSIBLE_SITE_URL=https://<that domain>`; the domain is derived from it. Under H4
(a), desk and server events never reach Plausible, so no second site is needed. On the CE
instance: create the first account, then turn off open registration (`DISABLE_REGISTRATION`;
check the default for the pinned release), and turn on two-factor sign-in for every Plausible
account.

**H3 · Forwarding the client IP. This is a requirement, not a choice.** Whatever the deploy
topology turns out to be, it must:
1. put one edge proxy (Caddy, nginx or a load balancer) in front of both the storefront and
   the API, which sets `X-Forwarded-For` to the client's address, overwriting or appending
   (either works);
2. run the API with `TRUST_PROXY=1`. On the storefront path Express trusts the Next server and
   reads the edge's entry; on the desk path it trusts the edge itself. Both resolve to the
   client, because Next does not add a hop of its own (F1). If a CDN later sits in front of
   only one of the two, the hop counts differ, and that needs a code change (`TRUST_PROXY`
   takes only `true` or a number today);
3. if CE itself sits behind a proxy, configure that proxy to keep the incoming
   `X-Forwarded-For` (Plausible reads the first entry), not replace it with the API's address.

**H4 · Which events reach Plausible.**
- **(a) Only events whose `consent` is `analytics` or `marketing`.** That covers a consenting
  visitor's whole funnel, essential booking events included. Desk events (always `essential`),
  server events, and the essential events of visitors who refused analytics go to the mock
  sink, which logs one line per batch and keeps nothing durable.
- **(b) Every event, as built.** Counsel must then accept that a visitor who refused analytics
  still has their IP processed (hashed, plus location) by the analytics tool. Staff page
  activity also lands there, and the staff analytics question is still open. Server events are
  dropped or skew the stats (F3).
- **(c) Storefront events only, at every consent level.** Desk and server stay off, but the
  refused visitor's IP still goes to Plausible.
- **Recommendation: (a).** It matches the banner's own words ("Analytics is off until you
  allow it"), keeps staff out until counsel rules, and keeps server events out, so F3 cannot
  happen. The booking figures stay complete in the database and in `/analytics`.

**H5 · Forward the visitor's User-Agent (fixes F2).** The intake already has the request
headers, and the Next rewrite passes `User-Agent` through. The adapter would send it, falling
back to the fixed value when it is missing. Plausible hashes it and does not store it. No
alternative is offered: without it, the visitor counts are wrong.

**H6 · Identifiers and retention.**
- **(a) Remove `booking_code`, `request_id` and `from_path` from what Plausible receives; keep
  the data indefinitely.** Funnel steps still count by event name, the mock sink and the
  database keep the identifiers, and what Plausible holds becomes aggregate (no raw IP or
  User-Agent, a salt deleted daily, city-level location). Counsel confirms that no retention
  limit is needed.
- **(b) Send them as built, and set a ClickHouse TTL (for example 25 months)** on CE's event
  tables, as a documented SQL step on the host. This is outside Plausible's supported
  configuration: it must be rechecked after every CE upgrade and can break older
  dashboard ranges.
- **Recommendation: (a).** It is simpler, it is the stronger privacy position, and it needs
  no change on the CE host. If counsel still wants a limit, (b)'s TTL can be added later.

**H7 · The analytics words.** `COOKIES_ANALYTICS` and the privacy notice's cookies paragraph
(`tenant/messages/<locale>.json`) say visits are counted "on our own systems" (true under H1
(a) or (b)). They do not say that an approximate location (country, region, city) is derived
from the connection. Proposal: a new placeholder version, `cookies-analytics@2026-10-28`, that
adds "and an approximate location from your connection; your IP address is not stored". It
goes to counsel with the other legal texts. A new version asks every visitor for consent
again (the e2e consent cookie follows the version automatically, `e2e/consent.ts`).
**Recommendation:** write it now as a placeholder, since all the legal texts are placeholders
until counsel rules.

## 4. Not in this plan

- A Plausible image or compose file in this repo (per the brief). CE's compose lives on the
  analytics host, from the upstream repo at a pinned tag.
- Desk page views and staff analytics (they wait for counsel); worker events (no worker app).
- Backups of CE's data. Recommendation: back up its PostgreSQL (accounts, site settings)
  daily, and treat ClickHouse's event data as best-effort, since nothing in the business
  depends on it. Say so if you want more.

## 5. What lands once approved (no migration, no dependency, no UI)

1. **Routing (H4 a):** the factory builds a sink that sends an event to Plausible only when
   its `consent` is not `essential`, and sends the rest to the mock. A unit test covers each
   surface and consent level.
2. **User-Agent (H5):** the intake passes the request's `User-Agent` through
   `TelemetryRecordOptions` alongside `clientIp`. Tests cover the adapter, and the intake case
   in `telemetry.e2e.test.ts`.
3. **Identifiers (H6 a):** `plausibleProps` drops `booking_code`, `request_id` and
   `from_path`, with a unit test.
4. **Words (H7):** the new placeholder version in the tenant messages (English only, like
   the other legal words), with `tenant/README.md`.
5. **Runbook:** a go-live checklist covering the CE install at a pinned tag, H2's account
   steps, H3's proxy settings and `TRUST_PROXY=1`, an `X-Debug-Request` check from the API host
   (Plausible must report the forwarded IP, not the API's), a test visit over mobile data
   shown in Plausible's Realtime view with the right country, and watching the API log for
   "dropped by bot filtering". Plus ADR 0006 and handoff updates.
6. The e2e stack stays on `mock`. No browser check is needed, because nothing visible changes.

**What you do, outside the repo:** approve H1 (and its cost), pick the provider and region,
register the analytics subdomain once the agency's domain exists, and put H3 into the
deploy-topology decision.

## 6. As built (2026-10-28)

- **Domain:** `mayReachAnalyticsStore` and `LINKABLE_TELEMETRY_PARAMS` in
  `packages/domain/src/telemetry/taxonomy.ts`, with tests in `packages/domain/test/telemetry.test.ts`
  ("analytics store": the consent cases, the desk, the server, and a guard that every listed
  parameter exists in the taxonomy).
- **API:** `apps/api/src/telemetry/consent-routed-sink.ts`; the factory wraps the Plausible
  sink in it, with the mock (and its file) as the first-party side. `TelemetryService.ingest`
  takes `{ clientIp, userAgent }`, the controller fills it, and `plausibleProps` drops the
  linkable parameters. Tests: `apps/api/test/plausible-sink.test.ts` (User-Agent, identifiers,
  routing, the factory end to end), `telemetry.service.test.ts` and the intake case in
  `telemetry.e2e.test.ts`.
- **Words:** `cookies-analytics@2026-10-28` and the privacy notice's cookies paragraph in
  `tenant/messages/en.json`; `e2e/consent.ts` picks the version up from there.
- **Docs:** `docs/runbook.md` "Going live", `.env.example`, ADR 0006 amendment of 2026-10-28.
- **Not done (owner):** buying the VPS, installing CE, the analytics subdomain, and H3 in the
  deploy topology. Counsel: the words, and that no retention limit is needed.

