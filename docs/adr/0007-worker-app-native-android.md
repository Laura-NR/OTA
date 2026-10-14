# ADR 0007 — Worker app: native Android (Expo), sideloaded, with Cuba's SMS rules

- **Date:** 2026-10-14
- **Status:** Accepted
- **Deciders:** Project owner, lead engineer
- **Context:** `docs/adr/0001-stack.md` (Mobile: Expo React Native + expo-sqlite), spec §5 and
  §7.2, `docs/design-v1.1-plan.md` Q7 and Q10, design boards W-* (`design/vereda-v1.1/project/`),
  research `UI_UX - 11` and `UI_UX - 14`

## Context

The design plan reopened ADR 0001's mobile choice (Q7). The UI_UX research argues for a
PWA-first approach: app stores are restricted for Cuba, Google push (FCM) is unreliable there,
and a native app costs mobile data. Two things decided it the other way:

- The ADR's own reason, "PWA-only mobile — insufficient offline and push guarantees for field
  work", still holds.
- The design relies on what only a native app can do. W-Job's emergency button sends the
  worker's location by SMS without mobile data. Spec §7.2 resends queued actions from a
  background worker when the connection returns.

A phone-originated SMS to a Cuban number is domestic, so Cubacel's rules for international
senders do not apply to it.

Research on 2026-10-14 also established the rules for SMS sent *to* Cuban phones by any
platform (sources at the end):

- **Sender.** An alphanumeric sender ("Vereda") must be registered with Cubacel. Registration
  takes about 60 days to 6 months, and the company name must match the sender. The form asks
  for the CEO's nationality and passport, so it needs the legal entity.
- **Traffic.** Only notification and one-time-code traffic is allowed. Banks, fintechs and
  e-wallets are rejected.
- **Format.** Messages are one-way (recipients cannot reply) and should fit one 160-character
  GSM-7 segment.
- **Providers.** Twilio stopped delivering to Cuba on 15 September 2025.

## Decision

**Keep ADR 0001's choice for the worker app: Expo React Native, Android first.** Expo is
approved as a dependency for it. Pin a release at least two weeks old when it is added
(Phase 7).

- **Device-side control in native code.** The app sends SMS from the worker's phone (the
  emergency location; optionally accept or decline when there is no data), runs background
  resend of the `sync_queue` (spec §7.2), and stores data offline in SQLite. Expo's standard
  `expo-sms` only opens the composer, so silent sending, reading the sign-in code and any
  background connection need custom Android modules in an Expo development build.
- **Distribution outside the stores.**
  - Approved workers receive a link, by SMS and email from the A-Suppliers approval, plus a
    QR code at the Havana desk. The link opens a Spanish download page on `vereda.travel`
    that shows illustrated install steps (including what the "unknown app" warning looks
    like), the version, the size and the signing-certificate fingerprint.
  - The page serves split-ABI APKs (arm64 by default, 32-bit for older phones) and supports
    resumable downloads.
  - Phone-to-phone sharing is expected; Android installs an update only over the same
    signature.
- **Updates.** The app checks a version endpoint and offers new APKs in the app. JavaScript-only
  changes ship through `expo-updates` from a self-hosted update server, not EAS Update. Builds
  run on our own machines, not EAS Build. The signing key is backed up in two places; losing it
  forces every worker to reinstall and lose offline data.
- **Server-to-phone SMS** (the sign-in code, the reminder for an unanswered offer) goes
  through a non-US provider behind a channel interface with a console mock, with a second
  provider as failover.
  - Shortlist: LINK Mobility, Messente or Bird. Aggregators such as Messaggio and BudgetSMS
    are fallbacks.
  - The owner tests providers with real Cuban numbers and starts sender registration as soon
    as the legal entity exists.

## Consequences

- **Design.** The design assumed store distribution ("store assets"). The download page, the
  install steps and the in-app update prompt are not drawn yet; that is a change-request item.
  The traveler flows that ask for an SMS reply (S-Messages: morning check-in "Reply OK", payment
  "Reply HOLD", disruption "reply A/B/C/D") cannot work on Cuban SIMs, including the CubacelTur
  tourist SIM. They need signed links plus the desk call; that is also a change-request item.
- **Ops Lite** (staff) can stay phone-sized screens in the back-office, which already has their
  sign-in, roles and sockets. The traveler companion starts as the mobile web (M-*), as the
  design says.
- **Open items:**
  - Google's developer verification. It has been enforced since 30 Sep 2026 in Brazil,
    Indonesia, Singapore and Thailand, and is announced for all apps on certified Android
    devices in 2027. Register Vereda as a verified developer once the legal entity exists;
    whether Google verifies a developer whose app is used in Cuba is unconfirmed.
  - iPhone workers cannot sideload. Either require Android or give them a reduced web
    fallback; the share is to be measured.
  - Apklis (Cuba's store) reportedly needs a Cuban national ID and would need a partner and a
    legal check. It is optional.
  - A field test with two or three workers (install, offline queue, SMS delivery time) comes
    before building all W-* screens.

## Rejected alternatives

- **PWA for the worker app** (the plan's first recommendation). It is lighter to ship and
  update, but it cannot send the worker's own SMS or resend in the background, both of which
  the design relies on.
- **Google Play distribution.** It is not reachable for Cuban workers.
- **EAS Build, EAS Update and Expo push.** They are US-hosted services, which raises a sanctions
  question for a Cuba-facing app. The same work runs on our own machines.

## Sources (read 2026-10-14)

- Twilio Cuba guidelines: https://www.twilio.com/en-us/guidelines/cu/sms
- LINK Mobility, Cuba sender ID (updated 30 Apr 2026): https://docs.linkmobility.com/regulatory-guidelines/sender-id/cuba
- Bird, Cuba destination: https://bird.com/products/sms/destinations/cuba
- Plivo, Cuba coverage: https://www.plivo.com/sms/coverage/cu/
- Telnyx, Cuba guidelines: https://support.telnyx.com/en/articles/6665126-cuba-sms-guidelines
- ClickSend, Cuba (+53): https://help.clicksend.com/article/7ax8gictom-cuba-53
- Messente, Cuba regulations: https://support.messente.com/cuba-sms-regulations
- Android developer verification: https://developer.android.com/developer-verification
- Apklis (older reports): https://www.cubanet.org/apklis-nueva-plataforma-aplicaciones-cubanas-pretende-competir-google-play/
