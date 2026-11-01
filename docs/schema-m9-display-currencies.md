# M9 display currencies: policy and schema diff for review

**Status:** **Approved 2026-11-01 as recommended (C1a–C7a, with the migration; C3a with the ECB
reader built but off).**
**Date:** 2026-11-01
**Scope:** the display currencies deferred in `docs/schema-m9-settings.md` D7 ("Currencies stay
EUR only in M9 … display currencies become their own batch"), which Settings › Currencies &
languages still names as a later batch. The owner picked them on 2026-11-01. They need a
migration (AGENTS.md Article 2) and touch how money is shown, so nothing is built before this is
approved. They build on the operating settings document (two Super Admins per change), the
payment schedule (M4), the invoice (`packages/documents`) and the storefront's `formatMoney`
(`apps/storefront/src/lib/format.ts`).

**What does not change:** prices, instalments, receipts, refunds, invoices and the ledger stay in
EUR. Every amount charged is EUR. A display currency is an indicative figure next to (or, while
browsing, instead of) the euro amount; Legal 3.1 already reads "where another currency is
displayed it is indicative".

## 1. What the boards ask, and what exists

| Board | Today | Where it lands |
|---|---|---|
| A-Settings › Currencies: "Base EUR (billing, invoices, ledger). Display currencies convert at the ECB daily rate plus the spread; the rate locks at deposit for the whole payment schedule." Table: EUR base · locked 1.0000; USD 1.0870 · +0.6 %; CAD 1.4802; GBP 0.8431; CHF 0.9354 (off); "Shown to"; an on switch per row | One card: "EUR only" | The board's table on the tab; the switches, spread and lock point as thresholds (C2, C5, C6) |
| A-Settings: "Rate source: ECB reference · daily 16:00 CET \| Gateway rate" | Nothing | A rate provider behind an interface, mock by default (C3) |
| A-Settings: "Spread 0.6 %", "Absorb rounding under € 0.50", "Lock rate at: Deposit payment (BR-CU-02) \| Invoice" | Nothing | Spread and lock point built (C5, C6); the rounding tolerance deferred (§4) |
| DS-Actions-Forms / DS-Handoff: a currency menu (listbox, `currency_changed`) beside the language links; "Prices round up to the whole unit; rate locked at deposit; show 'Prices set in EUR' when another currency is displayed" | Language links only | A currency menu in the header and the mobile drawer (C7) |
| Account / M-Account › Language & money: "Display currency EUR € · prices are set in EUR · CAD $ · USD $ · GBP £" | Language only | A saved preference for a signed-in traveler (C4) |
| Payment / M-Payment: "Charged in EUR (≈ CA$ … at today's rate; your bank sets the final rate)"; Account: "Rate locked at deposit." | EUR only | "≈" lines on the payment and schedule surfaces, from the locked rate once there is one (C6, C7) |
| D-Invoice: "Prices in EUR. Reference in CAD at the ECB rate of 12 Oct (1.4802): CA$ 4,588.62. The rate locks at the deposit for the whole schedule." | EUR only | One reference line on the invoice when the booking has a non-EUR locked rate (C7) |
| E-Invoice / E-Received: "about CA$ 918 · rate locks at payment" | EUR only | Deferred (§4) |
| T-Events: `currency` on every event; `locale_changed` with `kind: currency` | `currency` is always EUR (ADR 0006 "until display currencies (M9 D7)") | The visitor's display currency; the menu sends `locale_changed` kind `currency` (C7) |

## 2. Data changes (this is why it is Article 2)

- **One new table:** `exchange_rates` (§6): one reference rate per day and currency, with its
  source. Nothing is backfilled; the first daily run (or the first read) writes today's rows.
- **One new nullable column on `users`:** `display_currency` (a signed-in traveler's choice).
- **Four new nullable columns on `reservations`:** `display_currency`, `display_rate`,
  `display_rate_date`, `display_rate_locked_at` (the lock, C6). Existing bookings stay null: they
  show EUR only.
- **New keys in the operating settings document** (JSON, no migration; older versions read the
  defaults): one switch per display currency, the spread, the lock point.
- **One new cookie:** `ota_currency` (essential, a display setting; the cookie banner's
  "Essential" text already names "display settings").
- **Dependencies:** none. The ECB reader (C3) would be plain `fetch` and a small XML read.
- **Routes:** one public read of the enabled currencies and today's rates, one traveler write of
  the preference. Both go in the RBAC matrix.

## 3. Decisions (options and recommendation)

**C1 · What a display currency changes.**
(a) **Browsing shows the converted price; anything payable shows EUR first.** Cards, package
pages, the compare table, the builder's estimate and event prices show the display currency,
rounded up to the whole unit (DS-Handoff), with "Prices set in EUR" beside them. The booking
total, the payment schedule, the payment and wire pages and the confirmation show the euro amount
with "≈ CA$ 918" after it.
(b) EUR first everywhere, "≈" after it on every surface.
(c) The converted amount everywhere, payable surfaces included.
**Recommend (a).** It is what the boards draw (the menu changes browsing prices; Payment reads
"Charged in EUR (≈ CA$ …)"). (c) would show the traveler an amount they are not charged.

**C2 · Which currencies, and who sees which by default.**
(a) **EUR (base, always on) plus USD, CAD, GBP and CHF, each with a switch; USD, CAD and GBP on,
CHF off, as drawn.** A visitor who has not chosen sees the currency of their browser language's
region (en-US → USD, en-CA/fr-CA → CAD, en-GB → GBP), and EUR otherwise. Ireland and every
euro-area region get EUR, as the board's "UK, Ireland (EUR)" says. No geo-IP.
(b) As (a), but USD is the fallback for unknown regions (the board's "default fallback").
(c) Always EUR until the visitor picks one.
**Recommend (a).** The agency charges in EUR and settles outside the US banking system; an
unknown visitor seeing euros is the least surprising default, and region detection reuses the
`Accept-Language` header next-intl already reads. Counsel may want to look at showing USD at all
(the sanctions notice); the switch makes that a settings change, not a deploy.

**C3 · Where the rates come from.**
(a) **A `RateProvider` interface with a mock as the default** (the board's sample rates, the same
every day), as ADR 0006's Q10 rule requires for every third party. An ECB reader (the public
daily reference XML; no account, no key, no money) is built behind the same interface and
selected only by `FX_RATE_PROVIDER=ecb`; dev and e2e stay on the mock. It is tested against a
saved sample of the XML and never called by the test suite.
(b) Mock only; the ECB reader is a later batch.
(c) The gateway's rate. There is no live gateway (TropiPay is deferred), so this cannot be built.
**Recommend (a).** Switching to real rates later is then one env variable. If you would rather
the code never fetch a third party until Q10 is settled, (b) costs one later batch.

**C4 · Where the choice is kept.**
(a) **A cookie, `ota_currency`, for everyone; a signed-in traveler's choice is also saved on the
user** (`users.display_currency`) and wins over the cookie, so it follows them to another device.
Saved from the header menu and from Account › Language & money.
(b) Cookie only.
**Recommend (a).** The Account board draws the preference as part of the profile, and C6's lock
reads it when the deposit arrives (a cookie is not there on a desk-confirmed transfer).

**C5 · Rates, the spread and staleness.**
(a) **`exchange_rates` keeps one reference rate per currency per day** (units per 1 EUR), written
by a daily job (BullMQ, 16:30 Europe/Madrid, after the ECB's 16:00 publication; a Noop without
Redis, as the other scans) and by the first read of a day that has none. The rate shown is the
reference × (1 + spread). The spread is a threshold, `fxSpreadPercent`, default 0.6, from 0 to
3 in steps of 0.1. The latest row is used; when it is more than 5 days old (the ECB skips
weekends and holidays), the storefront shows EUR only rather than an old figure.
(b) No table: the provider's answer is cached in memory. The invoice's "ECB rate of 12 Oct"
and the desk's "Rate today" would then have no history, and every API process would ask the
provider on its own.
**Recommend (a).**

**C6 · The lock (BR-CU-02).**
(a) **When the booking's first payment is confirmed (the deposit, or the full amount), the
booking stores the traveler's display currency, the rate shown that day (with the spread) and the
rate's date.** From then on every "≈" for that booking (remaining instalments, the invoice, a
refund) uses that rate, and the page says "Rate locked on 14 Oct". Before the lock, the booking
shows today's rate with "rate locks at the deposit". A traveler whose display currency is EUR
locks nothing. The lock point is a threshold, `fxLockAt`, `DEPOSIT` (default) or `INVOICE` (when
the payment link is created), as the board's segmented control draws. A lock is never changed.
(b) As (a), with the lock point fixed at the deposit in code.
**Recommend (a).** The board draws the choice, the thresholds document already handles two-Super-
Admin changes, and the default is the board's selection. Because every charge is EUR, the lock
fixes only the indicative figure; Payment's "your bank sets the final rate" stays on the card
surface. Finance should confirm the 0.6 % spread and the lock point; both are placeholders until
then and changeable without a deploy.

**C7 · Where it shows.**
(a) **Storefront:** a currency menu in the header (desktop, beside the language links) and in the
drawer (mobile, as DS-Mobile-Patterns draws), Account › Language & money, the browsing prices
(C1), the "≈" lines on payable surfaces, and the analytics `currency` field.
**Desk:** Settings › Currencies & languages shows the board's table (role, today's rate with the
spread and its date, the default regions, on or off), the rate source and the lock point; the
switches, spread and lock point are changed on Thresholds with the other two-Super-Admin values
(as the new-device switch was). A booking's payments card shows its locked rate.
**Documents:** the invoice's reference line (D-Invoice) when the booking has a non-EUR lock.
en/es/fr throughout.
(b) As (a), plus the "about CA$" lines in the invoice and received emails.
**Recommend (a).** The emails are worth doing once the boards' email copy is reviewed; they are a
small follow-up on the same data.

## 4. Deferred, and why

- **"Absorb rounding under € 0.50"** (A-Settings, G-Money): a reconciliation tolerance for a
  transfer that arrives slightly short after the traveler's bank converts it. Operations confirm
  transfers by hand today and no received amount is recorded, so there is nothing for it to
  decide yet; it belongs with real rails (ADR 0003/0005).
- **"Gateway rate" as a source:** no live gateway (C3c).
- **The emails' "about CA$" lines** (C7b).
- **Charging in another currency:** never asked for; every board charges EUR.

## 5. What lands once approved

- `@ota/domain` (`packages/domain/src/money/display-currency.ts`): the currency list and its
  default regions, `defaultDisplayCurrency(acceptLanguage)`, `displayRate(reference, spread)`,
  `convertForDisplay(eur, rate)` (rounded up to the whole unit), `isRateStale(date, now)`,
  `lockDue(fxLockAt, event)`. Unit tests for each, including the round-up and the 5-day rule.
- Thresholds: `displayCurrencyUSD`, `displayCurrencyCAD`, `displayCurrencyGBP`,
  `displayCurrencyCHF` (switches), `fxSpreadPercent`, `fxLockAt`; schema bounds in
  `@ota/schemas`; the fields on Thresholds in en/es/fr.
- `@ota/schemas`: the public rates DTO, the preference body, the booking's locked-rate fields on
  the traveler and desk reservation DTOs (optional, additive).
- API: `RateProvider` (mock + ECB reader) behind an `FX_RATE_PROVIDER` token in its own tokens
  file; the daily job; `GET /catalog/currencies` (@Public: enabled currencies, today's display
  rates and their date, or none when stale); `PUT /me/display-currency` (any signed-in role;
  audited as `user.display_currency_changed`); the lock in the payment confirmation (and in
  payment-link creation under `INVOICE`), in the same transaction, audited as
  `reservation.display_rate_locked`. Both routes in the RBAC matrix.
- Storefront, desk and invoice surfaces as C7(a). e2e: pick CAD in the header and see a card's
  price and "Prices set in EUR"; save it in Account; confirm a deposit and see "Rate locked" on
  the booking and the desk.
- Also in the batch (no migration): Administrative Support no longer sees actions the API
  refuses on the customers pages (the certification reminder on a customer's page) unless a
  `customers` override is running.

## 6. The diff

```prisma
/// M9 C5: one reference rate per day and currency (units per 1 EUR), before the spread.
model ExchangeRate {
  id        String   @id @default(uuid()) @db.Uuid
  rateDate  DateTime @map("rate_date") @db.Date
  currency  String   @db.Char(3)
  rate      Decimal  @db.Decimal(12, 6)
  /// "mock" or "ecb".
  source    String
  fetchedAt DateTime @default(now()) @map("fetched_at")

  @@unique([rateDate, currency])
  @@index([currency, rateDate])
  @@map("exchange_rates")
}

model User {
  // …
  /// M9 C4: the traveler's display currency; null follows the cookie or the default.
  displayCurrency String? @map("display_currency") @db.Char(3)
}

model Reservation {
  // …
  /// M9 C6: the display currency and rate (spread included) locked at the deposit or invoice.
  displayCurrency     String?   @map("display_currency") @db.Char(3)
  displayRate         Decimal?  @map("display_rate") @db.Decimal(12, 6)
  displayRateDate     DateTime? @map("display_rate_date") @db.Date
  displayRateLockedAt DateTime? @map("display_rate_locked_at")
}
```

Migration name: `display_currencies`. Additive and nullable; no backfill, no data change.

## 7. As built

(Filled in after the build.)
