# Worker app (Phase 7): plan and first slice

- **Date:** 2026-11-09
- **Status:** first slice built (§7), then the desk's sign-out (2026-11-10) and W-Calendar
  (2026-11-11) with its block reasons (approved and built the same day,
  `docs/schema-w-calendar-reasons.md`, a migration). W1, W3 and W7 approved by the owner on
  2026-11-09 with Expo itself; the rest are build decisions inside ADR 0007.
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

Beside it, "Sign out of the worker app…" (2026-11-10, same roles, `POST
/suppliers/:id/worker-sign-out`), for a lost phone or one that changed hands: it ends every
session a worker code opened for that worker and voids any open code, then says how many phones
were signed out. Each phone learns it at its next request (401) and returns to sign-in with "Tu
sesión terminó"; the worker's other sessions, if any, are left alone. Audited as
`auth.worker_signed_out` (actor, `sessions`, `codes`).

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
- W-Calendar (2026-11-11):
  - The board's bottom bar needs screens not built yet (W-Job, W-Earnings), so the calendar
    opens from a "Calendario y disponibilidad" button in W-Home's footer and returns with
    "Volver al inicio", as W-Offer does.
  - The month arrows are text chevrons in 44 dp bordered buttons: the app has no SVG library.
  - "Desde" and "Hasta" are picked on the month grid (tap "Desde", then the day; "Hasta"
    follows) instead of typed as "25 oct": no date-picker dependency and no free-text dates. A
    range of more than 62 days is refused with a note; job and offer days in it stay as they
    are and the result says how many.
  - The "Motivo" chips (approved K1a–K6a, `docs/schema-w-calendar-reasons.md`) keep the board's
    pill, label and order but the app's 48 dp touch size (the board's 36 px is below DS 07's),
    with the `line` border and, when picked, `primary` with `surface` text. They are a radio
    group, as W-Offer's reasons are; the day's and the range's groups have their own names.
    Picking a chip on a blocked day saves it at once and says "Motivo guardado: …"; the range
    card's chips start on "Otro" and are sent with the block. A day's spoken label ends with
    its reason. The desk reads the reason in the supplier calendar's day tooltip.
  - A job day lists the job (time, service, province, travelers, payout, booking code) without
    the board's link to W-Job, which is not built; "Llamar a la central para cambiarlo" dials
    the tenant's desk phone. An offer day's amber card opens W-Offer.
  - Past days are faded and read-only; days past the twelfth month ahead say they cannot be
    changed yet (the arrows stop there).
  - The long block (more than 14 days in a row from today) shows as a warning notice under the
    header; the board's caption stays on the range card. The desk has no "inactive" switch:
    the blocked days already keep the worker out of dispatch, so the desk's supplier page shows
    a warning alert (en/es/fr) that says so and asks the desk to call.
  - Fuel: "declarado el …" names the calendar date with its year, as W-Home's credential line
    does; past the desk's staleness threshold (a runtime setting, 7 days by default) the card
    adds "Ya toca declararlo de nuevo."
  - Calendar changes need a connection; unlike offer answers they are not queued. The chip
    shows "Sincronizado" or "Sin conexión" from the last read.
  - Day states use existing roles: blocked on `line`, the job dot `primary`, the offer dot
    `warning`, today and the selected day outlined in `primary` (selected on `primarySoft`).
- W-Earnings, read-only (2026-11-11):
  - Reached from a "Fiabilidad y pagos" button in W-Home's footer, as the calendar is; there
    is still no bottom bar (W-Job is not built). The title is "Fiabilidad y pagos", not the
    board's "Perfil": the profile's settings rows (credentials, notifications, language) are
    not built.
  - The score reads every offer in the ledger, as the desk's floor does, rather than the
    board's "últimos 12 meses", so the number the worker sees is the one that decides
    automatic offers (`docs/schema-w-earnings.md` E8). "Muy buena" becomes "Recibes ofertas
    automáticas" or "Por debajo del mínimo …", the floor's own test, since no bands exist.
    Before the minimum of answers, the score is "—" with "llevas N de 5 respuestas".
  - The board's "Responder a tiempo, aunque sea para rechazar, mantiene el número alto" is not
    used: a decline lowers the acceptance share as much as no answer does. The app says what
    counts and the floor instead. The trend ("subió desde 93 en julio") and last-minute
    cancellations are not shown (E8, W-Job).
  - Payouts: "Pendiente" (finished, not paid), "Este mes" (finished this month), and "Pagado ·
    trabajos de 2026" rather than "Pagado en 2026", because there is no paid date until E1.
    The payout method, the next pay day, "Cambiar a transferencia" and the receipts wait on
    `docs/schema-w-earnings.md`; the card says "La central te dice cuándo y dónde cobras cada
    trabajo." A failed payout shows as a danger notice asking the worker to call.
  - Historial: the job's end date, payout, service and province, the travelers' line and
    booking code, and a state chip (Pendiente on `warningSoft`/`warning`, Pagado on
    `successSoft`/`success`, Incidencia on `surface`/`danger`, `radius-sm`). No route
    ("La Habana → Viñales") and no rating: neither is in the data.
  - Valoraciones are not shown: a review rates the whole booking (E6).
  - Needs a connection, like the calendar; pull to refresh.

## 7. As built (2026-11-09)

Domain `packages/domain/src/worker/` (sign-in, SMS segment, answers); auth
`packages/auth/src/worker-code.ts`; API `apps/api/src/worker/`, `apps/api/src/sms/`; schemas
`packages/schemas/src/worker.ts`; desk `worker-sign-in-code.tsx` on the supplier page (en/es/fr);
app `apps/worker-app/` (Login, Home, Offer); e2e `e2e/worker-app.spec.ts`. The desk's sign-out
(2026-11-10): `WorkerCodesService.signOut`, `worker-sign-out.tsx` (en/es/fr), the spec's third
test; no migration.

W-Calendar (2026-11-11, no migration): domain `packages/domain/src/worker/calendar.ts` (day
states, refusals, ranges, the long block); API `GET /worker/calendar?month=`, `PUT
/worker/availability` (a day or a range; job and offer days kept; audited as
`supplier.availability_set` with `via: WORKER_APP`) and `PUT /worker/fuel` (drivers; written
through `SuppliersService.recordResources` as a `WORKER_APP` confirmation, audited as
`supplier.resources_confirmed`); the supplier inspector's `longBlock`; app
`CalendarScreen.tsx`; the desk's long-block alert on the supplier page (en/es/fr); the spec's
fourth test. The block reasons (2026-11-11, migration
`20261111171409_w_calendar_block_reasons`): `workerBlockReason`, the optional `reason` on `PUT
/worker/availability`, `reason` on the calendar's blocked days and `blockReason` on the desk's
availability day, the chips, the desk tooltip (en/es/fr); `docs/schema-w-calendar-reasons.md`
§7.

W-Earnings, read-only (2026-11-11, no migration): domain `packages/domain/src/worker/earnings.ts`
(finished jobs, payout states, totals in cents on Havana's calendar, the reliability view); API
`GET /worker/earnings` and the supplier inspector's `payouts` (`SuppliersService.payouts`, the
same rule); app `EarningsScreen.tsx`; the desk's Payouts panel on the supplier page (en/es/fr);
the spec's fifth test. Recording a payout, its date, method and receipt, the next pay day and
ratings wait on `docs/schema-w-earnings.md` (proposed, E1–E8).

## 8. Next slices

1. The field test on real phones: an APK built on a machine with the Android SDK (`expo
   prebuild` + Gradle, our own signing key backed up twice), two or three workers.
2. Background resend (`expo-background-task`, a new dependency), W-Credentials, W-Earnings'
   payouts (`docs/schema-w-earnings.md`; the read-only screen landed 2026-11-11).
3. W-Job with the offline job screen and the SMS SOS (a custom Android module).
4. Distribution: the download page, the in-app update prompt, self-hosted `expo-updates`.
5. The SMS provider (needs the legal entity), then the T+0 offer SMS (ADR 0007 A5).
