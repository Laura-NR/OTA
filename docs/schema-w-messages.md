# Worker ↔ desk messages: schema diff for review

**Status:** proposed 2026-11-15; **approved 2026-11-16, M1–M8 as recommended** (M1a, M2a,
M3a, M4a, M5a, M6a, M7a, M8a).
**Date:** 2026-11-15
**Scope:** the thread between a worker and the desk, W-Job's deferred J9
(`docs/schema-w-job.md`). The worker app's "Mensaje a la central" and its "Central · hoy" thread
(`design/vereda-v1.2/project/W-Job.dc.html`); AL-Inbox's worker threads, its Workers and
Travelers filters (`AL-Inbox.dc.html`); A-Booking's "Worker threads" card (`A-Booking.dc.html`);
A-Suppliers' "Worker app message" (`A-Suppliers.dc.html`). Spec §5.2 (the worker app), §5.4
(Ops Lite's unified inbox), §7.2 (the offline queue) and §8.2 (what a worker may receive).
Phase 7, ADR 0007 (no push to the worker app yet).

## 1. What the boards ask, and what exists

| Item | Today | Where it lands |
|---|---|---|
| W-Job's "Mensaje a la central" and "Central · hoy": the desk's and the worker's messages, "Tú · 13:52 · enviado" | **Missing**: `messages` belong to a booking and are traveler ↔ desk only; W-Job shows "Llamar a la central" | M1, M2 |
| "Sin conexión el mensaje espera en cola; si es urgente, llama." | Answers and job actions wait on the phone and are resent, in the background too; nothing else does | M4 |
| AL-Inbox: travelers and workers in one list, filters All · Urgent · Travelers · Workers, a worker's thread with its job line ("SUP-0098 · today 15:50 HAV → Vedado"), "Call" and the reply | AL-Inbox lists traveler threads only, filters All · Urgent · Unread (ADR 0006, 2026-11-14) | M2, M6 |
| A-Booking's "Worker threads": each worker on the booking with their latest message and time | **Missing** | M6 |
| A-Suppliers' "Worker app message" beside the phone and WhatsApp | The supplier page has the phone, WhatsApp and email | M6 |
| "Worker threads are in Spanish; your reply is sent in Spanish" and the translation toggle | The AI provider is the mock (`translate` only tags the locale) | Not built (§4) |
| Quick-reply chips ("¿Puedes aceptar la oferta?", "Llámame", "Gracias") | Not built for travelers either: canned replies need content | Not built (§4) |
| System lines in the thread ("Oferta: …" by push, "SMS fallback") | Offers have their own screen; no push and no SMS provider exist | Not built (§4) |
| "Workers see only first names and local numbers. Nothing about billing is ever in this thread." | The worker DTOs' rule (`workerTravelerSchema`) | M7 |

## 2. Data changes (this is why it is Article 2)

With the recommendations below:

- **One new table** `worker_messages` and **one new enum** `WorkerMessageSender` (`WORKER`,
  `OPERATIONS`). A row is one message in a worker's thread: the supplier, the sender, the body,
  the desk person who wrote it, the job it is about (optional), the phone's time, an id from the
  app and the read time.
- No change to an existing column, no backfill, no data change. Undo: drop the table and the enum.
- No new dependency.

## 3. Decisions (options and recommendation)

- **M1 — Where worker messages are kept.** (a) **Recommended:** their own table,
  `worker_messages`. A worker's thread then can never appear in a traveler's thread or the
  traveler's email copy, whatever a query forgets; the retention purge and the inbox read each
  table on its own terms. (b) The existing `messages` with a nullable booking and a new
  `supplier_id`: one table, but `reservation_id` stops being required, and every traveler read
  (the trip page, the desk's thread, AL-Inbox, the purge) must add "and not a worker's" or leak.
- **M2 — What a thread is.** (a) **Recommended:** one thread per worker (per supplier profile),
  as AL-Inbox and W-Job draw it ("Central · hoy" is the worker's one line to the desk). Each
  message may name the job it is about (`service_item_id`, one of that worker's own offered or
  taken services); the app sets it when the worker writes from W-Job, and the desk sets it when
  it writes from a booking. A-Booking's "Worker threads" card lists the booking's workers with
  their latest message about that booking, and opens the whole thread. (b) One thread per job:
  simpler to place on a booking, but a worker with three jobs has three threads, and a message
  about no job ("I am ill tomorrow") has nowhere to go.
- **M3 — Read state.** (a) **Recommended:** one `read_at`, set when the receiving side opens the
  thread: the desk opening a worker's thread reads the worker's messages (as for travelers, on
  the desk and Ops Lite alike); the worker opening W-Job's thread or the Messages screen reads
  the desk's. The desk sees "Read 14:02" under its last message; the worker sees nothing of the
  kind (the board draws none). (b) Desk-side unread only: the desk would never know whether a
  worker with no signal has read an instruction.
- **M4 — Writing with no signal.** (a) **Recommended:** the app saves the message on the phone
  first, in a third list beside answers and job actions (`ota.worker.messages`), and sends it in
  the same flush, in the order emergency reports → answers → messages → steps, in the
  background too. Each carries an id from the app (`client_ref`, unique), so a resend is kept
  once, also under a race. The phone's time of writing is kept (`written_at`, corrected by the
  API's clock as steps are, and refused when it is in the future), so "Listo, salgo a las
  15:30" written at 13:52 and delivered at 15:05 reads "13:52 · llegó 15:05" on the desk.
  Until it is sent, the app shows it as "En cola"; the board's "si es urgente, llama" stays
  under the field. (b) Online only: the field is disabled with no signal and the worker calls,
  which is what the board says not to need.
- **M5 — How each side learns of a new message.**
  - The desk, (a) **Recommended:** a worker's message goes out on the `/ops` socket
    (`worker.message`), so AL-Inbox, the booking page and the supplier page update live and the
    desk's inbox counts include it, and the email copy to `OPS_NOTIFY_EMAIL` goes out as for a
    traveler's message. No alert or sound cue: an emergency has its own report (W-Job J5).
  - The worker, (a) **Recommended:** with the next sync (opening the app, pull to refresh, the
    background task's run, which only resends and does not notify): W-Home's payload gains the
    unread count and the thread's latest messages, cached on the phone with the home, so the
    thread reads with no signal. A desk message also shows as a card on W-Home ("Mensaje de la
    central"). No push and no SMS: neither exists for the worker app (ADR 0007; the owner's SMS
    provider question). The desk is told under its field: "Llega cuando abra la app; si es
    urgente, llama."
  - (b) Also an SMS to the worker for every desk message: needs the SMS provider first.
- **M6 — Where the desk reads and writes.** (a) **Recommended:** three places, one component:
  - **Ops Lite's AL-Inbox:** worker threads join the list; the filters become the board's All ·
    Urgent · Travelers · Workers, plus Unread (kept: the desk uses it today). A worker's line is
    "Worker · driver" and their next or current job ("today 15:50 · La Habana → Vedado ·
    VX-7K2M9Q"); a worker's thread is urgent when the worker wrote last about a job that runs
    today. The amber worker avatar is the board's (`warning-100`).
  - **The booking page:** a "Worker threads" card under the traveler's messages: each worker on
    the booking's services, their latest message about it and its time, "Call", and the thread
    opening in place with the reply tagged to that booking's service.
  - **The supplier page:** "Worker app message" beside the phone and WhatsApp, opening the
    thread on the page. Every supplier profile has a worker account, so the button is always
    there; a message waits until the worker signs in (nothing records a first sign-in).
  
  (b) AL-Inbox only, as the follow-up was first written: the desk on a laptop would have to
  open Ops Lite to answer a worker.
- **M7 — What a worker's thread may hold.** (a) **Recommended:** text only, up to 2000
  characters (as traveler messages), no attachments. The worker sees the desk person's first
  name ("Ana · 13:40"), as the board draws it, and never a traveler's surname, email or foreign
  phone from the system; what the desk types is the desk's responsibility, so the reply field
  carries the board's note "Workers see only first names and local numbers. Nothing about
  billing." A worker may write only to the desk, and only while signed in; a suspended worker
  still reads and writes (the desk needs to reach them). (b) The same with photos: needs storage
  rules for worker uploads beyond credentials.
- **M8 — Retention.** (a) **Recommended:** a message that names a job is purged with that
  booking's traveler, as Tier 1 free text (the body becomes the redaction marker, as
  `messages`): it may hold a traveler's health or mobility ("Ingrid lleva bastón"). A message
  naming no job is the supplier's own correspondence and stays, with the supplier's other data
  (Tier 3, not scrubbed today); `docs/pii-at-rest-review.md` gains the table. (b) Purge every
  worker message older than the traveler retention window: removes the worker's own history,
  which the supplier relationship still needs.

## 4. Not in this batch

- The translation toggle: the AI provider is the mock, whose `translate` only tags the locale
  (Next 5).
- Quick-reply chips, for workers and travelers: canned replies need content.
- System lines in the thread (offers, timeouts, SMS fallbacks): offers keep their own screen.
- Push or SMS to the worker for a desk message (ADR 0007; the SMS provider).
- Group messages to several workers, and attachments.
- The desk's `/bookings/messages` page stays traveler threads; worker threads are on the booking,
  the supplier page and Ops Lite.

## 5. What lands once approved

- Domain: the thread rules, pure with unit tests: who may write (a worker to the desk; the desk
  to a supplier with a worker account), the job a message may name (the worker's own offered or
  taken service), the written-time rule (the steps' clock rule), the queue's order with messages
  third (`queueWorkerMessage`), a worker thread's urgency, and AL-Inbox's filters with Travelers
  and Workers.
- API: `GET /worker/messages` and `POST /worker/messages` (the worker's own thread; idempotent on
  `clientRef`), `POST /worker/messages/read`; the desk's `GET /suppliers/:id/messages`, `POST
  /suppliers/:id/messages` and `POST /suppliers/:id/messages/read` (operations roles; writing is
  operations and Super Admin, as other desk writes, and the support role reads); W-Home's
  payload gains `messages` (unread count, the latest twenty) as optional fields, so older app
  builds keep working; `GET /ops-lite/inbox` gains worker threads; the booking view gains its
  workers' latest messages; `worker.message` on `/ops`; the email copy to the desk. Every route
  goes into the RBAC matrix; a live integration test covers a resent message kept once, the
  inbox with both kinds and the purge.
- Worker app: "Mensaje a la central" on W-Job and a Messages screen from W-Home's card and the
  Perfil tab; messages queued and sent with the answers, "En cola" until sent; the thread
  cached with the home.
- Desk (en/es/fr): AL-Inbox's worker threads and filters, the booking page's "Worker threads"
  card, the supplier page's "Worker app message", one thread component for all three.
- e2e: the desk writes to a worker from the booking; the worker reads it, replies offline and
  the reply is sent when the signal returns; the desk sees it in AL-Inbox under Workers, opens
  it (read) and the booking's card shows it.

## 6. The diff

```prisma
/// Worker ↔ desk messages: who wrote a message in a worker's thread.
enum WorkerMessageSender {
  WORKER
  OPERATIONS
}

/// A message in a worker's one thread with the desk (M1, M2). Never a traveler's.
model WorkerMessage {
  id            String              @id @default(uuid()) @db.Uuid
  supplierId    String              @map("supplier_id") @db.Uuid
  sender        WorkerMessageSender
  body          String
  /// The desk person who wrote it (OPERATIONS only).
  authorId      String?             @map("author_id") @db.Uuid
  /// The job it is about, when it names one (M2, M8).
  serviceItemId String?             @map("service_item_id") @db.Uuid
  /// The phone's time of writing, corrected by the API's clock (M4).
  writtenAt     DateTime?           @map("written_at")
  /// The app's id, so a resent message is kept once (M4).
  clientRef     String?             @unique @map("client_ref")
  /// When the receiving side opened the thread (M3).
  readAt        DateTime?           @map("read_at")
  createdAt     DateTime            @default(now()) @map("created_at")

  supplier    SupplierProfile @relation(fields: [supplierId], references: [id], onDelete: Cascade)
  author      User?           @relation(fields: [authorId], references: [id], onDelete: SetNull)
  serviceItem ServiceItem?    @relation(fields: [serviceItemId], references: [id], onDelete: SetNull)

  @@index([supplierId, createdAt])
  @@index([serviceItemId])
  @@map("worker_messages")
}
```

`SupplierProfile`, `User` and `ServiceItem` gain the matching back-relations (`workerMessages`,
`authoredWorkerMessages`, `workerMessages`); they are Prisma-only and change no column.

The body's 2000 characters are capped by the request schemas, not the database, as elsewhere.
With M1 (b), M2 (b), M3 (b) or M4 (b) the diff changes accordingly, and this section is
rewritten before the migration.
