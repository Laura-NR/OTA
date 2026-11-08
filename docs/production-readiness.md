# Production readiness

- **Updated:** 2026-11-08
- **Reader:** the owner. This is the list of what stands between the platform and real bookings,
  what is still open from earlier sessions, and what only the owner can do, with steps.
- **How to use it:** tick items as they close. The agent's working notes stay in
  `docs/handoff/vereda.md`, and the deployment detail in `docs/deployment-plan.md`. This file
  only points at them.

## 1. Where things stand

- **Built and tested:** the storefront (es/en/fr), the desk (back-office) and the API. That
  covers packages, bookings, wire-transfer payments, documents, email, compliance, retention,
  staff security, analytics and events.
- **Not built:** the mobile apps (worker, traveler, admin), every deployment piece, real legal
  texts and real data.
- **Git:** all work since 2026-10-13 is on `vereda`, ready for a pull request into `main`. The
  owner pushes and opens it; the agent's shell has no GitHub credentials. `main` has nothing
  `vereda` lacks, so merging makes `main` equal to `vereda` with no force-push.

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

- [ ] **A1. Security patch upgrades.** `pnpm audit --prod` on 2026-11-07 found 33 issues, 2
      critical and 11 high:
      - Next.js 15.5.25 → ≥ 15.5.28: remote code execution in image optimisation.
      - Better Auth 1.7.5 → ≥ 1.7.7: an OAuth state usable as a magic link.
      - Zod 4.6.5 → ≥ 4.6.6.
      - High-severity transitives: body-parser, multer, postcss, sharp, vite and others.

      All are patch versions inside existing ranges, so no Article 2 gate. Re-run the audit
      afterwards; anything that needs a major version comes back to the owner.
- [ ] **A2. Deployment build B1–B13** (`docs/deployment-plan.md` §6), all approved, rehearsed
      as a production-like stack on the dev machine before any server exists. B6 (sign-in per
      site) first: today sign-in breaks once the storefront and the desk are on different
      hostnames.
- [ ] **A3. Supplier confirmations.** Only a worker can accept an offer, and there is no worker
      screen yet, so no service item can reach ACCEPTED and work orders cannot name a confirmed
      supplier. The owner chose the worker app (Phase 7, Expo Android). Expo is a new
      dependency, so it needs the owner's yes before the build starts, then a field test with
      two or three suppliers. Fallback if the app is not in field test when the server is
      rented: the small desk "confirmed by phone" action (no dependency).
- [ ] **A4. Mock AI.** The desk's "draft reply" returns canned text from the mock model. Before
      launch, either hide it or wire the provider the owner picks (§6).
- [ ] **A5. Small hardening:**
      - public `GET /catalog` still returns supplier ids;
      - the Socket.IO gateways accept any origin (B7);
      - there is no noindex switch for the trial (B8).
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
- fiscal retention of PDFs.

**Business and finance values (all placeholders today):**
- child bands, the €25 tourist card and the €100 service fee;
- the M4 deposit and cancellation scale: is the share kept taken from what was paid or from
  the total?
- the 48 h payment window, refund limits, card surcharge, deposit refundability and proof
  retention;
- M5 planning fee, validity and response hours;
- custom-builder rates and the M10 concierge fee;
- the currency spread (0.6 %), the lock point, whether to show USD, and when to switch
  `FX_RATE_PROVIDER` to `ecb`;
- the crisis playbooks, the OFAC categories, and the backup-power wording (the sample banner
  says every stay has backup power).

**Owner technical choices:**
- raster app icons from Vereda;
- an SMS provider;
- the 25 AGENTS.md §C lines proposed in the handoff (only the owner edits AGENTS.md).

The domain answers the staff email domain and `PASSKEY_RP_ID` (A6).

**Deferred build items:**
- M10 room holds and event photos (need a migration doc);
- the stale-price window from 2026-11-07;
- the desktop cookie banner (covers about 61 % of a 1280 px window);
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

**Step 9: push, review and merge the pull request**
1. Push: `git push origin vereda` from your own terminal, then open
   `https://github.com/Laura-NR/OTA/compare/main...vereda?expand=1` and paste the description
   the agent prepared.
2. Wait until the security patches (A1) are on the branch and CI is green. CI runs on every
   pull request.
3. Review it yourself; Article 9 needs a named human.
4. Add the 25 §C lines from the handoff to AGENTS.md.
5. Merge with **"Create a merge commit"**: `main` then equals `vereda` and keeps its history.
   Squash would fold 487 commits into one; "rebase and merge" rewrites them.
6. Before the merge, the agent graduates the handoff: facts go to AGENTS.md §C (via you),
   decisions to the ADRs, and `docs/handoff/vereda.md` is deleted in the merge.

**Step 10: worker app go-ahead**
1. Approve Expo (a new dependency) when you want Phase 7 to start.
2. Pick two or three suppliers for a field test (ADR 0007).

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

Until then, the mock stays in dev and the draft button must be hidden for launch (A4).
*(Written by Claude, made by Anthropic; weigh the Claude row with that in mind.)*

## 7. Suggested order

1. **Next session:** security patches (A1) and the small hardening (A5). The owner pushes,
   so the pull request's CI runs.
2. **Then:** the deployment build (A2), rehearsed locally, about two to three sessions.
3. **Owner, in parallel:** counsel, business terms, the key backup, the domain steps, the PR
   review.
4. **When the legal entity exists:** accounts, the trial server, real data, the rehearsal;
   start the worker app (A3) early enough to field-test before launch.
5. **Launch:** `docs/deployment-plan.md` §8 go/no-go checklist, then wipe the trial bookings
   (the owner's go).
