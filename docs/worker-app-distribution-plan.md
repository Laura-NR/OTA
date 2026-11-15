# Worker app distribution: plan for review

**Status:** proposed 2026-11-15; **approved 2026-11-15, U1–U8 as recommended** (U1a, U2a,
U3a, U4a, U5a, U6a, U7a, U8: all three modules).
**Date:** 2026-11-15
**Scope:** Phase 7, `docs/worker-app-plan.md` §8 item 2: the download page, the in-app update
prompt and self-hosted `expo-updates`. ADR 0007 settles the frame (sideloaded split-ABI APKs,
no EAS, our own signing key, a version endpoint, JS-only changes through `expo-updates` from
our own server) and its 2026-10-14 amendment A3 draws the screens. This plan covers only what
ADR 0007 leaves open. **No migration is recommended** (U2a).

## 1. What exists

| Item | Today |
|---|---|
| The app's version | `app.config.ts` `version: '0.1.0'`; no `versionCode`, no `runtimeVersion`, no update URL |
| A public route for the phone | None in production: D8a exposes only the storefront, the desk (plus its socket) and Plausible; the trial gate puts basic auth on all three. `docs/deployment-plan.md` D8 says to add an API host "for token-authenticated mobile calls only" when the app exists |
| The approval message | Approving a supplier application sends nothing; the worker's sign-in code is read out by the desk (runbook "Worker app sign-in") |
| SMS | `SmsChannel` with a console mock in development and nothing sent in production until a provider exists (ADR 0007) |
| Large files | `packages/storage` reads whole objects into memory (no ranges), so it is a poor fit for a 30–60 MB APK that must resume on Cuban data |
| JS bundle | `expo export` for Android: one 2.2 MB Hermes file, the size of a JS-only update before compression |

## 2. Decisions (options and recommendation)

**U1 — The public host for the phone and the download.**
- **(a) A new Caddy site `app.<domain>`, outside the trial gate.** `/` is the storefront's
  Spanish download page (proxied to `storefront:3000` `/app`), `/files/*` is Caddy's
  `file_server` (ranges, so downloads resume), `/updates/*` and the worker routes
  (`/worker/*`) go to the API; every other API path is refused at the edge. The app's
  `WORKER_API_URL` becomes `https://app.<domain>`. Workers can install and sign in during the
  trial; the page is `noindex` like the trial sites.
- (b) The same site, with basic auth on `/` and `/files/*` only (the password given with the
  link). Stops strangers downloading the APK during the trial; one more thing to type for a
  worker, and phone-to-phone sharing still bypasses it.
- (c) Put everything under the storefront host. The trial gate's basic auth then blocks the
  app's own API calls.
- **Recommend (a):** the APK holds no secret (the API enforces every rule), and (a) is what
  D8 anticipated.

**U2 — Where a release's files and metadata live.**
- **(a) A directory on the server (a bind mount, `deploy/worker-app/`), written by a release
  tool; no database table.** The tool (`pnpm worker-app:release`, run on the APK machine)
  takes the signed APKs and the `expo export` output and writes `releases.json` (version name
  and code per ABI, size, SHA-256, signing-certificate fingerprint, date, the minimum
  supported version, notes) plus the signed update manifests. The owner copies the folder to
  the server. The API reads `releases.json` (`WORKER_APP_DIR`); Caddy serves the files.
- (b) A desk page where a Super Admin uploads the APKs into object storage, with an
  `app_releases` table. A migration, and the API would need ranged reads.
- **Recommend (a):** releases happen on the build machine anyway; no migration.

**U3 — When an update is required.**
- **(a) `releases.json` carries `minVersionCode`.** Below it the prompt is required (A3):
  offers wait behind the prompt, but an active job (a step taken and not finished, or a job
  starting within the next 2 hours) never does — the prompt then waits until the job is
  finished. Above it the prompt is optional ("Más tarde" hides it for 24 h). A pure domain
  rule decides, with unit tests.
- (b) Every new APK is required. Simpler, but forces downloads on workers with little data.
- **Recommend (a).**

**U4 — Installing a new APK from inside the app.**
- **(a) Download inside the app, then hand off to Android's installer.** Two new Expo
  modules (U8) and the `REQUEST_INSTALL_PACKAGES` permission; Android asks the worker once
  to allow installs from this app. The download resumes and shows progress (A3).
- (b) Open the download page in Chrome. No new module or permission (the worker already
  allowed Chrome at the first install); Chrome shows its own progress, and the app's A3
  progress screen is not built.
- **Recommend (a)** because A3 drew it. (b) is the fallback if U8 is declined.

**U5 — JS-only updates (`expo-updates`).**
- **(a) Self-hosted, code-signed, checked by the app on its own schedule.** The private key
  is generated with `expo-updates`' own CLI on the APK machine, never on the server, and is
  backed up beside the APK signing key (two places). The app refuses an unsigned or
  mis-signed update. `checkAutomatically: 'NEVER'`; the app checks at most once a day after a
  sync succeeds, downloads in the background and applies the update at the next cold start
  (never during an active job). The `runtimeVersion` is the app version (policy
  `appVersion`), and the release tool refuses to publish a JS update when native modules
  changed since that version's APK.
- (b) The same without code signing. Anyone who controls the server or the host could run
  code inside every worker's signed-in app.
- (c) Check on every launch (Expo's default). Spends data on each launch on poor networks.
- **Recommend (a).**

**U6 — The approval message.**
- **(a) Approving an application emails the worker the download link (the existing mailer)
  and sends one SMS through `SmsChannel` (one GSM-7 segment, the link; nothing leaves in
  production until a provider exists).** The desk's QR card is a printable page on the desk
  showing `app.<domain>`'s QR. The link never changes, so the QR is an SVG the owner makes
  once with any QR tool and keeps in `tenant/assets/` (a missing file shows the link alone);
  no QR library is added.
- (b) Email only; the SMS waits for the provider.
- **Recommend (a):** the SMS starts working the day a provider is configured.

**U7 — iPhones.** ADR 0007 leaves it open. **(a) The page's "Android only" state (A3) with the
desk phone, and nothing else for now**; (b) a reduced web version of the app. **Recommend
(a)** until the field test measures the share of iPhone workers.

**U8 — New dependencies (Article 2).** Each is an Expo SDK module, inside SDK 58's own range
and at least two weeks old:
- `expo-updates` **58.0.20** (31 Oct; SDK range `~58.0.18`; 58.0.21 is under two weeks old).
  It brings `expo-manifests`, `expo-eas-client` (a local install id only; no EAS service is
  called), `expo-updates-interface`, `expo-structured-headers` and
  `@expo/code-signing-certificates`.
- For U4a: `expo-intent-launcher` **58.0.3** (1 Oct) to hand the file to the installer, and
  `expo-application` **58.1.2** (16 Oct) to read the APK's own version code and ABI so the
  app downloads the matching split.
- **Recommend approving all three.** Declining the last two means U4b.

## 3. Not in this plan

The APK build itself and the field test (the owner's machine, `docs/worker-app-plan.md` §8
item 1); Google's developer verification and Apklis (ADR 0007, need the legal entity);
illustrated install steps beyond what existing tokens and plain screenshots can show (A3's
drawings are a brand export, like the adaptive icon); push.

## 4. What lands once approved

- Domain: the update rule (U3) and the version comparison, with unit tests.
- API: `GET /worker-app/latest` (`@Public`, from `releases.json`; added to the authorization
  matrix as public) and the `expo-updates` manifest route under `/updates`; the approval email
  and SMS.
- Release tool: `tools/worker-app-release.mjs` and its runbook section ("Releasing the worker
  app").
- App: the update prompt (optional, required, progress, no data, install failed), the
  `expo-updates` check, `.web.ts` no-ops for the preview.
- Storefront: the Spanish download page at `/app` (version, size, date, fingerprint, arm64 and
  "older phone" links, the desk phone, the "Android only" state).
- Desk (en/es/fr): the printable QR card.
- Deploy: the `app.<domain>` site in the Caddyfile and `compose.prod.yml`'s bind mount.
- e2e: the download page from a fixture release, the approval email in Mailpit, the update
  prompt in the app's web preview.
- Not verifiable here: the install, the update download and the installer hand-off on a phone
  (the field test's checklist gains them).

## 5. As built (2026-11-15)

Approved U1–U8 as recommended. No migration. Three new dependencies: `expo-updates` 58.0.20,
`expo-intent-launcher` 58.0.3, `expo-application` 58.1.2.

- **Domain** `packages/domain/src/worker/app-release.ts`: split version codes (release × 10 +
  2 for arm64, 1 for 32-bit ARM) and the split a phone downloads; `workerJobActive` (a step
  taken and not finished, or an unfinished job starting within 2 h and not over);
  `workerAppUpdate` (`required`, `after-job`, `optional`, `none`; "Más tarde" hides an optional
  one 24 h); the once-a-day JS check, never during a job; `workerJsUpdateRefusal` (no APK,
  another runtime, a native module changed); the approval SMS (one GSM-7 segment, or none).
- **API** `apps/api/src/worker-app/`, all `@Public`: `GET /worker-app/latest` (the release
  without server file names or native modules, and `downloadUrl` from
  `WORKER_APP_PUBLIC_URL`, default `<storefront>/app`); `GET /worker-app/apk/:file` (only a
  file the release lists, ranges); `GET /worker-app/updates/manifest` (expo-updates protocol 1:
  a `multipart/mixed` manifest part with the release tool's `expo-signature`, 204 when nothing
  is published for the phone's `expo-runtime-version`, 400 unless `expo-platform: android`);
  `GET /worker-app/updates/:runtime/:id/assets/:file` (cached a year; a `.bundle` is typed as
  JavaScript so the edge gzips it). Everything is read from `WORKER_APP_DIR` (default
  `apps/api/.worker-app`, gitignored) on each request; a `releases.json` that does not parse is
  logged and served as no release. Approving an application emails the worker the link
  (`workerAppInviteEmail`, en/es/fr, sent in the tenant's primary locale) and sends the SMS;
  both best-effort. RBAC matrix: the four routes asserted public.
- **Release tool** `pnpm worker-app:release apk|update` (`tools/worker-app-release.mjs`, the
  header lists the flags). `apk` checks each APK with `apksigner` and `aapt2` (package, version
  name, the split's version code, one ABI, one signing certificate, the same certificate as the
  published release) and refuses a version code that does not rise or a native change without
  a new version. `update` refuses with no APK, another runtime or a native change, signs the
  manifest with the private key and checks it against the certificate the APK embeds before
  writing. Output: `deploy/worker-app/` (gitignored) by default.
- **App**: `app.config.ts` sets `version` (also the `runtimeVersion`), `android.versionCode`,
  `REQUEST_INSTALL_PACKAGES`, and `updates` (self-hosted URL, `checkAutomatically: NEVER`,
  launch wait 0, the certificate `tenant/assets/worker-app/certificate.pem`, or
  `WORKER_APP_UPDATES_CERTIFICATE`); without the certificate updates are off. An inline config
  plugin adds the ABI splits and their version codes through `androidComponents` (AGP 9 has no
  `applicationVariants`). The home's "Nueva versión" card, the update screen (size, date,
  notes, progress, no data, incomplete, not installed, the page, the desk), a required update
  in front of every screen including sign-in, the after-job note. `.web.ts` files: the preview
  reads as a universal build, opens the download page and has no JS updates.
- **Storefront** `/app` (en/es/fr, `workerApp` namespace): version, size, date, notes, the
  arm64 download and the 32-bit link through `/api/ota`, the certificate, five install steps,
  four failures, the desk; "Solo para Android" for an iPhone user agent. No drawings: the
  steps are text.
- **Desk** (en/es/fr) `/suppliers/app-card`, linked from Applications: the link, the QR from
  `tenant/assets/worker-app/qr.svg` when present (else how to add it), the version and the
  certificate, a Print button.
- **Deploy**: Caddy `app.{$SITE_DOMAIN}` (no gate, `noindex`): `/` → the storefront's `/app`;
  `/app`, `/en/app`, `/fr/app`, `/_next/*`, `/api/ota/worker-app/*` → storefront; `/worker/*`,
  `/worker-app/*`, the worker-code sign-in and `/service-items/<id>/accept|decline` → API;
  everything else redirects to the main site. The API mounts `deploy/worker-app` read-only at
  `/srv/worker-app`. `WORKER_APP_PUBLIC_URL` in `deploy/api.env.example`; four smoke checks.
- **Not built**: resuming an in-app download after a cut (it restarts; the page's link
  resumes in Chrome), drawn install steps, Google's developer verification, Apklis.
- **Not run on a device**: the split build and its version codes (`expo prebuild` output
  checked, Gradle not run), the installer hand-off, an update's download and its signature
  check by the phone, the 204 "no update" answer.
