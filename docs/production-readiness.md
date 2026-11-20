# Production readiness

- **Updated:** 2026-11-20
- **Reader:** the owner. This is the list of what stands between the platform and real bookings,
  what is still open from earlier sessions, and what only the owner can do, with steps.
- **How to use it:** tick items as they close. The deployment detail is in
  `docs/deployment-plan.md`; what was assumed or never run is in `docs/known-limitations.md`;
  the decisions already taken are in `docs/decision-log.md` and the ADRs. This file only
  points at them.

## 1. Where things stand

- **Built and tested:** the storefront (es/en/fr), the desk (back-office) and the API. That
  covers packages, bookings, wire-transfer payments, documents, email, compliance, retention,
  staff security, analytics and events (with room holds and photos), plus Ops Lite on the
  phone.
- **Built, tested only in a browser:** the worker app (Android, Expo): sign-in, offers, jobs and
  their steps, the SOS, earnings and payouts, documents, vehicle changes, messages and
  updates. It has never run on a phone (§5, step 10).
- **Built, rehearsed locally:** the deployment stack (A2: images, Compose, Caddy, backups, the
  Release workflow). The Release workflow has never run (§5, step 9).
- **Not built:** the traveler and admin mobile apps, real legal texts and real data.
- **Git:** the second pull request from `vereda` into `main` was opened on 2026-11-20. Merge it
  with a merge commit; `main` has nothing `vereda` lacks.

## 2. What the owner decided on 2026-11-08

- **Security patches come first.** They are the next session's first task.
- **Deployment plan:** D1–D24 approved as recommended. Every §6 item marked (approval) is
  approved too: B1 base images, B2 Caddy, B6 sign-in per site, B9 Super Admin bootstrap, B11
  `age`/`rclone` on the server. The plan's status is now Approved.
- **Domain:** `veredaexpeditions.com` is bought, registered **in the owner's name** (plan D2(b),
  the stopgap). It moves to the agency once the legal entity exists.
- **Mailbox:** one mailbox, `info@veredaexpeditions.com`, bought with the domain. More
  addresses get added as needed.
- **Supplier confirmations:** wait for the worker app (ADR 0007). The desk "confirmed by phone"
  action is not built (§3, A3).
- **Counsel and the team:** the owner talks to them and says when the legal entity and its
  documents are ready. Until then, nothing is bought or deployed beyond the domain and mailbox.
- **AI provider:** still open. The suggestions are in §6.

## 3. Production blockers

### A. Agent work, no spend (in order)

- [x] **A1. Security patch upgrades.** *Done 2026-11-08.* `pnpm audit --prod` went from 33
      issues (2 critical, 11 high) to 2: Next.js 15.5.29, Better Auth 1.7.18, Zod 4.6.7, Nest
      12.4.0 and the patched transitives, all inside the existing ranges (Next's own pin on
      postcss is overridden to 8.5.32, the same major).
      - **Decided 2026-11-08:** the 2 left are fixed only in new major versions, both deep
        inside other packages: `deepmerge-ts` 7 → 8 (high, used only by Prisma's command-line
        config loader) and `uuid` 8 → 11 (moderate, used by the spreadsheet library, which
        calls only the unaffected `v4()`). Neither is reachable from a web request. You chose
        to leave both until Prisma and exceljs update them; the audit is re-run each session.
      - **Decided 2026-11-09:** the worker app's Expo tooling brought two more moderate ones,
        `glob` 13 → 14 and `minimatch` 10 → 11, used only by Expo's build-time command line on
        our own files, never in the app or a server. You chose to leave them too until Expo
        updates them.
      - **Decided 2026-11-18:** a fifth, `picomatch` (high, GHSA-fc5q-39xc-vjpf, ReDoS), has
        no patched version yet. It comes only through build and test tooling (Expo's Metro
        bundler, vitest/vite under Better Auth), never a server. You chose to leave it like the
        other four and re-check when a patch ships.
- [ ] **A2. Deployment build B1–B13** (`docs/deployment-plan.md` §6), all approved, rehearsed
      as a production-like stack on the dev machine before any server exists. *2026-11-08:
      B1–B11 and B13 are built and rehearsed on `*.localhost` (B3's workflow first runs on
      your first `v*` tag, after you set the repository variable `DESK_DOMAIN`); B12 is
      optional.*
- [ ] **A3. Supplier confirmations.** Only a worker can accept an offer, and there is no worker
      screen yet, so no service item can reach ACCEPTED and work orders cannot name a confirmed
      supplier. The owner chose the worker app (Phase 7, Expo Android). Expo is a new
      dependency, so it needs the owner's yes before the build starts, then a field test with
      two or three suppliers. Fallback if the app is not in field test when the server is
      rented: the small desk "confirmed by phone" action (no dependency).
      *Started 2026-11-09:* you approved Expo; the first slice is built (`docs/worker-app-plan.md`):
      a worker signs in with a code (by SMS once a provider exists, or read out by the desk from
      the supplier page), sees offers and jobs, and accepts or declines, also with no signal.
      Still to come: the APK on a machine with the Android SDK and the field test with two or
      three suppliers.
      *2026-11-15:* distribution is built (`docs/worker-app-distribution-plan.md`): the download
      page on `app.<domain>`, the in-app update prompt and signed JS updates. Before the first
      release, on the APK machine and the server: runbook "Releasing the worker app" (the
      update signing key and its two backups, the QR, the DNS record, `WORKER_APP_PUBLIC_URL`).
- [x] **A4. Mock AI.** *Done 2026-11-09:* the desk's AI ("Draft with AI" in Messages, the AI
      summary on Reports, translation) now has its own switch, "AI assistant" (Settings ›
      Thresholds › Features, two Super Admins like the other flags). Production also holds it off
      by itself while the assistant runs on the mock model, so its canned text cannot reach a
      launch even if nobody switches it off. Wiring the provider you pick (§6) lifts that hold;
      the switch stays yours.
- [x] **A5. Small hardening.** *Done 2026-11-08:*
      - public `GET /catalog` no longer returns supplier ids;
      - the Socket.IO gateways accept only `TRUSTED_ORIGINS` (B7);
      - `SITE_NOINDEX=1` makes the storefront's `robots.txt` turn crawlers away (B8; the proxy
        header comes with the deploy files).
- [ ] **A6. Domain values in config** once deploying:
      - `PASSKEY_RP_ID=veredaexpeditions.com` (plan D6(a); permanent);
      - `staff.allowedEmailDomains=["veredaexpeditions.com"]`;
      - `MAIL_FROM=no-reply@veredaexpeditions.com`;
      - `OPS_NOTIFY_EMAIL` set to the agency inbox;
      - the manifest's `supportEmail` set to `info@veredaexpeditions.com`.

### B. Owner only

- [ ] Agency legal entity, then accounts in its name (plan D2).
- [ ] Counsel-approved legal texts (§5, step 2).
- [ ] Real catalog, suppliers, packages, departures and tenant values (§5, steps 3 and 6).
- [ ] Hosting, storage and transactional-email accounts, and a password manager (§5, step 5).
- [ ] Review and merge the pull request (AGENTS.md Article 9 needs a named human reviewer).

## 4. Still open from earlier sessions

**Questions for counsel:**
- sanctions and providers (plan §13; ask this one first, because it can change which providers
  are possible, the AI provider included);
- terms (M4/M5), the privacy notice and its processors list;
- the OFAC statement, the consent words and the cookie words (`cookies-analytics@2026-10-28`);
- the events copy and the US note on concerts;
- the M10 supplementary-invoice question;
- the legal basis for desk and server telemetry;
- Plausible data retention;
- fiscal retention of PDFs;
- the documents each supplier category must hold before approval (`REQUIRED_CREDENTIALS`,
  W-Credentials 2026-11-14: a driver's transport licence, technical inspection, liability
  insurance and identity card; a guide's or host's licence and identity card; a translator's
  identity card), and whether a photo of the identity card may be kept (today: none is).

**Business and finance values (all placeholders today):**
- child bands, the €25 tourist card and the €100 service fee;
- the M4 deposit and cancellation scale: is the share kept taken from what was paid or from
  the total?
- the 48 h payment window, refund limits, card surcharge, deposit refundability and proof
  retention;
- M5 planning fee, validity and response hours;
- custom-builder rates and the M10 concierge fee;
- the worker pay rule (5 business days after a job ends, Settings › Suppliers) and the office's
  pay sessions and place (`workerPayouts` in the manifest: Saturdays 10:00–13:00, oficina
  Vedado);
- the currency spread (0.6 %), the lock point, whether to show USD, and when to switch
  `FX_RATE_PROVIDER` to `ecb`;
- the crisis playbooks, the OFAC categories, and the backup-power wording (the sample banner
  says every stay has backup power).

**Owner technical choices:**
- raster app icons from Vereda;
- an SMS provider.

The domain answers the staff email domain and `PASSKEY_RP_ID` (A6).

**Follow-ups waiting on the owner's call (2026-11-20):**
- whether the traveler's payment schedule should also lose the desk's refund note and the
  approval notes (the storefront does not show them; the staff emails are already gone);
- worker app: the silent SMS module (after the APK machine), one shared id for an SOS logged
  from an SMS and the app's own copy;
- worker ↔ desk messages: translation (needs the AI provider), quick replies (need content),
  a push or SMS to the worker when the desk replies (needs a push service or the SMS provider);
- Ops Lite: a push to a closed page (a service worker and a push service), quick replies;
- supplier documents: a retention path (PII review G5) and W-Login's banner.

**Deferred build items:**
- a real screen-reader pass;
- manifest editing beyond the feature flags.

**Bigger deferred items:**
- the TropiPay card rail (needs the agency's legal documents);
- SMS and push;
- the traveler and admin mobile apps;
- PII purge Tiers 2–3;
- the load test (plan D24);
- PDFs on S3 (B12);
- more than one API instance.

**Known issue:** the storefront *dev* server grows to about 8 GB and wedges one accessibility
test. It is dev only, but production `next start` memory has not been measured; the rehearsal
(A2) checks it.

## 5. Owner actions, step by step

**Step 1: deployment plan. Done 2026-11-08.**

**Step 2: one package for counsel**
1. Put together:
   - plan §13 (sanctions first);
   - the `legal` and `content` texts in `tenant/messages/en.json`;
   - the privacy draft, the cookie words and the events copy;
   - the AI provider question (§6).
2. Ask for approved wording with version ids. A wording change creates a new consent version,
   so travelers are asked again.
3. Hand the approved texts to the agent, who puts them in and marks them `published`.

**Step 3: business terms**
1. Go through "Placeholders to replace before launch" in `tenant/README.md` (§4 above is the
   short version).
2. For each value: keep it, give a new one, or remove it. Many can later be changed by two
   Super Admins in Settings › Thresholds; pricing and policies live in the manifest.

**Step 4: back up the passport key (now)**
1. Open `apps/api/.env` yourself. The agent never reads it.
2. Copy `PASSPORT_ENCRYPTION_KEY` and `AUTH_SECRET` into a password manager, plus an offline
   copy.
3. Production gets its own, different keys, stored the same way. Losing the passport key makes
   stored passport numbers unreadable for good.

**Step 5: the domain you already own (now)**
1. At the registrar:
   - turn on two-factor sign-in and the registrar (transfer) lock;
   - check its terms don't exclude Cuba-related business (plan D2).
2. Write down the registrar's name and its "change of registrant" procedure, so the domain can
   move to the agency once it exists. For `.com` this is usually free, but it can set a 60-day
   transfer lock; plan it, don't rush it.
3. Leave DNS alone for now. The records (`A` for apex, `desk`, `analytics`; SPF, DKIM, DMARC;
   `CAA`) are set during the first deploy (plan Phase D, step 18).
4. **One SPF record only.** The mailbox provider and the transactional email provider (plan
   D13) both send for the domain, so one SPF record must include both. A second SPF record
   breaks delivery.

**Step 6: mail**
1. The `info@` mailbox is for *receiving* mail (plan D13, "Receiving mail"). Magic links and
   booking emails still need a transactional provider (plan D13(a), e.g. Brevo, Mailjet or
   Scaleway TEM), sending as `no-reply@veredaexpeditions.com`.
2. Once `staff.allowedEmailDomains` is set (A6), every staff member signs in to the desk with
   an `@veredaexpeditions.com` address. Each staff member needs a mailbox or an alias that
   reaches them. Plan the "few extras" with that in mind.

**Step 7: accounts (when the legal entity exists; plan Phase C)**
1. Password manager with two-factor and a second trusted person for recovery.
2. An EU VPS provider:
   - check its terms don't exclude Cuba;
   - run the hourly access test from Cuba (ETECSA mobile data) before committing.
3. Two S3 storage accounts: uploads near the server, backups at a different provider or
   region.
4. The transactional email provider; verify the domain (SPF, DKIM, DMARC). Test delivery to
   Gmail, Outlook and a `nauta.cu` address.
5. Sign each provider's DPA, and keep the list for the privacy notice.
6. Move the domain's registrant to the agency (step 5.2).

**Step 8: real content and data** (4–6 weeks on the trial server; plan Phase F)
1. Manifest values: MINTUR licence, emergency numbers, bank details.
2. The real catalog (CSV/XLSX import exists), suppliers, packages and departures.
3. ES and FR content (only Join exists in Spanish) and destination pages (only Viñales is
   complete).
4. A full booking with a real small wire transfer; check the PDFs; use the desk from Cuba.

**Step 9: merge the pull request and tag the first release**
1. *Done 2026-11-20:* `vereda` pushed and the second pull request opened.
2. Wait until its CI is green. If a check fails, give the agent the failing step's log.
3. Review it yourself; Article 9 needs a named human.
4. *Done 2026-11-20:* the handoff graduated: its lasting facts went into AGENTS.md §C (your
   edit), its traps, open assumptions and decisions into `docs/dev-traps.md`,
   `docs/known-limitations.md` and `docs/decision-log.md`, and `docs/handoff/vereda.md` was
   deleted on the branch.
5. Merge with **"Create a merge commit"**: `main` then equals `vereda` and keeps its history.
   Squash would fold the commits into one; "rebase and merge" rewrites them.
6. Set the repository variable `DESK_DOMAIN` to `desk.veredaexpeditions.com` (Settings ›
   Secrets and variables › Actions › Variables).
7. When CI on `main` is green, tag the merge: `git checkout main && git pull origin main &&
   git tag -a v0.1.0 -m "First release" && git push origin v0.1.0`. Watch the Release workflow
   (its first run) under Actions; never move or reuse a tag. Nothing goes live until
   `deploy/deploy.sh` runs on a server (runbook "Release images" and "Deploy a release").

**Step 10: the worker app on a phone (Phase 7 field test)**
1. A machine with the Android SDK and a JDK for the first APK, with our own signing key backed
   up twice, and the Android id.
2. Before the first release: runbook "Releasing the worker app" (the update signing key and its
   two backups, the QR, DNS for `app.<domain>`, `WORKER_APP_PUBLIC_URL`).
3. Two or three suppliers for the field test (ADR 0007). It covers the checklist in
   `docs/worker-app-plan.md` §8: the receipt's share sheet, background resend, the SOS SMS and
   position, distribution (install from the page, both update kinds, a JS update), messages
   written with no signal, and "Cambiar de vehículo".

**Step 11: analytics.** Plausible runs on the same server (plan D20). The runbook's "Going live"
steps run during the first deploy, not before.

**Step 12: accessibility sign-off.** Someone with NVDA (Windows) or VoiceOver (Mac) walks the
desk and the storefront, using `docs/a11y-desk-manual-pass.md` and
`docs/a11y-storefront-manual-pass.md`.

## 6. AI provider: suggestions (open)

The desk uses AI for three small jobs:
- drafting a reply to a traveler (es/en/fr);
- the operations summary;
- translating a message.

The volume is small: a few hundred calls a month costs cents to a few euros with any provider
below. What decides it is sanctions and data protection, not price.

| Option | For | Against |
|---|---|---|
| **Mistral (France)** | EU company with EU processing by default and a GDPR DPA; good Spanish and French; no US sanctions exposure | Drafting quality a step below the strongest models (judge it on real messages) |
| **Anthropic Claude** (Claude Haiku 5.5 for drafts and translation, Claude Sonnet 5.5 if quality matters more) | Strong multilingual writing; Haiku 5.5 is $0.10 / $0.50 per million tokens | A US company, so the Cuba question goes to counsel first; EU processing only through a cloud platform's EU region (Google Vertex AI), also US-owned |
| Self-hosted open model | No processor | GPU server cost and upkeep far beyond this volume; not recommended |

**Recommendation:** add "may we use a US-headquartered AI provider for Cuba-related travel
messages?" to the counsel package. If counsel says no or isn't sure, pick Mistral. If counsel
says yes, try both on 20 real (anonymised) desk messages and keep the one the desk prefers.
Either way:
- the provider is listed in the privacy notice;
- drafts carry only the reservation context, never passport data;
- wiring it is an approval gate: a vendor SDK is a new dependency, and plain HTTP behind the
  existing `LlmProvider` avoids one.

Until then, the mock stays in dev, and production holds the desk's AI off by itself (A4, built
2026-11-09).
*(Written by Claude, made by Anthropic; weigh the Claude row with that in mind.)*

## 7. Suggested order

1. *Done by 2026-11-20:* security patches (A1), the small hardening (A5), B6, the storefront
   404 page, the deployment build (A2, rehearsed locally) and the worker app's build (A3,
   short of a phone).
2. **Owner, next:** merge the pull request and push the first tag (§5, step 9); then the APK
   machine and the field test (§5, step 10).
3. **Owner, in parallel:** counsel, business terms, the key backup, the domain steps.
4. **When the legal entity exists:** accounts, the trial server, real data, the rehearsal.
5. **Launch:** `docs/deployment-plan.md` §8 go/no-go checklist, then wipe the trial bookings
   (the owner's go).
