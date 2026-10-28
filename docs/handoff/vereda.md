# Handoff — vereda — updated 2026-10-28 18:30

## Goal
Build the design team's handoff into the platform. The current handoff is `design/vereda-v1.2/`;
`design/vereda-v1.1/` is kept for the record. Plan and phases: `docs/design-v1.1-plan.md`.
Decisions: ADR 0006 (design system; amended through 2026-10-24 for Phase 4, M4–M10, Phase 6, the
Confirmation screen, the Custom builder, the DS 07 widths, Phase 8 item 2 and, on 2026-10-25,
reduce motion, high contrast, the axe audit, Phase 8 item 1, T-Events, its follow-ups and the
server-side T-Events, on 2026-10-26 the staff passkeys and on 2026-10-27 the Plausible CE sink)
and ADR 0007 (worker app). Staff passkeys: `docs/schema-m9-passkeys.md` (approved P1a–P6a, §7 as
built). The analytics sink: ADR 0006's 2026-10-27 amendment and `docs/runbook.md` "Analytics
events (T-Events)".

## State
- **Phases 0, 1, 0b, 2, 3 and 5 are done; M1–M10 are complete with their surfaces; Phase 8 items
  1–4 are done** (item 1 also has its real sink adapter). Commits are local on `vereda`; the
  owner pushes (`git log --oneline origin/vereda..vereda`).
- **This session (2026-10-27/28): the real analytics sink (Plausible CE)**, the owner's pick from
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
  Tests: `apps/api/test/plausible-sink.test.ts` (9) and `telemetry.service.test.ts` (1). No new
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
  deferred items (recovery codes, permission overrides, display currencies, runtime flags, the
  idle lock, IP allowlist, new-device email); passkeys for travelers and suppliers; M10's deferred room holds, event photos and "Keep building the trip"; manual
  keyboard/reading-order checks beyond what axe decides.
- **Placeholders:** M4 terms, card fee 0 %, legal texts, OFAC categories, pricing samples, the
  deposit's refundability and proof retention, the M5 sample terms, the builder rates, the M8
  crisis framework, the backup-power wording, the cookie banner's analytics words and the
  privacy notice's cookies paragraph, the concierge fee and the events copy
  (`content.events`, en/es; the US note waits for counsel); dev seed as before plus two events.

## Verified (2026-10-27/28, Plausible sink, dev stack stopped for the build)
- `pnpm lint` and `pnpm format:check` green.
- `TURBO_FORCE=true pnpm typecheck` **33/33**, 0 cached.
- `TURBO_FORCE=true pnpm test` **978 passed / 28 skipped**, 30/30 tasks, 0 cached (domain 370,
  api 366/27 skipped, schemas 71, email 30, config 36, ui 35, documents 22, auth 6, theming 14,
  payments 8, imports 5, i18n 4, ai 4, reports 4, storage 3/1 skipped). The new
  `plausible-sink.test.ts` is 10 tests; `telemetry.service.test.ts` is 1; `telemetry.e2e.test.ts`
  gained the request-IP pass-through case (10).
- `TURBO_FORCE=true pnpm build` **18/18**, 0 cached; `apps/*/.next` deleted after.
- `pnpm e2e` (`.next` deleted first): **110 passed, 3 failed, 3 skipped** in 1.2 h. The three
  were the known machine/compile timeouts: `[default]` accessibility "customer pages"
  (`waitForLoadState('networkidle')` timed out), `[default]` supplier-resources (the
  "E2E M6 Power Trail" heading, the same as 2026-10-26/27) and `[ds07-768]` responsive customer
  pages with larger text (`page.goto` timeout). Rerun in isolation with the leftovers killed by
  PID and `.next` deleted: the two `[default]` tests **2/2** and `[ds07-768]` **1/1**. Skips: the
  desk at 320/375/414. The final `page_view` mapping landed after this run; it is in the
  `plausible` branch the e2e does not select, and its unit test passes.
- Live (`RUN_DB_INTEGRATION=1`, `REDIS_URL=redis://localhost:6379`) **27/27**, 11 files.
- Live adapter proof: the built `PlausibleTelemetrySink` posted two events to a local HTTP
  server — `https://vereda.travel/en/Package` with `X-Forwarded-For: 203.0.113.7`, and
  `https://vereda.travel/server` with no forwarded IP; the session id and the HMAC user id were
  absent. The `page_view` -> `pageview` mapping is covered by the unit test.
- No browser/screenshot check: this increment has no UI change.

## Assumptions & unknowns
- `PASSPORT_ENCRYPTION_KEY` is set in `apps/api/.env` (dev); back it up. A production key differs.
- **Deploys:** keep the orchestrator's kill grace period above `SHUTDOWN_TIMEOUT_MS`. Env from M9:
  `STAFF_SESSION_HOURS` (12), `MAGIC_LINK_EXPIRES_MINUTES` (10), `BACKOFFICE_PUBLIC_URL`;
  `PASSKEY_RP_ID` binds every passkey, so it belongs to the deploy-topology decision (still
  open): the desk's origin must be that domain or under it, and in `TRUSTED_ORIGINS`.
- **Staff passkeys:** the switch is off in dev (the e2e switches it on and off and deletes its
  versions). A one-Super-Admin agency cannot apply it (dual approval). The passkey emails use
  the tenant's primary language, as the invitation does. Synced passkeys (iCloud/Google) count
  as passkeys; nothing restricts authenticator types (no attestation).
- **Plausible (2026-10-27/28):** the adapter is tested against a fake and a local HTTP server;
  no Plausible CE instance is running. The live hosting decision still needs: where CE runs and
  its retention, the registered site domain, a proxy that forwards the real client IP (or bot
  filtering will silently drop events), whether the API's `server` events go to Plausible or
  stay on the mock/file sink, and counsel's review of the analytics words for this processor.
  `TELEMETRY_PLAUSIBLE_DOMAIN`/`_SITE_URL` must match the registered site.
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
- **For the owner:** the items under Next; the storefront's sample "Cuba right now" banner says
  every stay has backup power; `staff.allowedEmailDomains` should become the agency's domain.

## Traps
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
- **Plausible sink (2026-10-27/28):** `TELEMETRY_SINK=plausible` ignores
  `TELEMETRY_SINK_FILE`, so a stack switched to Plausible fails the e2e's server-event read;
  keep the e2e/owner dev stack on `mock`. The endpoint is the full `/api/event` URL, not the
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
- The M8, M7 and earlier traps still apply (keyed forms after `router.refresh()`; two table rows
  per status-board booking; `/disruptions/alerts` before `/:id`; rebuild a workspace package
  before the dev servers see it; `.next` after a build; `getByLabel` needs `exact`; no
  `prisma format`; append-only affidavits; ICU spaces; `pgrep -f` matches the calling shell;
  filter Mailpit by booking code; to stop `pnpm dev`, signal `@turbo/linux-64/bin/turbo run dev`).
- **AGENTS.md §C lines proposed (owner edit)**, in addition to the earlier ones still pending
  (M7, SIGTERM, document downloads, M8, graceful shutdown, Nest 12, M6, log redaction):
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
  - "2026-10-27: `TELEMETRY_SINK=plausible` selects the Plausible CE sink (plain `fetch`,
    `POST /api/event`; `TELEMETRY_PLAUSIBLE_ENDPOINT`/`_DOMAIN`/`_SITE_URL`/`_USER_AGENT`/
    `_TIMEOUT_MS`); `mock` stays the default and the e2e's file sink. The adapter maps
    `page_view` to Plausible's `pageview`, sends synthetic event paths, the context and params
    as props, and the visitor's `X-Forwarded-For`; it never
    sends the session id or the HMAC user id. Plausible's bot filter drops a backend IP silently,
    so live hosting must forward the client IP or accept that `server` events may drop. A failed
    send is logged, never thrown."

## Next
1. Owner: choose the next batch — the Plausible live hosting decision (where CE runs, the site,
   the IP-forwarding proxy, whether `server` events go there; the adapter is built), another M9
   deferred item (recovery codes, permission overrides, display currencies, runtime flags, the
   idle lock, the IP allowlist or new-device emails; doc first where it changes how auth
   decides), M10's room holds/event photos (migration doc first), or a manual
   keyboard/screen-reader pass on the A-A11y desk rules that axe cannot decide.
2. Owner, still open: the M4/M5/builder placeholders and the crisis framework, counsel's legal
   texts (now including the events copy, the M10 invoice question, the cookie words and the
   basis for desk and server telemetry), OFAC categories, card surcharge, deposit refundability
   and proof retention, the passport-key backup, the backup-power wording, the staff email
   domain, `PASSKEY_RP_ID` with the deploy topology, raster app icons from Vereda, the
   AGENTS.md §C lines above. Then SMS once a provider is chosen.

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
