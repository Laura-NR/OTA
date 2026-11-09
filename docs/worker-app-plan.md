# Worker app (Phase 7): plan and first slice

- **Date:** 2026-11-09
- **Status:** first slice built (§7). W1, W3 and W7 approved by the owner on 2026-11-09 with
  Expo itself; the rest are build decisions inside ADR 0007.
- **Context:** ADR 0007 (Expo, Android first, sideloaded, no EAS), its 2026-11-08 amendment
  (supplier confirmations wait for this app), `docs/design-v1.1-plan.md` Phase 7, boards
  `design/vereda-v1.2/project/W-*.dc.html`.

## 1. Goal of the first slice

The field test ADR 0007 asks for before the rest of W-*: a worker signs in on their phone,
sees their offers and coming jobs, and accepts or declines an offer, also with no signal.
That is the first path by which a service item reaches ACCEPTED. Calendar, credentials,
earnings, W-Job (and its SMS SOS), background resend and distribution come after (§8).

## 2. Decisions

| # | Decision | Chosen |
|---|---|---|
| W1 | How a worker signs in | **(approved)** Phone number + a 6-digit code, 10 minutes, 5 tries. The code goes by SMS through a channel (console in development, nothing in production until a provider exists), or the desk issues it to read out after checking the ID card (W-Login "¿Sin señal para el SMS?"). A custom Better Auth endpoint like the staff recovery codes; the code's hash lives in Better Auth's `verification` table, so **no migration**. The phone is the supplier profile's `primaryPhone`, normalised (`+53` for 8 digits). |
| W2 | Numbers shared by two workers | No code is texted; the desk route works per supplier. No unique index (that would be a migration). |
| W3 | How the app carries its session | **(approved)** Better Auth's built-in bearer conversion with `requireSignature`, read only by `getSession`, and only for sessions the worker code opened (`signInMethod = worker_code`); any other signed token is refused (401). Only the worker-code endpoint returns a token; the stock plugin's response header (which would expose every session's token) is not installed. 30-day session, token in the phone's keystore. |
| W4 | Session length | 30 days (W-Login). Better Auth's rolling refresh only extends it. |
| W5 | Worker routes | `GET /worker/home` (profile, open offers, coming jobs, the API's clock) and `POST /worker/sign-out`, `SERVICE_WORKER` only and scoped to the caller's supplier profile; accept/decline stay `POST /service-items/:id/accept|decline`. Travelers: first name, language, party size; never an email, address or payment. The desk route is `POST /suppliers/:id/sign-in-code` (Operations Admin, Super Admin; no permission override). |
| W6 | Offline answers | Saved on the phone first (SQLite key-value store), sent in order, the last answer per offer wins; a refusal (409/404/403) drops it and tells the worker, no response keeps it with a 5 s → 15 s → 1 min → 5 min backoff, 401 keeps it until the next sign-in. Resent on open, on return to the foreground and by timer while open. |
| W7 | Seeing the screens here (no Android SDK) | **(approved)** Expo's web target (`react-native-web`, `react-dom`), dev/test only: `pnpm --filter @ota/worker-app run preview` serves the web export on :3003 and proxies the API routes on the same origin, dropping cookies. Never shipped to workers. |
| W8 | Navigation | Three screens in one state machine; no `expo-router` (it pulls a large tree for three screens). |
| W9 | Versions | Expo SDK 58.0.19 (2026-10-23) and the exact versions it pins for React Native 0.88.0, React 19.3.0, `expo-secure-store`, `expo-sqlite`, `expo-status-bar`, `expo-constants`, `react-native-safe-area-context`, `react-native-web` 0.21.4, all at least two weeks old. |

## 3. What the desk does

Supplier page → "Worker app sign-in" → "Issue sign-in code…": a reminder to check the ID card,
then the code once, with the masked number it works with and its expiry. Issuing replaces any
open code; an SMS request does not replace a desk code while it is open. Audited as
`auth.worker_code_issued` (actor), `auth.worker_code_sent` (`via: sms`, `delivered`),
`auth.worker_code_used` and `auth.worker_code_voided`.

## 4. Settings

- `SMS_PROVIDER`: unset → console in development, nothing in production; `console` or `none`.
  A real provider (LINK Mobility, Messente or Bird, ADR 0007) waits on the legal entity.
- `WORKER_API_URL` (app build): the API the app calls; default `http://localhost:3001`. The web
  preview builds with it empty (same origin).
- The app reads the agency name, the desk phone (`branding.supportPhone`, else the first
  emergency contact) and the colours from the tenant manifest at build time
  (`app.config.ts`, `@ota/theming` `themePrimitives`); its code never imports `tenant/`.
- Android application id: `com.<tenant id without dashes>.worker` (`com.veredaexpeditions.worker`).

## 5. Verification

Domain rules and the answer queue are unit-tested; the auth plugin is tested against Better
Auth's memory adapter (a staff token used as a bearer is refused); the API's codes and home
with a fake Prisma; the RBAC matrix carries the three routes; `e2e/worker-app.spec.ts` signs a
worker in with a desk code and accepts, then declines with the browser offline and checks the
decline arrives when it comes back. `pnpm --filter @ota/worker-app run build` bundles the
Android JavaScript (Hermes bytecode); no APK is built here.

## 6. Design resolutions (no board change)

- System font: the brand face is not bundled (mobile data, ADR 0007); the tenant's colours are.
- W-Offer's "Queda menos de un cuarto del tiempo" becomes "Queda poco tiempo …", shown from
  the desk's amber threshold (`hurryFrom`), which is a runtime setting rather than a fixed
  quarter.
- W-Home's credential line names the credential generically ("Credencial vigente · vence …"),
  since a profile holds one credential date, not a licence and an insurance.
- W-Offer's route ("Aeropuerto → Viñales"), flight and pickup notes are not in the data yet;
  the offer shows the service, province, start and end, travelers, payout and booking code.
- Offer cards, the reasons list and the outcome states use the DS radii (4/10/20), the 48 dp
  touch size and existing colour roles; the sync chip says its state in words.

## 7. As built (2026-11-09)

Domain `packages/domain/src/worker/` (sign-in, SMS segment, answers); auth
`packages/auth/src/worker-code.ts`; API `apps/api/src/worker/`, `apps/api/src/sms/`; schemas
`packages/schemas/src/worker.ts`; desk `worker-sign-in-code.tsx` on the supplier page (en/es/fr);
app `apps/worker-app/` (Login, Home, Offer); e2e `e2e/worker-app.spec.ts`.

## 8. Next slices

1. The field test on real phones: an APK built on a machine with the Android SDK (`expo
   prebuild` + Gradle, our own signing key backed up twice), two or three workers.
2. Background resend (`expo-background-task`), availability toggle and W-Calendar,
   W-Credentials, W-Earnings.
3. W-Job with the offline job screen and the SMS SOS (a custom Android module).
4. Distribution: the download page, the in-app update prompt, self-hosted `expo-updates`.
5. The SMS provider (needs the legal entity), then the T+0 offer SMS (ADR 0007 A5).
