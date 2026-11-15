# Worker app distribution: plan for review

**Status:** proposed 2026-11-15; awaiting the owner's decisions U1–U8.
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
