# Development traps

Things in this repo that behave differently than they look: tests and their fakes, e2e, the
dev servers, Prisma, Expo and the deploy scripts. Each entry is dated, roughly newest
first.

These entries come from the `vereda` branch's handoff, copied as they stood on 2026-11-20 when
the branch was merged into `main`. They are notes, not instructions. If an entry contradicts the
code, the code wins; correct or delete the entry. The short rules every session needs are in
`AGENTS.md` Section C; this file holds the detail.

- **`prisma migrate dev` will not drop data without a terminal (2026-11-20):** in this
  non-interactive shell it stops at "You are about to drop the column … which still contains 1
  non-null values" and exits. For a data-losing migration: write the folder by hand with
  `prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel
  prisma/schema.prisma --script`, apply it with `prisma migrate deploy`, then `prisma generate`
  (deploy does not generate). An additive migration still goes through `migrate dev`.
- **Package changes do not reach a running `pnpm dev` (2026-11-20):** `packages/*` have no
  dev watcher; apps read their `dist`. Build the changed package (`pnpm --filter @ota/<name>
  run build`) before a targeted e2e, or the stack serves the old DTOs and copy. Editing a
  package's `src` during an e2e run is therefore safe; editing `apps/*/src` is not (Traps
  2026-11-18).
- **The storefront's events list caches 60 s (2026-11-20):** `getEvents` fetches with
  `revalidate: 60`, so in a full e2e run an earlier spec's visit to `/en/events` served the list
  from before `events.spec.ts` created its event, and the photo check failed (it passed alone).
  A new e2e assertion on a cached storefront list reloads inside `toPass` for up to 90 s.
- **Vehicle JSON (2026-11-20):** `supplier_profiles.vehicle_details` is read through
  `readVehicleJson` (`apps/api/src/suppliers/vehicle-json.ts`), never `vehicleDetailsSchema`
  directly: since X3a a stored vehicle has no `insuranceUntil`, which the DTO schema requires,
  so a direct `safeParse` reads every saved vehicle as none.
- **A direct service call skips zod defaults (2026-11-20):** live tests call
  `EventsService.putTranslation` / `create` without the HTTP pipe, so a field the schema
  defaults (`mediaAlt: {}`, `hold: null`) arrives `undefined`; `Object.keys(undefined)` threw
  until the test passed them. API tests are not type-checked (Traps 2026-11-16), so nothing
  flags it before the run.
- **Refund fixtures (2026-11-19):** above the dual limit a Super Admin's approval completes a
  refund on its own, so a hand-made REQUESTED refund above € 2,000 with a Super Admin's
  approval is really approved and the card shows no action (the first visual check failed
  that way); e2e signs in as a Super Admin, so its fixture is € 600 (between the limits). A
  `-t` filter on `payment-schedule.integration.test.ts` skips its first test, which creates the
  receipts the later ones use. The fake Prisma in `payment-schedule.e2e.test.ts` answers
  `$queryRaw` (the refund lock) with `[]`.
- **An ended session can leave `pnpm e2e` running (2026-11-18):** the previous session
  started a detached `pnpm e2e` at 09:30 (parent PID 1, log in its own scratchpad) and ended; what looked
  like the owner's dev stack was that run's webServer. Check `ps -eo pid,ppid,cmd | grep
  playwright` before signalling turbo. Its `next dev` also hot-reloads your edits, so a run
  that spans an edit tests mixed code.
- **The header per locale (2026-11-18, fixed):** the DS 07 spec's page lists are English; only
  its "Home and its header" test loads every locale. A new locale or a longer label that
  overruns the header row fails there: add the locale to `COMPACT_HEADER_LOCALES`. The spec
  pins each locale with the `NEXT_LOCALE` cookie, since the default locale's path is
  unprefixed and otherwise follows the browser's en-US. The row is measured at every width
  since 2026-11-18 (night): below sm the header is the wordmark and the menu, the language is
  in the drawer, so a new header item below sm must fit 272 px at 320.
- **A fixed-length focus walk moves with the page (2026-11-18, night):**
  `storefront-keyboard.spec.ts`' `walk(page, key, 45)` covers 45 stops from where it starts;
  removing three header stops let the phone banner walk reach the banner's switch, a covered
  stop it had always ended short of. When a spec's walk fails after an unrelated removal, log
  each stop (the session used a one-off script) before suspecting the change.
- **`prisma format` realigns the whole schema (2026-11-16):** run on `schema.prisma` it
  rewrote ~450 lines of column alignment. Add models by hand, then `prisma validate` and
  `prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel
  prisma/schema.prisma` ("No difference detected" once migrated).
- **API tests are not type-checked (2026-11-16):** `apps/api/tsconfig.json` includes `src`
  only, so a new constructor argument compiles while a skipped live test (`new
  OpsLiteService(prisma)`) breaks at runtime. After changing a service's constructor, grep
  `new <Service>(` in `apps/api/test`.
- **A live test that crashes in `beforeAll` leaves rows (2026-11-16):** an `afterAll` that
  deletes by an id still `''` throws a Prisma UUID error before the rest of the clean-up, and
  the leftover traveler then fails the next retention run. Guard each id in `afterAll`; this
  session removed its own leftovers (four `retention-*` users and two bookings).
- **Every `/ops` `escalation` event re-reads the alert strip (2026-11-16):** `DeskAlerts`
  refreshes on any `escalation`, so a non-alert event goes out under its own name (worker
  messages: `worker-message`).
- **`git stash` breaks `node --watch` (2026-11-15):** stashing a file the dev API watches
  replaces it, and the watcher stops seeing later edits (the API kept serving old code). `touch`
  the file to restart it, or restart the stack.
- **Express `sendFile` refuses dot-directories (2026-11-15):** `send` ignores paths with a
  `.dir` segment by default, so the dev `apps/api/.worker-app` 404ed while the unit test's temp
  dir passed. The worker-app routes pass `dotfiles: 'allow'` after their own checks; the test
  now uses a `.worker-app` folder.
- **Express adds `charset` to `res.set('content-type')` and string bodies (2026-11-15):** the
  multipart manifest uses Node's `setHeader` and a Buffer body.
- **AGP 9 (RN 0.88) has no `applicationVariants`:** per-split version codes go through
  `androidComponents.onVariants` (`app.config.ts`'s `withAbiSplits`). `ExpoConfig.plugins` only
  types names, so an inline plugin wraps the config (`export default withAbiSplits(config)`).
- **expo-updates' certificate path is `path.join(projectRoot, …)`:** `app.config.ts` passes it
  relative to `apps/worker-app`.
- **Playwright projects:** `pnpm e2e --project default a.spec.ts` reads the files as projects;
  use `--project=default`.
- **Expo web export caches the app config (2026-11-15):** after adding a key to
  `app.config.ts`'s `extra`, `pnpm build:web` still embedded the old config; `expo export
  --clear` picked it up. The web export also has no `android` section in
  `Constants.expoConfig`, hence `extra.versionCode` for the preview.
- **"Actualizar" already means refresh on the worker app's home:** a second button with that
  label broke `getByRole` and would confuse a worker; the update card says "Ver la nueva
  versión".
- **`pkill -f` with a pattern that is also in your own command line kills your own shell**
  (2026-11-15): kill by the PIDs `ss -ltnp` prints instead.
- **Steps vs `ACCEPTED` filters (2026-11-15):** the last step sets a service `FULFILLED`.
  Earnings, payouts and the calendar read `JOB_STATUSES` (both); W-Home read `ACCEPTED` only and
  was changed. Any new query of "the worker's jobs" must use `JOB_STATUSES`.
- **Prisma format (2026-11-15):** `prisma format` realigns the whole schema file; edit by hand.
  `prisma migrate dev` is interactive here: write the SQL with `prisma migrate diff
  --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma
  --script` into a new migration folder, then `prisma migrate deploy` and `prisma generate`.
- **Trip page times (2026-11-15):** the account reservation page's `when()` formats with no
  time zone (the server's); a W-Job step line follows it so a row reads in one zone. Whether
  those dates should be Havana time is open (not changed).
- **English times in e2e (2026-11-15):** the storefront's `/en` pages print "06:46 AM"; match
  `\d\d:\d\d( [AP]M)?`, not 24-hour.
- **Two flushes in one test (2026-11-14):** `flushAnswers` is serialized module-wide, so a test
  that starts a background and a foreground flush together cannot know which one sends; assert
  on the two results combined. The lock's test fails when `flushing.then(...)` is removed.
- **Checking the Android bundle (2026-11-14):** `expo export` writes Hermes bytecode
  (`dist/android/…/*.hbc`); its strings are still searchable with `grep -a -F`, which is how
  this session confirmed the task and `ExpoBackgroundTask` are in it and not in `dist/web`.
- **`pnpm peers check` (2026-11-14):** it reports `@expo/router-server` 58.0.21 wanting newer
  `@expo/metro-runtime` and `expo-constants`; that predates background resend (the lockfile at
  `b1ac87c` already has it) and the app builds and runs.
- **The API's typecheck skips the tests (2026-11-14):** `apps/api/tsconfig.json` includes
  `src` only, and Vitest strips types, so a fake Prisma whose shape drifts from the code still
  passes `pnpm typecheck`; it fails only when a test reaches it.
- **`credential_expires_at` is derived now (2026-11-14):** the seed and e2e fixtures still
  write it directly, which works until the next credential approval rewrites it from
  `supplier_credentials`. `worker-app.spec.ts`' `afterEach` resets it to 2027-12-31.
- **`expo-image-picker` on the web (2026-11-14):** both `launchCameraAsync` and
  `launchImageLibraryAsync` open a file input, and the permission calls answer granted. The
  e2e clicks "Elegir de la galería" inside `app.waitForEvent('filechooser')`. The web asset's
  `base64` has no data-URL prefix and keeps the file's type; native returns JPEG.
- **Border tokens (2026-11-14):** the preset's `borderColor` has only `DEFAULT` and `input`;
  `divide-subtle` builds to nothing. Use `divide-y` (the default border) or a palette step.
- **`hidden` loses to a display utility (2026-11-14):** `<div hidden className="flex …">`
  stays visible: Tailwind's `.flex` beats the browser's `[hidden] { display: none }`. Every
  Ops Lite state panel showed at once until the panels switched to `cn(open ? 'flex' :
  'hidden', …)`. Toggle the class, not the attribute, on an element with a display utility.
- **Opening a thread marks it read (2026-11-14):** `useMessageThread` posts
  `/messages/read` as soon as the history loads. An inbox that opens its first thread by
  itself clears that thread's "New" before anyone reads it; Ops Lite opens a thread only on a
  tap or `?thread=`.
- **The global `h1` is the display face (2026-11-14):** `packages/ui/styles.css` sets every
  `h1` to Fraunces 600 with tightened tracking. Ops Lite's header title (the board's Inter 16
  bold) needs `font-sans … tracking-normal` explicitly.
- **CI after the merge (2026-11-14):** with PR #1 merged, a push to `vereda` runs no workflow
  (`ci.yml` runs on `pull_request` and on pushes to `main`). The next CI run needs a new pull
  request from `vereda`, or a merge.
- **Expo native modules in the worker app (2026-11-13):** pin the exact version in
  `expo/bundledNativeModules.json` (the `~` floor, e.g. `expo-sharing` 58.0.20), as the others
  are. `expo-sharing` 58 ships an incoming-share config plugin: do not list it in
  `app.config.ts` plugins unless receiving shares is wanted (it adds intent filters). A module
  with no web support needs a `.web.ts` twin (`open-receipt.web.ts`, like `storage.web.ts`),
  or the preview and the e2e break. `pnpm --filter @ota/worker-app add` also re-split a
  `better-auth` peer variant in `pnpm-lock.yaml` (no new package; the original lock was in
  sync).
- **A `toPass` around a one-shot action and its result (2026-11-13):** if the action lands
  but its result shows after the inner timeout, the retry repeats the action on a page where
  it no longer exists, and the loop can never pass (`e2e/disruptions.spec.ts`, the choice's
  radios vanish once confirmed). Retry only the pre-hydration part (until the submit is
  enabled), then act once and wait for the result.
- **A single-spec e2e leaves Next dev servers behind (2026-11-12):** after
  `pnpm e2e e2e/<one>.spec.ts`, `next dev -p 3000` and `-p 3002` can outlive the run. Deleting
  `apps/*/.next` under them leaves them accepting connections but never answering, and the next
  `pnpm e2e` reuses them (`reuseExistingServer`): all 177 tests then time out (one wasted ~23 h
  run). **`lsof -ti tcp:<port> -sTCP:LISTEN` does not show `next-server` listeners** (it shows
  the API's node); `ss -ltnp | grep -E ':300[0-3]\b'` does, with the pid. Before a full e2e, kill
  every listener on 3000–3003 by the pid `ss` gives (and the `next dev` / `swc-node` parents
  `ps` lists) and confirm `ss` shows none; only then delete `.next`. A full `pnpm e2e` leaves
  the same set behind. **Even without deleting `.next`** (2026-11-13), the desk server left by
  `pnpm e2e --project=ds07-414 e2e/responsive.spec.ts` accepted connections and never answered
  the next single-spec run (a 3-minute `goto` timeout on the magic link): kill and restart
  between single-spec runs too.
- **Pay follows the service's end (2026-11-11; paid since 2026-11-13):** before W-Job nothing
  set `FULFILLED` (W-Job's last step does since 2026-11-15); W-Earnings still uses the service's end date. Since 2026-11-13 only
  the desk's "Record payout" sets `payout_status = SETTLED` (with `payout_id`); a job settled
  any other way has no paid day and "Pagado en" falls back to its end. Analytics'
  `payoutsSettled` now counts recorded payouts.
- **apps/api's typecheck skips its tests (2026-11-13):** `apps/api/tsconfig.json` includes only
  `src`, and vitest (swc) strips types, so a changed constructor (here `SuppliersService` and
  `WorkerService` gained `SupplierPayoutsService`) breaks hand-built services in tests only at
  run time, and `pnpm typecheck` stays green. Grep `new <Service>(` under `apps/api/test` after
  changing a constructor.
- **`prisma format` rewrites the whole schema (2026-11-13):** it realigns columns across
  `schema.prisma` (a ~400-line diff). Edit the schema by hand and run `prisma validate`
  instead.
- **Payout dates are calendar days (2026-11-13):** `supplier_payouts.paid_at` is the day at UTC
  midnight; read it with `toISOString().slice(0, 10)` (`payoutDay`), never `workerToday`, which
  would move it to the day before in Havana.
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
  2026-11-14: a third late-run storefront stall, `storefront-content.spec.ts`'s Travel info
  click (the URL stayed on `/en/packages` for 15 s); it passed alone in 36.8 s.
  2026-11-14 (W-Credentials run): five late-run stalls, all passing alone — `display-currencies`
  GBP deposit again, `storefront-keyboard.spec.ts:89`, `storefront-packages.spec.ts:75`,
  `[ds07-414]` responsive (`ERR_CONNECTION_RESET`) and `worker-app.spec.ts:576` (the desk's
  refresh after Approve took over 15 s). A serial describe (`display-currencies`) leaves its
  later tests unrun after a failure: rerun the whole file, not just the failed line.
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
  `/en` only; Home alone in every locale since 2026-11-18). During long e2e runs the storefront's `next-server` restarts (a
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
  answers that table too. `confirmPrice`'s `packages` lock falls to the departures branch and
  returns nothing, which is fine because the package is re-read with `package.findUnique`; the
  fake's `savedBetween` changes what that second read returns.
- **Proving a lock (2026-11-07):** the FOR SHARE test in `packages.integration.test.ts` fails
  with a Prisma FK error when `FOR SHARE` is removed; the race tests in
  `package-booking.integration.test.ts` insert the change with `afterPlanning` (Booking form)
  or a one-shot `$transaction` wrapper (desk party edit).
