# M8 Disruptions: schema diff for review

**Status:** **Approved 2026-10-18 as recommended (D1a–D9a) and landed 2026-10-18.** Migration
`20261018161050_disruptions` is §6 verbatim; §7 records what the build added.
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
disruptions` (never `prisma format`).

## 7. As built (2026-10-18)

- **Migration** `20261018161050_disruptions` (`ed96b87`): §6 verbatim, additive.
- **Manifest** (`5523ea1`): `disruptions` with `status` (placeholder), `deadlineHours` (4, the
  desk form's proposal) and the five A-Disruption scenarios. Options are keyed A–D in order and
  the default must be one of them; supplier names were taken out of the board's options (the
  desk adapts each option before sending). Texts are in the desk's language.
- **Rules** (`f83a467`, `packages/domain/src/disruptions/disruption.ts`): the offer state
  (NOT_SENT, AWAITING, CHOSEN, DEFAULTED) and the effective choice on read; red "Unknown" after
  4 h (major) or 1 h (emergency) since the last contact, or since the attachment when there was
  none; a minor case has no timer. Suggested bookings: the advisory's secured statuses, the
  case's province, under way or starting within 72 h; a case without a province suggests none.
- **Choice rules the doc left open:** the traveler answers **once**, before the deadline, on an
  open case; a change goes through the desk (which may already be acting on it). The desk records
  a phone answer at any time on an open case (source DESK) and may confirm the default only after
  the deadline (source DEFAULT), which takes the booking off the call list. The traveler's write
  is conditional (`chosenOptionKey IS NULL`, deadline ahead, case open): proved live, two answers
  at once record one, and without the condition the test fails 3/3.
- **Options:** one set per case, editable until any booking was sent it, then fixed. Sending again
  to an unanswered booking is a new offer (a deadline extension) and is emailed again; an
  answered booking is refused.
- **API** (`b2c6f58`): §5's routes plus `GET /disruptions/alerts` (the dashboard figures) and
  `POST /disruptions/:id/advisory` (drafts the banner as an M7 advisory: severity MINOR→INFO,
  MAJOR→CAUTION, EMERGENCY→CRITICAL, the province as region, three days, the case's title and
  summary; an existing draft or review is returned instead). `:bookingId` in the desk routes is the
  reservation id; `/me/disruptions/:id` is the attached booking's row. Reads: ops roles; writes:
  Operations Admin and Super Admin. A new advisory version keeps the case link; the advisory DTO
  gained `disruptionCase`. Audit actions (`entityType: 'DisruptionCase'`): `disruption.opened`,
  `.booking_attached`, `.severity_changed`, `.owner_changed`, `.updated`, `.step_done`,
  `.options_updated`, `.options_sent`, `.options_delivered` (the E-Options ledger, keyed by the
  booking row and the offer's sent time), `.safety_marked` (the note in `note`),
  `.choice_recorded`, `.advisory_drafted`, `.closed`. A case cannot be reopened.
- **E-Options** (`d5c8d04`): the shared shell in the traveler's language around the desk's words;
  the deadline in Havana time; it links to `#disruption-options` on the trip page. Sent after the
  commit, best-effort; a failed send is retried by the next delivery pass (the next send).
- **Retention:** the anonymization nulls the bookings' `safetyNote` and drops `note` from this
  traveler's lines in the shared case log (other travelers' lines stay); states, choices and the
  case are kept. Proved live in `retention.integration.test.ts` (fails on the old code).
- **Surfaces:** desk `a823319` (+ layout `da50490`), storefront `50cf8ed`, e2e `f3dbf85`;
  resolutions in the ADR 0006 M8 amendment.

