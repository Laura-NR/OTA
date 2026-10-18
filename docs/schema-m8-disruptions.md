# M8 Disruptions: schema diff for review

**Status:** **Draft for the owner's review (2026-10-18).** No migration is generated until
D1–D9 are answered.
**Date:** 2026-10-18
**Scope:** `docs/design-v1.1-plan.md` Phase 5 (Disruptions, M8) and Phase 6 (E-Options), read
against the A-Disruption, G-Disruption and E-Options boards (`design/vereda-v1.2/project/`) and
the crisis framework they cite (spec §8.1). It builds on M2 (the travel party), M4 (refunds),
M7 (advisories, whose "from case DC-0931" link was deferred here) and the audit-log ledgers the
Phase 6 scans use.

## 1. What M8 covers

| Board item | Where it lands |
|---|---|
| "Disruption case DC-0931": title, scenario, severity, province, owner, opened, summary (A-Disruption) | `DisruptionCase` (D2) |
| Scenario picker: outage > 12 h, hurricane, fuel, casa closure, flight cancellation; each with a trigger, a playbook, options and a compensation rule | Tenant manifest `disruptions.scenarios` (D1); the case copies its playbook steps when it opens |
| Severity Minor · Major · Emergency, "can be raised at any time" (G-Disruption) | `DisruptionCase.severity` (D3) |
| Playbook steps with owner and due time, ticked as done | `DisruptionStep` (D1, D2) |
| "Affected bookings: 3 · travelers on the ground · arriving in 72 h" | `DisruptionCaseBooking`, one row per attached booking (D2) |
| Traveler options A–D, "each option states the money consequence", "reply by 18:00", "silence past the deadline keeps option A and the desk calls" | `DisruptionOption` per case and the offer/choice on `DisruptionCaseBooking` (D4) |
| Traveler status board: Safe · Needs help · Unknown, last contact, "Mark safe records who confirmed and how", Unknown turns red after 4 h (major) / 1 h (emergency) | `DisruptionCaseBooking.safety` and its contact fields; red is derived on read (D6) |
| Compensation rule per scenario ("10–15 % discount on a future booking", "pro-rata credit") | Playbook text in the manifest; money moves through M4 refunds (D5, D9) |
| Communications: one public reference point (the site banner) | A link from `Advisory` to the case (D7); the banner itself is M7 |
| Case log, "feeds the incident & emergency report" | The audit log, `entityType: 'DisruptionCase'` (D8) |
| E-Options email with the deadline and the four options | `packages/email` template, sent when the desk sends the options (D4) |
| SMS, in-app buttons, emergency contacts, insurer, embassy, worker-app supplier broadcast | **Deferred** (§4) |

## 2. Data changes (this is why it is Article 2)

- **New tables:** `disruption_cases`, `disruption_steps`, `disruption_case_bookings`,
  `disruption_options`.
- **New enums:** `DisruptionSeverity` (MINOR, MAJOR, EMERGENCY), `DisruptionStatus` (OPEN,
  CLOSED), `TravelerSafety` (UNKNOWN, SAFE, NEEDS_HELP), `DisruptionChoiceSource` (TRAVELER, DESK,
  DEFAULT).
- **One new nullable column on an existing table:** `advisories.disruption_case_id` (D7).
- **New relations on `User` and `Reservation`.** No backfill; nothing existing changes shape
  beyond the one nullable column.
- **Manifest (additive):** `disruptions` with the scenarios' triggers, steps, option templates and
  compensation text, placeholder until Vereda's crisis framework is confirmed.

## 3. Decisions (options and recommendation)

**D1 · Where the playbooks live.**
(a) Tenant manifest (`disruptions.scenarios`): each scenario's trigger, steps (text, owner role,
due), option templates and compensation text. A case copies the steps and options when it opens,
so a later manifest edit never rewrites an open case's history.
(b) Desk-editable playbook tables.
**Recommend (a).** The crisis framework is agency material (fork content, like the M4 terms);
editing it in the desk is a CMS decision for later.

**D2 · Cases and bookings.**
(a) `DisruptionCase` with a join row per attached booking (`DisruptionCaseBooking`, unique
pair); a booking can be in several cases; the desk attaches bookings by province and date, with
a suggestion list (secured bookings in the province whose trip overlaps the next 72 h or is under
way).
(b) A case per booking.
**Recommend (a).** The board's case spans bookings ("send options to 2 affected bookings").

**D3 · Severity.**
(a) Stored on the case, raised or lowered by the desk at any time (audited); the board's
automatic "outage passing 12 h → major" needs a sensor the platform does not have, so it is a
playbook line, not code.
(b) Derived from timers.
**Recommend (a).** Who is paged and how often follow the severity; the derived red "Unknown"
(D6) is the only timer.

**D4 · Options, deadline and choice.**
(a) One option set per case (`DisruptionOption`, keys A–D, title, detail stating the money
consequence, written by the desk from the templates in one language), and per booking an offer
(deadline, default key, sent time) and a choice (key, source TRAVELER/DESK/DEFAULT, who, when).
The traveler chooses on the trip page behind sign-in (as M5 proposals); E-Options links there.
Past the deadline with no choice, the default option is the effective choice **on read**, the
booking shows on the desk's "call now" list, and nothing is mutated by a job.
(b) A public short link (`/o/6RQ4JD`) that chooses without sign-in.
(c) A scheduled job that writes the default at the deadline.
**Recommend (a).** A public link that changes a booking is a capability URL with a write behind
it (the M5 and wire-page reasoning); deriving the default keeps one source of truth.

**D5 · What a choice does.**
(a) Records it; the desk executes it with the existing tools (re-dispatch, service edits, M4
refunds), each audited against the case.
(b) Options carry machine actions (relocate, refund amount) the platform performs.
**Recommend (a).** The scenarios' actions are people's work on the ground; automating refunds
needs the M4 rules per option, a later step.

**D6 · Traveler status board.**
(a) Per attached booking: `safety` UNKNOWN/SAFE/NEEDS_HELP, last contact time, a short note, who
confirmed (desk user) and how (channel text). "Unknown" turns red after 4 h without contact
(major) or 1 h (emergency), derived on read. Bookings stand for their party (the board lists
"Anders & Birgit Holm" as one row).
(b) Per M2 traveler.
**Recommend (a).** One contact usually covers the party; a per-traveler board can follow if
Vereda needs it.

**D7 · Link to the advisory (M7).**
(a) `advisories.disruption_case_id` (nullable, ON DELETE SET NULL): the case drafts its banner
as an ordinary M7 advisory, approved by M7's rules; the case page shows its state.
(b) No link.
**Recommend (a).** It is the board's "one public reference point" and keeps the two-approval
rule in one place.

**D8 · Case log.**
(a) The audit log (`entityType: 'DisruptionCase'`, actions such as `disruption.opened`,
`.severity_changed`, `.step_done`, `.booking_attached`, `.options_sent`, `.choice_recorded`,
`.safety_marked`, `.closed`), read back as the case log and by A-Reports.
(b) A `disruption_events` table.
**Recommend (a).** Same pattern as M4–M7; the incident & emergency report counts cases and
their logs.

**D9 · Compensation.**
(a) The scenario's compensation text is shown on the case and in E-Options; any credit or refund
goes through M4 refunds (reason FORCE_MAJEURE or a new reason), and a "future-booking discount"
waits for a voucher/credit model.
(b) Add a credits table now.
**Recommend (a).** Discount codes and credits are a separate money feature with counsel input.

## 4. Deferred, not in M8

- SMS and in-app buttons for the options and check-ins (an SMS provider; Phase 6).
- Notifying emergency contacts, the insurer and embassies (an SMS provider, counsel on contacting
  third parties, insurer integration).
- The supplier broadcast through the worker app (ADR 0007).
- A credits/discount model for "10–15 % on a future trip" (D9).
- Automatic severity from outage feeds (no data source).

## 5. What lands with M8 once approved

- Manifest `disruptions` block (placeholder scenarios from the boards) in `packages/config`.
- Pure rules in `@ota/domain`: the effective choice (default after the deadline), the red
  "Unknown" rule by severity, the suggested bookings for a province and window, the case counts
  (on the ground, arriving in 72 h), unit-tested.
- API: ops `GET/POST /disruptions`, `GET/PATCH /disruptions/:id` (severity, owner, summary, close),
  `POST /disruptions/:id/steps/:stepId/done`, `POST /disruptions/:id/bookings` (attach),
  `PUT /disruptions/:id/options`, `POST /disruptions/:id/send-options`,
  `POST /disruptions/:id/bookings/:bookingId/safety`, `POST .../choice` (desk records a phone
  answer); traveler `GET /me/disruptions` and `POST /me/disruptions/:id/choice`. All in the
  authorization matrix; every step audited.
- E-Options (en/es/fr, branded, the shared shell) sent with the options, idempotent per booking
  and offer through the audit log, verified in Mailpit by e2e.
- Desk: the Disruptions section (list, case page with scenario, severity, playbook, options,
  status board, communications card linking the M7 advisory, case log), un-hiding its nav link;
  a dashboard alert for overdue choices and red Unknowns.
- Storefront: the options card on the trip page with the deadline and the money consequence of
  each option.
- Retention: the safety notes and the choices' free text are redacted with the traveler (Tier 1);
  the case and its counts are kept for the incident report.

## 6. The diff

```prisma
enum DisruptionSeverity {
  MINOR
  MAJOR
  EMERGENCY
}

enum DisruptionStatus {
  OPEN
  CLOSED
}

enum TravelerSafety {
  UNKNOWN
  SAFE
  NEEDS_HELP
}

enum DisruptionChoiceSource {
  TRAVELER
  DESK
  /// The deadline passed with no answer; recorded when the desk confirms it.
  DEFAULT
}

/// M8: a disruption case (A-Disruption). Its log is the audit trail (D8).
model DisruptionCase {
  id        String             @id @default(uuid()) @db.Uuid
  /// The visible reference (DC-0931), unique.
  reference String             @unique
  /// The manifest scenario key (outage, hurricane, fuel, casa, flight).
  scenario  String
  severity  DisruptionSeverity
  status    DisruptionStatus   @default(OPEN)
  /// A province code (CU01…); null when it is not regional (a flight).
  province  String?
  title     String
  summary   String
  /// The scenario's compensation rule as it read when the case opened.
  policy    String
  ownerId   String?            @map("owner_id") @db.Uuid
  openedAt  DateTime           @default(now()) @map("opened_at")
  closedAt  DateTime?          @map("closed_at")
  createdAt DateTime           @default(now()) @map("created_at")
  updatedAt DateTime           @updatedAt @map("updated_at")

  owner      User?                   @relation("DisruptionOwner", fields: [ownerId], references: [id], onDelete: SetNull)
  steps      DisruptionStep[]
  options    DisruptionOption[]
  bookings   DisruptionCaseBooking[]
  advisories Advisory[]

  @@index([status, openedAt])
  @@map("disruption_cases")
}

/// A playbook step, copied from the manifest when the case opens (D1).
model DisruptionStep {
  id        String    @id @default(uuid()) @db.Uuid
  caseId    String    @map("case_id") @db.Uuid
  position  Int
  text      String
  /// The owner as the playbook names it ("Local coordinator").
  owner     String
  /// The due time as the playbook words it ("within 2 h").
  due       String
  doneAt    DateTime? @map("done_at")
  doneById  String?   @map("done_by_id") @db.Uuid

  case   DisruptionCase @relation(fields: [caseId], references: [id], onDelete: Cascade)
  doneBy User?          @relation("DisruptionStepDoneBy", fields: [doneById], references: [id], onDelete: SetNull)

  @@unique([caseId, position])
  @@map("disruption_steps")
}

/// The options offered to the case's bookings (D4), each stating its money consequence.
model DisruptionOption {
  id       String @id @default(uuid()) @db.Uuid
  caseId   String @map("case_id") @db.Uuid
  /// A, B, C, D.
  key      String
  position Int
  title    String
  detail   String

  case DisruptionCase @relation(fields: [caseId], references: [id], onDelete: Cascade)

  @@unique([caseId, key])
  @@map("disruption_options")
}

/// One attached booking: its safety on the status board (D6) and its offer and choice (D4).
model DisruptionCaseBooking {
  id                String                  @id @default(uuid()) @db.Uuid
  caseId            String                  @map("case_id") @db.Uuid
  reservationId     String                  @map("reservation_id") @db.Uuid
  safety            TravelerSafety          @default(UNKNOWN)
  lastContactAt     DateTime?               @map("last_contact_at")
  /// "SMS reply: all fine" — redacted with the traveler (retention Tier 1).
  safetyNote        String?                 @map("safety_note")
  safetyConfirmedBy String?                 @map("safety_confirmed_by_id") @db.Uuid
  offerSentAt       DateTime?               @map("offer_sent_at")
  offerDeadline     DateTime?               @map("offer_deadline")
  defaultOptionKey  String?                 @map("default_option_key")
  chosenOptionKey   String?                 @map("chosen_option_key")
  choiceSource      DisruptionChoiceSource? @map("choice_source")
  chosenAt          DateTime?               @map("chosen_at")
  chosenById        String?                 @map("chosen_by_id") @db.Uuid
  createdAt         DateTime                @default(now()) @map("created_at")
  updatedAt         DateTime                @updatedAt @map("updated_at")

  case        DisruptionCase @relation(fields: [caseId], references: [id], onDelete: Cascade)
  reservation Reservation    @relation(fields: [reservationId], references: [id], onDelete: Cascade)
  confirmedBy User?          @relation("DisruptionSafetyConfirmedBy", fields: [safetyConfirmedBy], references: [id], onDelete: SetNull)
  chosenBy    User?          @relation("DisruptionChoiceBy", fields: [chosenById], references: [id], onDelete: SetNull)

  @@unique([caseId, reservationId])
  @@index([reservationId])
  @@map("disruption_case_bookings")
}

// On Advisory (D7):
//   disruptionCaseId String?         @map("disruption_case_id") @db.Uuid
//   disruptionCase   DisruptionCase? @relation(fields: [disruptionCaseId], references: [id], onDelete: SetNull)
//
// On Reservation:
//   disruptions DisruptionCaseBooking[]
//
// On User:
//   disruptionsOwned    DisruptionCase[]        @relation("DisruptionOwner")
//   disruptionStepsDone DisruptionStep[]        @relation("DisruptionStepDoneBy")
//   safetyConfirmations DisruptionCaseBooking[] @relation("DisruptionSafetyConfirmedBy")
//   disruptionChoices   DisruptionCaseBooking[] @relation("DisruptionChoiceBy")
```

The migration would be generated with `pnpm --filter @ota/db exec prisma migrate dev --name
disruptions` once D1–D9 are answered (never `prisma format`).
