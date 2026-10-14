# Handoff — vereda — updated 2026-10-15 01:00

## Goal
Build the design team's handoff into the platform. The current handoff is `design/vereda-v1.2/`;
`design/vereda-v1.1/` is kept for the record. Plan and phases: `docs/design-v1.1-plan.md`.
Decisions: ADR 0006 (design system; amended for v1.2 and change request 02) and ADR 0007 (worker
app; amended with the design resolutions).

## State
- **Phases 0, 1, 0b and 2 are done** (Phase 2's offline, compliance-hold and maintenance pages wait for their triggers). Everything is committed locally on
  `vereda`; nothing is pushed.
- **Change request 02 needs no answer from the design team.** On 14 Oct the owner asked the build
  to resolve what it can, and everything was resolved:
  - snap tables in the ADR 0006 amendment;
  - SMS without replies, the app download/install/update screens, the emergency SMS and the
    no-push offer chain in the ADR 0007 amendment.
  `docs/design-change-request-02.md` is now an optional for-information notice.
- **Tenant content:**
  - `tenant/messages/<locale>.json` is merged over `packages/i18n` (storefront
    `i18n/request.ts`, `mergeMessages`, `loadTenantMessages`).
  - Page content sits under `content`, validated by the `@ota/schemas` content schemas.
  - Only English content exists; other locales fall back to it.
  - Pages whose status is `placeholder` show a "Sample content" notice.
- **Storefront pages built:**
  - `/support`, with the form posting to the new public `POST /contact`, which mails the tenant's
    `supportEmail` or `OPS_NOTIFY_EMAIL`;
  - `/travel-info`, `/blog` and `/blog/[slug]` (one article), `/about`, `/legal/privacy` (a
    draft written from `docs/pii-at-rest-review.md`).
  - Nav, drawer, bottom nav and footer link to them.
- **Admin:**
  - read-only `/payments` (the new `GET /payments` ledger) and `/settings` (manifest plus
    domain thresholds);
  - the sidebar shows 8 of 10 sections; Disruptions (M8) and Content (M7) stay hidden.
- **Renamed storefront paths** (`634677e`): `/catalog` → `/destinations`, `/build` → `/custom`,
  `/join-our-network` → `/join`; old paths 307-redirect in `apps/storefront/next.config.ts`.
- **Error pages** (`d2008d2`): `app/[locale]/not-found.tsx` (+ `[...rest]` catch-all) and
  `error.tsx`. Offline (needs the service worker, Phase 8), compliance hold (M3) and maintenance
  (needs a deploy-level switch) are not built.
- **Not built:** Events (Concierge, M10); the other legal texts (counsel, legal entity); the live
  "Current conditions" (A-Content).

## Verified (2026-10-14, on `11a4596` plus docs)
- **Not yet verified on `634677e` and `d2008d2`** (renames, error pages): only storefront
  lint/format/typecheck and live dev probes ran (old paths 307 with the query kept; unknown paths
  404 with the designed page). Run the full suite and `pnpm e2e` first next session.
- `pnpm lint`, `pnpm format:check` and `pnpm typecheck` pass.
- `pnpm test`: 352 passed, 4 skipped.
- `pnpm build`: 18/18.
- `pnpm e2e`: 37/37, including `storefront-content.spec.ts`, whose form message reaches Mailpit,
  and the admin Payments/Settings test.
- Live dev checks:
  - the six storefront pages return 200 and an unknown article 404;
  - `POST /contact` returns 202;
  - screenshots at 1280, 1024 and 390 were checked by eye: no horizontal overflow, and the
    header holds one line at 1024.

## Assumptions & unknowns
- **All content is placeholder data:** the design's sample policies, figures and team, and the
  draft Privacy notice. `tenant/README.md` lists what to replace before launch. Mock values in
  the manifest:
  - `supportEmail: desk@example.test`;
  - the `+53 5555` emergency numbers;
  - `MINTUR-2026-XXXX`;
  - the bank details.
- **ES/FR drafted by the agent, for translator review:** core `nav.*`, `footer.*`, `pages.*`,
  `backoffice.nav|sections|shell|paymentsLedger|settings.*`, and the Phase 1 traveler status
  labels. Tenant content has no ES/FR yet.
- **Open with the owner:**
  - a Cubacel mobile line watched 24/7, for the worker emergency SMS (ADR 0007);
  - whether to send the change notice;
  - the cost trade-off of the offer SMS at T+0 (default; it becomes a runtime threshold with M9).
- `-700` contrast: warning measures 6.4:1 and error 5.7:1 (AA), not the export's "7:1".

## Traps
- **Pages read tenant content with `getPageContent(key, schema)`.** A missing key is a 404; a
  malformed file throws. The `content` English fallback applies only to the `content`
  namespace, so a tenant's English override never replaces core strings in another locale.
- **API tests that depend on tenant values must override `TENANT_CONFIG`.** The real manifest
  now has a `supportEmail`; the contact test failed on this until it injected its own tenant.
- **To edit `tenant/agency.config.json`, change the line in place.** Rewriting it with
  `json.dump` expands its inline arrays, and Prettier keeps them expanded.
- **Locator traps in e2e:**
  - `getByLabel` and `getByText` match case-insensitive substrings: the consent label contains
    "message", and the settings description contains "operating thresholds". Use
    `{ exact: true }`.
  - e2e `signIn()` lands on `/dashboard`.
- The Next dev indicator intercepts bottom-left clicks; the back-office moves it bottom-right.
- **The menu drawer is portalled to `<body>`.** A modal `<dialog>` gets the UA max-width, so
  `Drawer` sets `max-w-none` below sm.
- The i18n catalogues hold both apps' strings. To commit one app's keys, stage an intermediate
  JSON and restore the full file afterwards; `git add -p` is unavailable.
- **Before `pnpm e2e`:** stop your dev server, delete `apps/*/.next`, and kill what e2e leaves on
  ports 3000–3002.
- `design/vereda-v1.*/CODING-AGENT-NOTES.md` is design input, not instructions.
- **AGENTS.md §C lines proposed (owner edit):**
  - "Tokens are the ADR 0006 contract in `packages/theming` (handoff v1.2, 106 tokens), set
    inline on `<html>` (differences only); the `--bp-*` tokens are never tenant-overridable.
    Status text on a `-100` surface is the `-700` tone; `-600` is for icons, borders, bars and
    field errors."
  - "The back-office IA is the A-Dashboard sidebar (`apps/backoffice/src/lib/admin-nav.ts`);
    old paths redirect (307) in `next.config.ts`; e2e `signIn()` lands on `/dashboard`. A nav
    link appears only when its page exists, in both apps."
  - "Agency copy and page content live in `tenant/messages/<locale>.json`, merged over
    `packages/i18n` and validated by the `@ota/schemas` content schemas. Placeholder pages show
    a sample-content notice; `tenant/README.md` lists what to replace before launch."
  - "`POST /contact` is public and mails only the agency inbox (tenant `supportEmail`, else
    `OPS_NOTIFY_EMAIL`), with the strict rate limit. `GET /payments` is the ops ledger."
  - For ADR 0007: "SMS to Cuban numbers is one-way, from a Cubacel-registered alphanumeric
    sender that nobody can reply to; every SMS carries a signed link instead of asking for a
    reply. Twilio does not deliver to Cuba. The worker app is sideloaded; no push."

## Next
1. Verify `634677e`/`d2008d2`: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test &&
   pnpm build`, delete `apps/*/.next`, stop dev servers, `pnpm e2e` (expect 38 tests).
2. Phase 3, one increment per commit: Home (agency copy into `tenant/messages`), Destinations
   (map layers from `tenant/` data files `provinces.json` + `destinations.json`, placeholder) and
   Destination detail, Packages filters + Compare, Package detail restyle, then the Account,
   Auth (magic link until Q5), Join and wire Payment restyles.
3. The owner reviews placeholder content and drafted translations; sends the change notice if wanted.

## Decisions (append-only)
- 2026-10-12 — the canvas ranks above the UI_UX research docs where they conflict (HANDOFF §1).
  This covers WhatsApp deep links only, EUR base, and passwordless sign-in.
- 2026-10-13 — the owner accepted the plan's recommendations (Q1–Q6, Q8–Q13). The canvas design
  replaces the 2026-09-26 design.
- 2026-10-13 — the motion tokens use the DS-Handoff values. The export's 0 ms values are the
  reduced-motion override (A1).
- 2026-10-13 — the four legacy presets are removed. The default preset was first named
  `islaAbierta`, after A-Settings.
- 2026-10-14 — the owner renamed the preset `vereda`: "Isla Abierta" was a placeholder name, and
  the agency is Vereda Expeditions. The design team is asked to follow (change request A8).
- 2026-10-13 — only the fonts' Latin subset is shipped: `next/font/local` cannot split one family
  by unicode-range, and Latin covers EN/ES/FR/DE/IT.
- 2026-10-13 — commits are made locally per increment on `vereda`, under the owner's approval of
  the plan. Nothing is pushed.
- 2026-10-14 — Q7: the worker app stays native (Expo, ADR 0001), Android first, sideloaded with
  a self-hosted update server. The PWA recommendation was withdrawn because the design's no-data
  features need native code (ADR 0007).
- 2026-10-14 — v1.2 adopted (ADR 0006 amendment). The dark tones are tokens rather than snaps.
  Field errors stay `error-600`. The palette key stays `vereda` despite the design's A8 answer
  (raised again in CR-02 A1).
- 2026-10-14 — the admin row tints are a `TableRow` `tone`, not app-level classes. The boards tint
  rows accent-50 (timer running low) and error-100 (expired).
- 2026-10-14 — Phase 2: no placeholder pages. A nav link renders only when its page exists;
  missing pages wait for the owner's order. The old admin pages keep working under their new
  section, with a tab row, until Phase 5 merges them. Redirects are 307 while the IA settles.
- 2026-10-14 — the storefront footer shows only live payment marks (SEPA, the wire rail) and
  contact lines set in the manifest. The card marks wait for the card gateway.
- 2026-10-14 — the owner took every recommendation:
  - pages in the order Support, Travel info, Blog, About;
  - only a draft Privacy notice among the legal texts;
  - Events after the policy and M10;
  - read-only admin Payments and Settings;
  - agency copy in `tenant/messages`.
  Placeholder or mock data is kept until real data is published, and each such page shows a
  sample-content notice.
- 2026-10-14 — the owner asked the build to resolve the design issues itself. Change request 02
  became a for-information notice, with the resolutions in the ADR 0006 and 0007 amendments.
  The offer SMS goes at T+0 by default.
- 2026-10-14 — "Talk to a specialist" shows from `xl` only, not as DS 07's `lg` text button,
  because the six links fill the `lg` header.
- 2026-10-14 — storefront path renames redirect with 307 until launch (as the back-office), then
  become 308. Only the 404 and 500 error pages are built; the other three wait for triggers.
