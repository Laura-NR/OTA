# W-Job: schema diff for review

**Status:** proposed 2026-11-15; **approved 2026-11-15, J1–J9 as recommended** (J1a, J2a, J3a,
J4a, J5a, J6a, J7a, J8a, J9a).
**Date:** 2026-11-15
**Scope:** the W-Job board (`design/vereda-v1.2/project/W-Job.dc.html`): the day's job readable
with no signal, the service steps, and the one-touch on-site emergency. The worker app's bottom
bar ("Inicio · Ofertas · Calendario · Trabajos · Perfil") comes with it, as W-Job is the last
screen it was waiting for. Spec §5.2 ("Active Itinerary: offline-accessible client name, pickup
location, emergency dispatch hotline, and one-touch Report On-Site Emergency"), §7.2 (the
`sync_queue`), §8.1 (duty of care) and §8.2 (what a worker may receive). Phase 7,
`docs/worker-app-plan.md` §8 item 2; ADR 0007 (the emergency SMS from the worker's phone).

## 1. What the board asks, and what exists

| Item | Today | Where it lands |
|---|---|---|
| Today's job readable offline: time, route, travelers (first name, party, languages), payout and pay day | W-Home's jobs carry the type, province, times, booking code, payout and the traveler's first name, language and party size; the last home is cached on the phone. The next pay day is W-Earnings' | Unchanged; W-Job reads the pay day from W-Earnings' rule; J1 adds the brief |
| Pickup point, destination, "cartel «Vereda · Nakamura»", flight, luggage, notes from the desk | **Missing**: a service item has a type, dates and a province only; the work order PDF shows the province and start time | J1 |
| Flight status live ("a tiempo · visto 14:20") | **Missing**: no flight-data source | Not built (§4); the flight number goes in the brief |
| "mapa guardado · T3 → Vedado · 32 min" | **Missing**: no map tiles or routing | Not built (§4) |
| Local contacts ("Lis (anfitriona)", "Central 24/7") | The desk's 24/7 line is in the manifest (`supportPhone`, `emergencyContacts`); nothing else | J8 |
| Four timed steps (En camino, He llegado, Pasajeros a bordo, Entregado), saved on the phone and sent when the signal returns; "la central y los viajeros ven «en camino» y «entregado»" | **Missing**: nothing records a job's progress; no code sets `ServiceItemStatus.FULFILLED` | J2, J3, J4 |
| "Reportar emergencia en el lugar": a type (médica, mecánica, seguridad, otra), "Avisar a la central con mi ubicación", call the desk, 104 / 106 / 105 | The desk logs incidents by hand (`POST /reservations/:id/incidents`, the Duty-of-care card); `incidents` has a category, description, severity and resolution only; no live alert for them | J5, J6, J7 |
| "Ubicación enviada por SMS (sin datos)" | ADR 0007 chose an SMS from the worker's own phone; nothing is built | J6 |
| "Mensaje a la central" and the thread with the desk | **Missing**: messages belong to a booking and are traveler ↔ desk only | J9 |
| "Ves solo el nombre, el idioma y los teléfonos locales de contacto" | Already the worker DTOs' rule (`workerTravelerSchema`) | Kept for every new field |

## 2. Data changes (this is why it is Article 2)

With the recommendations below:

- `service_items` gains **three nullable text columns** for the desk's brief (`meeting_point`,
  `drop_off`, `worker_brief`) and **four nullable timestamps** for the steps (`en_route_at`,
  `arrived_at`, `started_at`, `finished_at`). Additive.
- `incidents` gains **nullable columns** for a worker's report (`service_item_id`,
  `supplier_id`, `source`, `latitude`, `longitude`, `location_accuracy_m`, `occurred_at`,
  `client_ref` unique, `acknowledged_at`, `acknowledged_by_id`) and **one new enum**
  `IncidentSource` (`DESK`, `WORKER_APP`, `WORKER_SMS`), default `DESK`. Additive; existing rows
  read as desk-logged.
- No backfill, no data change. Undo: drop the columns and the enum.
- One new dependency if J7 is (a): `expo-location` 58.0.19, Expo SDK 58's own pin (MIT).

## 3. Decisions (options and recommendation)

- **J1 — The job's brief.** (a) **Recommended:** three nullable text columns on
  `service_items`, each up to 500 characters: `meeting_point` (where the worker meets the
  travelers), `drop_off` (where it ends; transport mostly) and `worker_brief` (free notes: the
  flight, the sign's text, mobility, luggage). The desk edits them per service on the booking
  page (en/es/fr); the app shows them on W-Job and caches them with the home. The work order PDF
  prints them too. `worker_brief` is free text that may hold a traveler's health or mobility
  details, so the retention purge redacts it with the other Tier 1 free text. (b) One JSON
  column `job_details`: flexible, but untyped, and every reader must guess its shape. (c) No new
  fields: W-Job shows the province and time, and the desk phones the details.
- **J2 — Steps.** (a) **Recommended:** four nullable timestamps on `service_items`
  (`en_route_at`, `arrived_at`, `started_at`, `finished_at`), set once each. The time is the
  worker's tap, corrected by the API's clock as answers are, and refused if it is in the future
  or before the job was accepted. A step may be skipped (a worker who forgets "En camino" can
  still tap "He llegado"); a recorded step is never moved back, and sending it again returns the
  first time. Who recorded it and from where (app, or the desk after a call) goes in the audit
  log, as for every other write. Labels follow the service type: transport "En camino · He
  llegado · Pasajeros a bordo · Entregado"; guide and experience "En camino · He llegado · Con el
  grupo · Terminado"; accommodation "Huéspedes llegaron · Salida" (the last two steps only).
  (b) A `service_item_steps` table, one row per step with its channel and recorder: the same
  facts, plus a table and a join for each read; the audit log already holds who and how.
- **J3 — What the last step changes.** (a) **Recommended:** `finished_at` also sets the item
  `FULFILLED`, the first code to do so (the dispatch progress already counts it as confirmed).
  Earnings and payouts keep their end-date rule (W-Earnings), so a worker who forgets the
  button is still paid. The booking's own state is unchanged: the desk still moves it to
  `IN_PROGRESS` and `COMPLETED`. (b) The first step of a booking's first service also moves it
  to `IN_PROGRESS`, and the last finished service offers `COMPLETED` to the desk. This is closer
  to spec §4.2, but `COMPLETED` starts the retention clock and the review request, which a
  forgotten tap should not trigger.
- **J4 — Who sees the steps.** (a) **Recommended:** the desk and the traveler, as the board
  says. The desk sees each service's step and time on the booking page and Ops Lite's
  pipeline ("on the ground"), and can record a step after a call. The traveler's trip page shows
  "Your driver is on the way" and "Delivered" (en/es/fr) on that day's services, with the
  worker's first name only. (b) The desk only, for now; the trip page follows after the field
  test.
- **J5 — Where an emergency report is kept.** (a) **Recommended:** in `incidents`, which the
  desk already lists, resolves and counts (the Duty-of-care card, Reports' quality, the KPI
  counts). A worker's report adds the service item, the reporter, the source (`WORKER_APP`, or
  `WORKER_SMS` when the desk enters a report that arrived by SMS only), the position, the
  phone's time, an id from the app (`client_ref`, so a resent report is not doubled) and the
  acknowledgement. The category is the board's type (`MEDICAL`, `MECHANICAL`, `SECURITY`,
  `OTHER`); the severity is `CRITICAL`, which the desk may lower. The retention purge sets the
  position to null with the description. (b) A new `emergency_reports` table: a second list,
  alert path and retention rule for the same thing.
- **J6 — How the report reaches the desk with no data.** In every option, the tap saves the
  report on the phone first and the app sends it to the API as soon as there is data (in the
  background too), where it raises a red alert: the dashboard, every desk page's alert feed and
  Ops Lite's AL-Alerts, with the sound cue, the worker's phone to call, the position as text
  with a `geo:` link (no map service), and an acknowledgement. The SMS is the channel for when
  there is no data:
  - (a) **Recommended now:** the app opens the phone's SMS composer to the desk's 24/7 number
    with the message filled in. One 160-character GSM-7 segment without accents or `±`, for
    example `SOS VX-4R8T MEDICA 23.11361,-82.36658 (12 m) 14:36 Lazaro` (`fitsOneSmsSegment`). The worker taps Send.
    This needs no dependency (React Native's `Linking` with an `sms:` link), works on the first
    APK and on any phone, and costs one extra tap.
  - (b) ADR 0007's plan: send it silently through a custom Android module (`SEND_SMS`, a
    permission Android asks for). One tap fewer, but it needs the machine with the Android SDK
    to build and test, and it can replace (a) later with no migration.
  - (c) `expo-sms`: a new dependency that, like (a), only opens the composer.

  The desk's 24/7 number is a phone a person holds. The system does not read that SMS until an
  inbound SMS provider exists; the desk can enter it as a `WORKER_SMS` incident, and the app's
  copy reaches the log once data returns. The board's "Ana te llama en menos de 2 minutos"
  becomes "La central te llamará. Si no llega la llamada, marca el 104 / 106 según el caso",
  because the app cannot know who is on duty or promise a time.
- **J7 — The position (a new dependency).** (a) **Recommended:** `expo-location` 58.0.19,
  foreground permission only, asked the first time the worker opens a job (not in the
  emergency), one fix at the tap capped at 10 seconds, falling back to the last known position.
  GPS needs no data. There is no tracking and no background location. (b) No position: the
  report and the SMS give the job's meeting point and province, and the desk calls.
- **J8 — Local contacts on the job.** (a) **Recommended:** the desk's 24/7 line, plus the host
  of that night (the accepted accommodation service of the same booking covering the job's
  date): first name and phone, only when the phone is Cuban (`+53`). No traveler phone (it is
  usually foreign; spec §8.2). (b) The desk's line only.
- **J9 — Messages with the desk.** (a) **Recommended:** not in this batch. W-Job's "Mensaje a
  la central" becomes "Llamar a la central"; worker threads need their own table (they must
  never show on a traveler's thread), the AL-Inbox and supplier-page views and offline sending,
  and get their own doc after the field test (Ops Lite's open follow-up). (b) In this batch: a
  `worker_messages` table (supplier, service item, sender, body, read state), queued offline
  like answers, shown in AL-Inbox and on the supplier page.

## 4. Not in this batch

- Live flight status: it needs a flight-data provider. The flight number goes in the brief.
- The saved map and route time: they need map tiles and routing for offline use.
- Worker ↔ desk messages (J9 (a)).
- Push notifications: none exist for the worker app yet (ADR 0007).
- An inbound SMS provider that would read the SOS SMS into the system (the owner's SMS
  provider question).
- Spec §7.2's inbound delta (`last_synced_at`): the home stays a full, small payload.

## 5. What lands once approved

- Domain: the steps per service type and their order rules (skip allowed, never back, not in
  the future, not before acceptance), the step labels' keys, the emergency categories and the
  SOS SMS text within one segment, the host-contact rule (`+53` only). All pure, with unit
  tests.
- API: W-Home's jobs gain the brief, the steps and the contacts (optional fields, so older
  app builds keep working); `POST /worker/jobs/:serviceItemId/steps` and `POST
  /worker/jobs/:serviceItemId/emergency` (the worker's own accepted jobs; idempotent on
  `clientRef`); the desk's `PATCH /service-items/:id/brief`, `POST /service-items/:id/steps`
  and `POST /incidents/:id/acknowledge`; the emergency on the `/ops` socket; the traveler's
  `GET /me/reservations/:id` gains each service's step (J4 (a)). Every route goes into the
  RBAC matrix; a live integration test covers a step, an idempotent report and the purge.
- Worker app: W-Job from W-Home's job and the new bottom bar; the steps and the report join the
  answers in the one queue on the phone, sent in order with the background resend; the
  emergency sheet with the four types, the desk's call, the SMS and 104 / 106 / 105.
- Desk: the brief and the steps on the booking page's services, the emergency alert on the
  dashboard, every desk page and Ops Lite, the incident's position, source and acknowledgement
  on the Duty-of-care card and in Reports, in en/es/fr. Storefront: the step line on the trip
  page (J4 (a)).
- e2e: the desk writes a brief; the worker opens the job offline, taps the steps and reports an
  emergency; the desk sees the steps, gets the alert and acknowledges it; the traveler's trip
  page shows "Delivered".

## 6. The diff

```prisma
enum IncidentSource {
  DESK
  WORKER_APP
  WORKER_SMS
}

model ServiceItem {
  // …existing fields…
  /// W-Job J1: the desk's brief for the worker.
  meetingPoint String?   @map("meeting_point")
  dropOff      String?   @map("drop_off")
  workerBrief  String?   @map("worker_brief")
  /// W-Job J2: the worker's steps, each set once.
  enRouteAt    DateTime? @map("en_route_at")
  arrivedAt    DateTime? @map("arrived_at")
  startedAt    DateTime? @map("started_at")
  finishedAt   DateTime? @map("finished_at")
  incidents    Incident[]
}

model Incident {
  // …existing fields…
  serviceItemId     String?        @map("service_item_id") @db.Uuid
  supplierId        String?        @map("supplier_id") @db.Uuid
  source            IncidentSource @default(DESK)
  latitude          Decimal?       @db.Decimal(9, 6)
  longitude         Decimal?       @db.Decimal(9, 6)
  locationAccuracyM Int?           @map("location_accuracy_m")
  occurredAt        DateTime?      @map("occurred_at")
  clientRef         String?        @unique @map("client_ref")
  acknowledgedAt    DateTime?      @map("acknowledged_at")
  acknowledgedById  String?        @map("acknowledged_by_id") @db.Uuid

  serviceItem    ServiceItem?     @relation(fields: [serviceItemId], references: [id], onDelete: SetNull)
  supplier       SupplierProfile? @relation(fields: [supplierId], references: [id], onDelete: SetNull)
  acknowledgedBy User?            @relation(fields: [acknowledgedById], references: [id], onDelete: SetNull)

  @@index([serviceItemId])
  @@index([acknowledgedAt])
}
```

`SupplierProfile` and `User` gain the matching back-relations (`incidents`,
`acknowledgedIncidents`); they are Prisma-only and change no column.

The text columns are capped at 500 characters by the request schemas, not the database, as
elsewhere. With J1 (b), J2 (b), J5 (b) or J9 (b) the diff changes accordingly, and this section
is rewritten before the migration.

## 7. As built (2026-11-15)

Approved J1–J9 as recommended. One migration, `20261115100000_w_job` (applied to the dev DB),
exactly §6's diff. One new dependency, `expo-location` 58.0.19.

- **Domain** `packages/domain/src/worker/job.ts`: `JOB_STEPS`, `jobStepsFor` (a host has only
  `STARTED` and `FINISHED`), `currentJobStep`, `jobStepRefusal` (not for the type, ahead of the
  API clock by more than two minutes, before acceptance, a later step already in; a step
  already in is not refused), `jobStepsOpen` (`CONFIRMED`, `IN_PROGRESS`), `jobStepsDue` (from
  the service's first day), `finishesJob`, `EMERGENCY_CATEGORIES`, `emergencySms` (one GSM-7
  segment; the name is cut first), `jobNightHost` (the stay covering the job's first day,
  `+53` only), `queueJobAction` (reports ahead of steps; a step keeps its first tap).
- **API**: `POST /worker/jobs/:id/steps`, `POST /worker/jobs/:id/emergency` (the worker's own
  taken jobs; a report is idempotent on `clientRef`, also under a race, through the unique
  index); `PATCH /service-items/:id/brief`, `POST /service-items/:id/steps` (operations and
  Super Admin, `bookings` capability); `GET /incidents/emergencies` (operations read) and
  `POST /incidents/:id/acknowledge` (operations write). The step write is guarded on the column
  being empty; the audit names the channel (`app`, `desk`). A report and an acknowledgement go
  out on `/ops` (`incident.emergency`, `incident.acknowledged`). W-Home's jobs carry `brief`,
  `steps`, `stepsOpen` and `nightHost` (optional fields) and read `ACCEPTED` and `FULFILLED`,
  so a finished job stays listed until its day ends. Both reservation views carry
  `currentStep`; the desk's adds `brief` and `steps`. `POST /reservations/:id/incidents` takes
  `source: WORKER_SMS` and a `serviceItemId` from the booking (422 otherwise), filed as
  acknowledged by the person entering it. The retention purge clears the three brief fields and
  the report's position. The work order prints the meeting point, drop-off and notes. RBAC +6.
- **App**: W-Job from W-Home's job cards and the new "Trabajos" tab; the bottom bar "Inicio ·
  Calendario · Trabajos · Perfil" replaces the calendar and earnings buttons. Steps and reports
  live in `ota.worker.jobActions`, flushed with the answers under one lock: reports, then
  answers, then steps. The emergency sheet asks the type, takes one fix (10 s cap, last known
  position as a fallback), saves and sends the report, and opens the SMS composer when the
  report is still on the phone after the sync. The position permission is asked the first
  time a job opens.
- **Desk**: the emergency is a red alert in `DeskAlerts` (its own read, cued and announced like
  dispatch reds, acknowledged at once) shown by `EmergencyAlerts` at the top of the alert strip
  on every desk page and on Ops Lite's alerts, and counted in Ops Lite's alerts badge. A
  booking's services show the latest step, "Brief…" and "Record step…". The duty-of-care card
  shows a report's source, reporter, time, position and acknowledgement and logs a report that
  came by SMS. Reports' incident table names the source when there is no description.
- **Storefront**: the trip page's status cell adds "Your driver is on the way", "Delivered" and
  the like, per service type (en/es/fr).

Resolutions made in the build (also ADR 0006's and ADR 0007's amendments of the day):

- Two lists on the phone rather than one: answers keep their own (a deadline each), job actions
  their own (reports first). One lock covers both.
- `stepsOpen` and `jobStepsDue` were added so the app offers steps only on a paid booking and
  from the service's day; the API enforces the booking state only.
- The board's "Ofertas" tab is dropped: offers are on Inicio, with their count.
- No worker name on the traveler's step line; the trip page times it as the row's dates are.
- The emergency acknowledgement has no undo, unlike a dispatch red's six seconds.
- The app's emergency state shows "Central avisada" whether the report went through the API or
  the composer opened; the second says to press Send and that the app will also send it.
- A host's own job shows no night host.
