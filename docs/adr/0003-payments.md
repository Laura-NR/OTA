# ADR 0003 — Payments: provider-agnostic adapter, mock first

- **Date:** 2026-09-22
- **Status:** Accepted
- **Deciders:** Project founders, lead engineer
- **Context:** `docs/development-plan.md` (§3.1, §7, §9), `OTA - Specifications
  Document` §7.1, `docs/adr/0001-stack.md`, `docs/adr/0002-back-office-priority.md`

## Context

Spec §7.1 defines an invoice-based payment pipeline: the client checks out
without paying, dispatch assembles the booking, and once it reaches
`SECURED_AND_INVOICED` the system generates a secure payment link; funds clearing
moves the booking to `CONFIRMED`, which issues the legal document set. Two rails
are named: open-banking/SEPA (primary) and card with wallets (secondary), with a
TropiPay option.

International settlement for Cuba-nexus transactions is heavily sanctioned. The
development plan (§3.1, §9) records this as the one external blocker and
explicitly sequences the work so it does not block the critical path: build
against a **mock payment adapter** behind a provider-agnostic interface. This ADR
takes effect only after ADR 0002; the earlier draft numbering
(`0002-payments.md`) was reassigned.

The `PaymentReceipt` ledger model already exists in `packages/db` (rail, amount,
currency, status, payout status, gateway reference), so no schema change is
required to record intents and confirmations.

## Decision

**Define a provider-agnostic payment adapter in `packages/payments` and ship a
mock implementation first.**

- `packages/payments` exposes a `PaymentProvider` interface
  (`createIntent`, `parseWebhook`) plus `MockPaymentProvider` and
  `createPaymentProvider`. Core code depends on the interface only; no gateway
  SDK is imported outside this package.
- `apps/api` injects the adapter behind the `PAYMENT_PROVIDER` token
  (`payments.tokens.ts`). The default is the mock; a real rail is a new
  implementation and a config change, not a rewrite.
- **Payment link generation is the event that moves `SECURED_AND_INVOICED` →
  `PENDING_PAYMENT`.** The endpoint stores a `PaymentReceipt` with the gateway
  reference and `PENDING` status. The transition is recorded in the audit log.
- **Confirmation clears funds.** Applying a gateway event sets the receipt
  `PAID` (payout `ACCRUED`) and, via `ReservationsService.transition`, moves the
  booking `PENDING_PAYMENT` → `CONFIRMED`, which triggers best-effort document
  generation. The reservation state machine stays the single source of truth.
- **Until a real provider with signed webhooks is wired, confirmation is an
  authenticated operations action** (`POST
  /reservations/:id/payments/:paymentId/confirm`, `OPERATIONS_ADMIN` /
  `SUPER_ADMIN`). There is deliberately **no public webhook endpoint** yet: an
  unauthenticated "mark this paid" route would be a security hole. The first real
  rail must implement signature verification in `parseWebhook` and only then may
  a public callback route be added.
- **No new third-party dependency** is introduced by this ADR. Provider-specific
  SDKs (Stripe, GoCardless, TropiPay) are added only when a rail is selected and
  cleared, under Article 2.

## Consequences

- Checkout, the payment link, and the `PENDING_PAYMENT → CONFIRMED` flow can be
  built and tested end to end against the mock today, keeping the sanctions
  question off the critical path.
- The `PaymentReceipt` ledger is populated without a migration; the same
  endpoints serve the storefront checkout once traveler auth lands.
- Swapping rails is additive: implement `PaymentProvider`, add it to
  `createPaymentProvider`, set `PAYMENT_PROVIDER`.
- Multi-rail support is already possible: a booking awaiting payment may create a
  second intent (e.g. card after a failed SEPA attempt); each is a receipt.
- Until a real webhook exists, an operator must confirm payments manually — fine
  for the back-office MVP, not for a public storefront launch.

## Rejected alternatives

- **Wire Stripe (or any single provider) now** — premature given the Cuba
  sanctions exposure and lock-in; the plan requires a mock first.
- **A public mock webhook** — an unauthenticated route that marks receipts `PAID`
  is an unacceptable control regression (Article 9).
- **Putting gateway payloads in the domain or schema** — the domain stays pure;
  the ledger stores a reference and status, not provider JSON.
- **A new `Payment` table** — `PaymentReceipt` already models the ledger.

## Open items

- Select the primary rail and obtain legal/sanctions clearance; encode the
  decision here.
- Implement signature verification and a public webhook route for that rail.
- Currency conversion for non-EUR card clients (spec §7.1) at the card gateway.
- Supplier payout settlement flows (the `PayoutStatus` ledger currently accrues
  only).
- A storefront `/checkout/mock/:reference` page once traveler auth exists; the
  mock `checkoutUrl` base is `PAYMENT_CHECKOUT_BASE_URL`.
