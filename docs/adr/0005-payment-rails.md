# ADR 0005 — Payment rails: wire transfer primary, TropiPay card next

- **Date:** 2026-09-25
- **Status:** Accepted
- **Deciders:** Project owner, lead engineer
- **Context:** `docs/adr/0003-payments.md`, `OTA - Specifications Document` §7.1,
  `packages/payments`, `packages/config`

## Context

ADR 0003 put a provider-agnostic `PaymentProvider` interface and a mock in
place, and deliberately deferred real rails until a provider and its
Cuba-sanctions clearance were confirmed. The owner has now chosen the operating
model: **manual wire transfer is the primary rail**, and **TropiPay** is the
card rail for travelers who prefer to pay by card. Other rails should be
additions, not a rewrite. No payment secrets exist yet.

Spec §7.1 names open-banking/SEPA as the primary rail and a card gateway as the
secondary. A manual bank transfer satisfies the primary intent (account-to-
account settlement) without a gateway or sanctions exposure, and is legal to
operate today. The manifest already carries `features.directBankTransferRail`
and `features.creditCardGatewayRail`.

## Decision

**Make wire transfer the primary rail now, keep card on the mock, and structure
provider selection by rail so TropiPay is a drop-in later.**

- **Rail -> provider map.** `packages/payments.createPaymentProviders()` returns
  a `Record<PaymentRail, PaymentProvider>`: `OPEN_BANKING_SEPA`/`OTHER` ->
  `BankTransferProvider`, `CARD` -> the mock until a real card gateway is wired.
  The API injects the map behind the `PAYMENT_PROVIDERS` token and resolves by
  the request's rail, so adding a rail is one map entry plus one adapter.
- **Wire transfer has no gateway.** `BankTransferProvider.createIntent` returns
  a `wire_<uuid>` reference and a storefront `/checkout/wire/<ref>` URL carrying
  the booking reference, amount, and currency for display. The traveler pays
  from their own bank; an authenticated operations user confirms the receipt
  through the existing `POST /reservations/:id/payments/:paymentId/confirm`.
  There is **no public callback** for this rail.
- **Bank details are tenant data.** The agency's account name, bank, IBAN, BIC,
  and reference wording live in the tenant manifest under `payments.bankTransfer`
  (`packages/config` schema), so core never imports `tenant/`. A fork points the
  wire page at its own account by editing `tenant/agency.config.json`.
- **No new dependency, no public webhook.** The mock and wire rails share a
  manual-confirmation parser; real gateways must implement signature
  verification in their own `parseWebhook` before a public route is added
  (ADR 0003 still holds).
- **TropiPay is the next rail.** It is card-only, uses app
  `clientId`/`clientSecret` credentials, a create-payment-card call returning a
  `shortUrl`, and `urlNotification` callbacks, with separate development and
  production environments. It will be implemented behind the same interface once
  the account and webhook verification details are confirmed.

## Consequences

- Travelers can pay legally today by bank transfer, and operations confirm
  receipt exactly as with the mock; the state machine and document generation is
  unchanged (payment link -> `PENDING_PAYMENT`, confirmation -> `CONFIRMED`).
- The storefront's "Proceed to payment" already requests `OPEN_BANKING_SEPA`, so
  it now lands on the wire-instructions page; the back-office rail picker still
  offers card (mock) and SEPA (wire).
- The `PAYMENT_PROVIDERS` map is the single extension point; a new rail does not
  change `PaymentsService` beyond the map.
- The mock stays the default for the card rail and for tests, so existing
  mock-based tests remain valid.

## Open items

- **TropiPay onboarding (owner):** create a TropiPay account and, under App
  Menu -> Applications and credentials, an app; provide `TROPIPAY_CLIENT_ID` and
  `TROPIPAY_CLIENT_SECRET` (dev first). Confirm the dev/production API base URLs
  and whether `urlNotification` callbacks are signed; if unsigned, verify each
  callback by re-querying the payment card via the authenticated API instead of
  trusting the body.
- Card currency/FX for non-EUR clients (spec §7.1) at the card gateway.
- Supplier payout settlement flows (`PayoutStatus` currently accrues only).
- A public webhook route is added only with the signature-verified TropiPay
  `parseWebhook`, per ADR 0003.

## Rejected alternatives

- **GoCardless/SEPA API as the primary rail now** — not selected; the owner
  chose manual wire transfer to operate legally today.
- **Wire transfer as a mock variant** — the mock implies a gateway; a distinct
  provider with a distinct checkout page and no callback is clearer and safer.
- **Embedding bank details in `.env`** — agency-specific data belongs in the
  tenant manifest, not core configuration.
- **A public webhook route for the mock/wire rails** — an unauthenticated route
  that marks receipts `PAID` is an unacceptable control regression (ADR 0003).
