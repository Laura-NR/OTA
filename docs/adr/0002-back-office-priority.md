# ADR 0002 — Back-office operator surface first

- **Date:** 2026-09-21
- **Status:** Accepted
- **Deciders:** Project founders, lead engineer
- **Context:** `docs/development-plan.md`, `docs/adr/0001-stack.md`,
  `OTA - Specifications Document.pdf` (§3–§4, §9, §10)

## Context

The specifications define three applications over one domain core. The
development plan reordered the spec's example roadmap so that **Wave 1 is the
back-office ERP MVP** (its Phases 0–2), deferring the storefront/payments to
Wave 2a and mobile to Wave 2b. The spec explicitly permits this
(`§9 "This is just an example, can be modified as needed"`).

A spec-conformance review (2026-09-21) found the foundation and back-office
**backend** strongly aligned, but the back-office **operator surface** — the
subject of spec §4.1–§4.9 — is the thinnest part of the repository, while the
first storefront slice had been started. Two structural gaps stand out:

1. The reservation pipeline has **no creation path** (`POST /reservations`
   exists nowhere), so the back office can only observe seed data.
2. The read model is a bare list (8 scalar fields), with no reservation detail,
   service items, traveler, or audit trail for an operator to act on.

## Decision

**Finish the back-office operator experience before expanding the storefront.**
Treat the storefront as a stub (public catalog + content shell) until the
back-office workbench is usable. Sequence the work as:

- **A. Reservation read model + operator workbench** — `POST /reservations`,
  richer list (traveler, service-item counts), `GET /reservations/:id` detail,
  `GET /reservations/:id/audit`; a status **board** and a reservation **detail
  workbench** (transitions, service items, documents, audit timeline).
- **B. Escalation + messaging operator surface** — messaging inbox on the
  existing endpoints and the `/conversations` socket; live escalation dashboard
  consuming `/ops` (amber/red, `tel:` click-to-call, one-click re-dispatch via
  the existing reassign endpoint); prove the BullMQ timeout actually fires.
- **C. Compliance module** — `packages/storage` (S3/MinIO) for credential
  uploads, a visual document inspector, and a 30-day expiry job that pauses
  auto-dispatch (§4.5, §8.2).
- **D. Document depth + confirmation workflow** — itemized invoice from service
  items, voucher emergency directory and rendezvous points (§4.4).
- **E. Inventory CMS completion** — delete, availability, media, and storefront
  catalog filters (§4.6).

Wave 2a (payments mock + ADR `0003-payments`, storefront map / dynamic package
builder / recruitment portal / traveler auth / i18n) and Phase 3 (BI, regulatory
reporting, AI) follow only after A–E.

## Consequences

- The back office becomes able to receive, detail, transition, and audit real
  bookings — the prerequisite for every other §4 feature.
- Storefront expansion pauses at the current public catalog; no effort is spent
  on checkout while payments remain blocked (§7.1 / §8.1 open risk).
- `custom_itinerary_payload` and the `PaymentReceipt`, `Review`, `Incident`,
  and `Availability` models gain consumers over increments A–E rather than
  staying dormant.
- The payments decision is renumbered to **ADR 0003** (`docs/adr/0003-payments.md`);
  this ADR takes 0002.

## Open items

- Reservation creation contract: this ADR starts with an **ops-created**
  `POST /reservations`; the storefront dynamic builder will adopt the same
  payload at ITINERARY_SUBMITTED.
- Payments/sanctions decision (`docs/adr/0003-payments.md`) — still unstarted.
- i18n timing: spec §10.3 mandates content isolation; decide before the
  storefront grows.
- `packages/storage` + a scheduled-job runner are new dependencies
  (Article 2) needed for Increment C.
