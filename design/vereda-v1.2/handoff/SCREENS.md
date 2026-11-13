# Screens · Vereda Expeditions · Handoff v1.2 · 14 Oct 2026

119 artboards on 9 pages, 865 prototype links. Generated from `project/canvas.json` and the boards by `tools/screens_build.py`; the same data is in `screens.json` (with the full link lists and tweak names). Kind: page = fluid, designed at 1280 px; phone = 390 × 844; fixed = print, email, card or sheet. Links = screens this board navigates to.

## 01 Design system · 7 boards

| file | kind | size | title | links to | tweaks |
|---|---|---|---|---|---|
| `Main.dc.html` | page (fluid) | 1280 × 3360 | 01 Foundations | — | — |
| `DS-Actions-Forms.dc.html` | page (fluid) · interactive | 1280 × 3280 | 02 Actions & forms | — | — |
| `DS-Feedback-Nav.dc.html` | page (fluid) · interactive | 1280 × 3720 | 03 Status, feedback & navigation | — | — |
| `DS-Cards-Content.dc.html` | page (fluid) | 1280 × 3900 | 04 Cards, content & commerce | — | — |
| `DS-Mobile-Patterns.dc.html` | page (fluid) | 1280 × 2900 | 05 Mobile, offline & responsive | — | — |
| `DS-Handoff.dc.html` | page (fluid) | 1280 × 3400 | 06 Developer handoff | — | — |
| `DS-Responsive.dc.html` | page (fluid) | 1280 × 3000 | 07 Responsive behaviour · what moves at each width, admin and app rules, tablet decision, test matrix | A-Dashboard, A-Package-Edit, A-States, AL-Alerts, Booking, Destinations, E-Invoice, G-Sync, Home, Package, Packages, … | — |

## 02 Customer · Web · 22 boards

| file | kind | size | title | links to | tweaks |
|---|---|---|---|---|---|
| `Home.dc.html` | page (fluid) | 1440 × 4560 | Homepage · desktop 1440 | About, Auth, Blog, BlogPost, Compare, Concierge, Custom, Destination, Destinations, Home, Package, Packages, PreTrip,… | primary |
| `Packages.dc.html` | page (fluid) · interactive | 1440 × 2700 | Package listing · filters & compare | About, Auth, Blog, Compare, Concierge, Custom, Destinations, Home, Legal, Package, Packages, PreTrip, Support | — |
| `Package.dc.html` | page (fluid) · interactive | 1440 × 3400 | Package detail · tabs, tiers, departures | About, Auth, Blog, Booking, Compare, Concierge, Custom, Destinations, Home, Legal, Package, Packages, PreTrip, Support | — |
| `Booking.dc.html` | page (fluid) · interactive | 1440 × 2100 | Booking flow · 5 steps + request sent | About, Account, Home, Legal, Package, Payment, PreTrip | model |
| `Payment.dc.html` | page (fluid) · interactive | 1440 × 2200 | Payment · 4 rails, pending, failed, success | About, Account, Confirmation, Home, Legal | — |
| `Confirmation.dc.html` | page (fluid) · interactive | 1440 × 2200 | Confirmation · next steps, documents, CSAT | About, Account, Blog, Concierge, Destinations, Home, Legal, Packages, Payment, PreTrip, Support | — |
| `Custom.dc.html` | page (fluid) · interactive | 1440 × 2300 | Custom itinerary builder · 5 steps + proposal requested | About, Account, Home, Legal, Packages, PreTrip | — |
| `Destinations.dc.html` | page (fluid) · interactive | 1440 × 3250 | Destinations · province map with three layers, panel and route sketching, filters, 14 places | About, Auth, Blog, Concierge, Custom, Destination, Destinations, Home, Legal, Package, Packages, PreTrip, Support | — |
| `Destination.dc.html` | page (fluid) | 1440 × 5300 | Destination detail · Viñales | About, Auth, Blog, BlogPost, Concierge, Custom, Destinations, Home, Legal, Package, Packages, PreTrip, Support | — |
| `Compare.dc.html` | page (fluid) · interactive | 1440 × 2200 | Compare · 2–4 trips, highlight differences | About, Auth, Blog, Booking, Concierge, Custom, Destinations, Home, Legal, Package, Packages, PreTrip, Support | — |
| `Account.dc.html` | page (fluid) · interactive | 1440 × 2000 | Account · overview, trips, documents, messages, payments, prefs | About, Blog, Concierge, Custom, Destinations, Home, Legal, Package, Packages, Payment, PreTrip, Support | — |
| `PreTrip.dc.html` | page (fluid) · interactive | 1440 × 2300 | Travel info hub · conditions, entry, money, health, OFAC | About, Account, Blog, Concierge, Destinations, Home, Legal, Packages, PreTrip, Support | — |
| `Blog.dc.html` | page (fluid) · interactive | 1440 × 2300 | Blog & guides · listing | About, Auth, Blog, BlogPost, Concierge, Destinations, Home, Legal, Packages, PreTrip, Support | — |
| `BlogPost.dc.html` | page (fluid) | 1440 × 3600 | Blog article · Power outages in Cuba | About, Auth, Blog, BlogPost, Concierge, Destinations, Home, Legal, Packages, PreTrip, Support | — |
| `About.dc.html` | page (fluid) | 1440 × 3700 | About · Why Vereda | About, Auth, Blog, Concierge, Destinations, Home, Legal, Packages, PreTrip, Support | — |
| `Support.dc.html` | page (fluid) · interactive | 1440 × 3000 | Support · channels, FAQ, emergency, contact | About, Account, Auth, Blog, Concierge, Destinations, Home, Legal, Packages, PreTrip, Support | — |
| `Auth.dc.html` | page (fluid) · interactive | 1440 × 960 | Sign in · create account · recover (passwordless) | About, Account, Home, Legal, Package, Support | — |
| `Legal.dc.html` | page (fluid) · interactive | 1440 × 2600 | Legal · terms, privacy, cancellation, cookies, data rights, sanctions, accessibility | Account, Auth, Blog, Concierge, Destinations, Home, Packages, PreTrip, Support | — |
| `Errors.dc.html` | page (fluid) · interactive | 1440 × 900 | Errors · 404, 500, offline, compliance hold, maintenance | About, Account, Auth, Blog, Concierge, Destinations, Home, Legal, Packages, PreTrip, Support | — |
| `Join.dc.html` | page (fluid) · interactive | 1440 × 2500 | Join our network · supplier recruitment portal (ES) · category, identity, credential, audit | About, Auth, Blog, Destinations, Home, Join, Legal, Packages, PreTrip, Support, W-Login | — |
| `Concierge.dc.html` | page (fluid) · interactive | 1440 × 2500 | Event access · ticket concierge (spec §3.2) · request in 3 steps, trip paths, all events | About, Account, Auth, Blog, Concierge, Custom, Destinations, Home, Legal, Packages, PreTrip, Support | — |
| `Map-Concept.dc.html` | page (fluid) | 1280 × 3400 | Province map · concept and interaction contract: three jobs, layers, states, panel, device rules, data, kil… | A-Content, A-Reports, Custom, Destination, Destinations, Packages, PreTrip, T-Assets, T-Events | — |

## 03 Customer · Mobile · 21 boards

| file | kind | size | title | links to | tweaks |
|---|---|---|---|---|---|
| `M-Home.dc.html` | phone 390 | 390 × 4300 | Homepage · mobile 390 | M-Account, M-Blog, M-BlogPost, M-Compare, M-Concierge, M-Custom, M-Destination, M-Destinations, M-Home, M-Package, M-… | primary |
| `M-Packages.dc.html` | phone 390 · interactive | 390 × 4700 | Listing · mobile | M-About, M-Account, M-Compare, M-Custom, M-Home, M-Legal, M-Package, M-Packages, M-PreTrip, M-Support | — |
| `M-Package.dc.html` | phone 390 · interactive | 390 × 2600 | Package detail · mobile | M-About, M-Account, M-Booking, M-Home, M-Legal, M-Package, M-Packages, M-Support | — |
| `M-Booking.dc.html` | phone 390 · interactive | 390 × 1700 | Booking flow · mobile | M-Account, M-Legal, M-Package, M-Payment, M-PreTrip | model |
| `M-Payment.dc.html` | phone 390 · interactive | 390 × 1800 | Payment · mobile | M-Account, M-Confirmation, M-Legal | — |
| `M-Confirmation.dc.html` | phone 390 · interactive | 390 × 2250 | Confirmation · mobile | M-Account, M-Home, M-Packages, M-Payment, M-PreTrip, M-Support | — |
| `M-Custom.dc.html` | phone 390 · interactive | 390 × 2400 | Custom itinerary builder · mobile | M-About, M-Account, M-Legal | — |
| `M-Destinations.dc.html` | phone 390 · interactive | 390 × 3800 | Destinations · mobile · list-first, map on demand | M-About, M-Account, M-Custom, M-Destination, M-Home, M-Legal, M-Package, M-Packages, M-Support | — |
| `M-Destination.dc.html` | phone 390 | 390 × 3700 | Destination detail · mobile | M-About, M-Account, M-Custom, M-Destinations, M-Home, M-Legal, M-Package, M-Packages, M-PreTrip, M-Support | — |
| `M-Compare.dc.html` | phone 390 · interactive | 390 × 1500 | Compare · mobile | M-Account, M-Booking, M-Custom, M-Home, M-Package, M-Packages, M-Support | — |
| `M-Account.dc.html` | phone 390 · interactive | 390 × 1900 | Account · mobile | M-Account, M-Custom, M-Home, M-Package, M-Packages, M-Payment, M-PreTrip, M-Support | — |
| `M-PreTrip.dc.html` | phone 390 · interactive | 390 × 1900 | Travel info hub · mobile | M-Account, M-Home, M-Packages, M-Support | — |
| `M-Blog.dc.html` | phone 390 · interactive | 390 × 2500 | Blog & guides · mobile | M-About, M-Account, M-BlogPost, M-Home, M-Legal, M-Packages, M-Support | — |
| `M-BlogPost.dc.html` | phone 390 | 390 × 3300 | Blog article · mobile | M-Account, M-Blog, M-BlogPost, M-Home, M-Packages, M-PreTrip, M-Support | — |
| `M-About.dc.html` | phone 390 | 390 × 3300 | About · mobile | M-About, M-Account, M-Home, M-Legal, M-Packages, M-PreTrip, M-Support | — |
| `M-Support.dc.html` | phone 390 · interactive | 390 × 2900 | Support · mobile | M-About, M-Account, M-Home, M-Legal, M-Packages, M-Support | — |
| `M-Auth.dc.html` | phone 390 · interactive | 390 × 844 | Sign in · mobile | M-Account, M-Home, M-Legal, M-Package, M-Support | — |
| `M-Legal.dc.html` | phone 390 · interactive | 390 × 1800 | Legal · mobile | M-Account, M-Home, M-Packages, M-Support | — |
| `M-Errors.dc.html` | phone 390 · interactive | 390 × 900 | Errors · mobile | M-Account, M-Destinations, M-Home, M-Packages, M-PreTrip, M-Support | — |
| `M-Join.dc.html` | phone 390 · interactive | 390 × 2700 | Join our network · mobile (ES) | M-Account, M-Home, M-Legal, M-Packages, M-Support, W-Login | — |
| `M-Concierge.dc.html` | phone 390 · interactive | 390 × 2700 | Event access · ticket concierge · mobile | M-Account, M-Custom, M-Home, M-Legal | — |

## 04 Admin · 17 boards

| file | kind | size | title | links to | tweaks |
|---|---|---|---|---|---|
| `A-Login.dc.html` | page (fluid) · interactive | 1440 × 960 | Admin sign-in · passwordless + passkey, role shown after sign-in | A-Dashboard, A-Settings, Legal | role |
| `A-Dashboard.dc.html` | page (fluid) · interactive | 1440 × 2300 | Operations dashboard · KPIs, aging buckets, dispatch matrix with amber/red timers, re-dispatch | A-Booking, A-Bookings, A-Content, A-Customers, A-Dashboard, A-Disruption, A-Login, A-Packages, A-Payments, A-Reports,… | — |
| `A-Bookings.dc.html` | page (fluid) · interactive | 1440 × 2340 | Bookings queue · state-machine filter, saved views, who-acts legend | A-Booking, A-Bookings, A-Content, A-Customers, A-Dashboard, A-Disruption, A-Login, A-Packages, A-Payments, A-Reports,… | — |
| `A-Booking.dc.html` | page (fluid) · interactive | 1440 × 1900 | Booking detail VX-7K2M9Q · dispatch items, one-click re-dispatch, messages, documents, audit | A-Bookings, A-Content, A-Customers, A-Dashboard, A-Disruption, A-Login, A-Packages, A-Payments, A-Reports, A-Settings… | — |
| `A-Disruption.dc.html` | page (fluid) · interactive | 1440 × 2500 | Disruption case DC-0931 · severity, scenario playbook, traveler options with deadline, status board | A-Booking, A-Bookings, A-Content, A-Customers, A-Dashboard, A-Disruption, A-Login, A-Packages, A-Payments, A-Reports,… | — |
| `A-Packages.dc.html` | page (fluid) · interactive | 1440 × 2300 | Packages · catalogue list, status filter, bulk CSV import with column mapping | A-Bookings, A-Content, A-Customers, A-Dashboard, A-Disruption, A-Login, A-Package-Edit, A-Packages, A-Payments, A-Rep… | — |
| `A-Package-Edit.dc.html` | page (fluid) · interactive | 1440 × 2400 | Package editor · basics, day by day, suppliers & rates, seasonal pricing, availability, policies, SEO, publ… | A-Bookings, A-Content, A-Customers, A-Dashboard, A-Disruption, A-Login, A-Packages, A-Payments, A-Reports, A-Settings… | — |
| `A-Customers.dc.html` | page (fluid) · interactive | 1440 × 1700 | Customers · list + profile, communication history, OFAC certification, GDPR retention | A-Booking, A-Bookings, A-Content, A-Customers, A-Dashboard, A-Disruption, A-Login, A-Packages, A-Payments, A-Reports,… | — |
| `A-Suppliers.dc.html` | page (fluid) · interactive | 1440 × 2200 | Suppliers · credential inspector, 30-day expiry pause, reliability score, backup power fields | A-Bookings, A-Content, A-Customers, A-Dashboard, A-Disruption, A-Login, A-Packages, A-Payments, A-Reports, A-Settings… | — |
| `A-Payments.dc.html` | page (fluid) · interactive | 1440 × 1800 | Payments · reconciliation by rail, pending proofs, refunds within thresholds, payout liabilities per province | A-Booking, A-Bookings, A-Content, A-Customers, A-Dashboard, A-Disruption, A-Login, A-Packages, A-Payments, A-Reports,… | — |
| `A-Content.dc.html` | page (fluid) · interactive | 1440 × 2000 | Content · advisories & crisis banner with approval, blog, destination conditions, FAQs, media | A-Bookings, A-Content, A-Customers, A-Dashboard, A-Disruption, A-Login, A-Packages, A-Payments, A-Reports, A-Settings… | — |
| `A-Reports.dc.html` | page (fluid) · interactive | 1440 × 2800 | Reports · GBV by rail, take rate, AOV, ecotourism ratio, MINTUR summary, ONAT export, dispatch latency, CSA… | A-Bookings, A-Content, A-Customers, A-Dashboard, A-Disruption, A-Login, A-Packages, A-Payments, A-Reports, A-Settings… | — |
| `A-Settings.dc.html` | page (fluid) · interactive | 1440 × 2200 | Settings · users & roles, permission matrix, currencies & languages, agency manifest & feature flags, thres… | A-Bookings, A-Content, A-Customers, A-Dashboard, A-Disruption, A-Login, A-Packages, A-Payments, A-Reports, A-Settings… | — |
| `A-States.dc.html` | page (fluid) · interactive | 1280 × 2500 | Admin & apps · edge states: empty, denied, locked, degraded, errors, loading, narrow widths | A-Dashboard, A-Settings, W-Calendar, W-Credentials | — |
| `A-A11y.dc.html` | page (fluid) | 1280 × 2400 | Admin & apps · accessibility: alerts in three channels, keyboard paths, contrast audit, fixes | — | — |
| `T-Testing.dc.html` | page (fluid) | 1280 × 2600 | Usability test kit · scripts per persona on the live prototype, metrics, severity scale | A-Booking, A-Bookings, A-Customers, A-Dashboard, A-Disruption, A-Payments, A-Reports, AL-Alerts, Booking, Confirmatio… | — |
| `A-Assistant.dc.html` | page (fluid) · interactive | 1440 × 1900 | Assistant (spec §4.8) · daily operations summary, draft composer with inserted facts, inline translation, w… | A-Assistant, A-Booking, A-Bookings, A-Content, A-Customers, A-Dashboard, A-Disruption, A-Login, A-Packages, A-Payment… | — |

## 05 Worker & Ops Lite apps · 10 boards

| file | kind | size | title | links to | tweaks |
|---|---|---|---|---|---|
| `W-Login.dc.html` | phone 390 · interactive | 390 × 900 | Worker app · sign-in by phone, credential status banner | W-Credentials, W-Home | status |
| `W-Home.dc.html` | phone 390 · interactive | 390 × 1160 | Worker app · home: availability toggle, pending offer timer, today's job, offline queue | W-Calendar, W-Credentials, W-Earnings, W-Home, W-Job, W-Offer | — |
| `W-Offer.dc.html` | phone 390 · interactive | 390 × 1380 | Worker app · job offer with countdown, accept / decline with reason | W-Calendar, W-Earnings, W-Home, W-Job, W-Offer | — |
| `W-Calendar.dc.html` | phone 390 · interactive | 390 × 1400 | Worker app · availability calendar, tap-to-block days, fuel reserve | W-Calendar, W-Earnings, W-Home, W-Job, W-Offer | — |
| `W-Job.dc.html` | phone 390 · interactive | 390 × 1560 | Worker app · active job offline, service steps, one-touch on-site emergency | W-Calendar, W-Earnings, W-Home, W-Job, W-Offer | — |
| `W-Credentials.dc.html` | phone 390 · interactive | 390 × 1420 | Worker app · credentials: upload, PENDING_AUDIT, 30-day expiry rule | W-Calendar, W-Earnings, W-Home, W-Job, W-Offer | — |
| `W-Earnings.dc.html` | phone 390 · interactive | 390 × 1500 | Worker app · profile: reliability score with its three numbers, payouts, receipts | W-Calendar, W-Credentials, W-Earnings, W-Home, W-Job, W-Login, W-Offer | — |
| `AL-Alerts.dc.html` | phone 390 · interactive | 390 × 1480 | Ops Lite · alerts: red timeout push, one-click fallback re-dispatch, quick approvals | A-Dashboard, AL-Alerts, AL-Inbox, AL-Pipeline | — |
| `AL-Pipeline.dc.html` | phone 390 · interactive | 390 × 1500 | Ops Lite · pipeline: state machine on the phone, live bookings, travelers on trip | A-Dashboard, A-Disruption, AL-Alerts, AL-Inbox, AL-Pipeline | — |
| `AL-Inbox.dc.html` | phone 390 · interactive | 390 × 1560 | Ops Lite · unified inbox: travelers and workers, urgent first, inline translation | A-Dashboard, AL-Alerts, AL-Inbox, AL-Pipeline | — |

## 06 Documents (PDF) · 8 boards

| file | kind | size | title | links to | tweaks |
|---|---|---|---|---|---|
| `D-Voucher-1.dc.html` | fixed | 794 × 1123 | Traveler voucher · Bono de Servicio · page 1 of 2 | — | — |
| `D-Voucher-2.dc.html` | fixed | 794 × 1123 | Traveler voucher · page 2 of 2 · rendezvous, emergencies, policies | — | — |
| `D-WorkOrder.dc.html` | fixed | 794 × 1123 | Orden de Trabajo · supplier work order (ES) · Casa Yamilé | — | — |
| `D-Invoice.dc.html` | fixed | 794 × 1123 | Invoice · schedule, rails, cancellation summary | — | — |
| `D-Proposal.dc.html` | fixed | 794 × 1123 | Custom itinerary proposal · VX-C-4R8T · route, days, price, next steps | — | — |
| `D-OfflineKit-1.dc.html` | fixed | 794 × 1123 | Offline kit · page 1 · week at a glance, contacts, practical | — | — |
| `D-OfflineKit-2.dc.html` | fixed | 794 × 1123 | Offline kit · page 2 · emergency pamphlet | — | — |
| `D-MINTUR.dc.html` | fixed | 794 × 1123 | Resumen anual de actividad · MINTUR Art. 24 p) Res. 68/2026 (ES) | — | — |

## 07 Notifications & emails · 12 boards

| file | kind | size | title | links to | tweaks |
|---|---|---|---|---|---|
| `E-Received.dc.html` | fixed | 600 × 860 | Email · request received (ITINERARY_SUBMITTED) | Account, Legal | — |
| `E-Invoice.dc.html` | fixed | 600 × 1000 | Email · secured, invoice, 48-hour window | Account, Legal, Payment | — |
| `E-Confirmed.dc.html` | fixed | 600 × 1080 | Email · confirmed, receipt, documents | Account, D-Invoice, D-Voucher-1, Legal | — |
| `E-Reminder.dc.html` | fixed | 600 × 720 | Email · payment reminder · 2 hours left | Account, Legal, Payment | — |
| `E-Reconfirm.dc.html` | fixed | 600 × 1060 | Email · T−7 reconfirmation, offline kit, morning check-ins | Account, D-OfflineKit-1, Legal, PreTrip | — |
| `E-Advisory.dc.html` | fixed | 600 × 820 | Email · caution advisory to travelers in the region | Account, Legal, PreTrip | — |
| `E-Options.dc.html` | fixed | 600 × 960 | Email · disruption options with deadline (case DC-0931) | Account, Legal | — |
| `E-OFAC.dc.html` | fixed | 600 × 900 | Correo · recordatorio OFAC (ES) · documentos en espera | Booking, Legal, PreTrip | — |
| `E-Retention.dc.html` | fixed | 600 × 880 | Email · GDPR retention notice · keep my account | Account, Legal | — |
| `E-NPS.dc.html` | fixed | 600 × 980 | Email · NPS at +24 h, rate each part | Account, Legal | — |
| `S-Messages.dc.html` | phone 390 | 390 × 1560 | SMS and push · check-in, payment, milestones, advisory, options, worker offers, admin alerts | — | — |
| `C-Spec.dc.html` | page (fluid) | 1280 × 4100 | Notifications spec · triggers, subjects, plain-text fallbacks, SMS segments, push budgets, localisation | Auth, D-Proposal, E-Advisory, E-Confirmed, E-Invoice, E-NPS, E-OFAC, E-Options, E-Received, E-Reconfirm, E-Reminder, … | — |

## 08 Handoff · flows & traceability · 10 boards

| file | kind | size | title | links to | tweaks |
|---|---|---|---|---|---|
| `G-StateMachine.dc.html` | fixed | 1180 × 1200 | Diagram · reservation state machine (spec §4.2) | — | — |
| `G-Dispatch.dc.html` | fixed | 1720 × 920 | Diagram · dispatch & escalation engine swimlane (spec §4.1–4.3) | — | — |
| `G-Disruption.dc.html` | fixed | 1360 × 1120 | Diagram · disruption handling decision flow | — | — |
| `G-Money.dc.html` | fixed | 1760 × 560 | Diagram · money flow, payment to payout | — | — |
| `G-Sync.dc.html` | fixed | 1200 × 520 | Diagram · offline-first sync (spec §7.2) | — | — |
| `T-Matrix.dc.html` | page (fluid) | 1280 × 2500 | Traceability · spec and research requirements → artboards | A-A11y, A-Assistant, A-Booking, A-Bookings, A-Content, A-Customers, A-Dashboard, A-Disruption, A-Login, A-Package-Edi… | — |
| `T-Events.dc.html` | page (fluid) | 1280 × 3300 | Analytics · event taxonomy per component (doc 13), funnel stages, payload contract | A-A11y, A-Assistant, A-Booking, A-Bookings, A-Dashboard, A-Disruption, A-Packages, A-Payments, A-Reports, A-Settings,… | — |
| `T-Forms.dc.html` | page (fluid) | 1280 × 3900 | Form field specs · six forms, validation rules, formats, error copy EN / ES / FR | A-Package-Edit, A-Payments, A-Settings, Auth, Booking, Custom, Join, Payment, T-Events | — |
| `T-Signoff.dc.html` | page (fluid) | 1280 × 2500 | Sign-off record · baseline v1.0, acceptance dates, open items, change log, change procedure | B-Logo, DS-Handoff, T-Matrix, T-Testing | — |
| `T-Assets.dc.html` | page (fluid) | 1280 × 3200 | Asset manifest · logo, fonts, icon sprite, Cuba map file contract, photo shot list, document and email asse… | B-Compare, B-Logo, C-Spec, Destinations, M-Destinations, Map-Concept | — |

## 09 Brand · 12 boards

| file | kind | size | title | links to | tweaks |
|---|---|---|---|---|---|
| `B-Logo.dc.html` | page (fluid) | 1280 × 2900 | Logo · the name, set once (chosen 11 Oct 2026): construction, lockups, colour versions, clear space, misuse… | — | — |
| `B-Card.dc.html` | fixed | 1400 × 760 | Business card · 85 × 55 mm at 200 % · terracotta spine front (monogram, person) and terracotta back (monogr… | — | name, role, phone, email, languages, handle |
| `B-DigitalCard.dc.html` | phone 390 | 390 × 1000 | Digital business card · NFC tap or QR landing · save contact (vCard), WhatsApp, call, plan a trip | Destinations, Home, Legal | — |
| `B-Guidelines.dc.html` | page (fluid) | 1280 × 2900 | Brand guidelines · voice do/don’t, colour, type, stationery (letterhead, envelope, slip, stamp), social tem… | B-Card, B-DigitalCard, B-Email, B-Logo, B-Signature | — |
| `B-Signature.dc.html` | page (fluid) | 1280 × 2100 | Email signature · EN, ES, mobile · HTML to paste, plain text, client checks | Home, Join, PreTrip | — |
| `B-Email.dc.html` | page (fluid) | 1920 × 1500 | Brand email templates · monthly letter, proposal cover, supplier outreach (ES) · 600 px | Concierge, Custom, Join, Package | — |
| `B-Logo-B.dc.html` | page (fluid) | 1280 × 2900 | Record · not for the build · Logo option B · the fanlight: construction, lockups, colour versions, clear sp… | B-Card-Portrait, B-Card, B-Logo | — |
| `B-Logo-C.dc.html` | page (fluid) | 1280 × 2900 | Record · not for the build · Logo option C · the name, set once: construction, lockups, colour versions, cl… | B-Card-Portrait, B-Card, B-Logo | — |
| `B-Card-B.dc.html` | fixed | 1400 × 826 | Record · not for the build · Business card option B · 85 × 55 mm at 200 % · terracotta spine front (person)… | B-Card-Portrait, B-Card, B-Logo | name, role, phone, email, languages, handle |
| `B-Card-C.dc.html` | fixed | 1400 × 1066 | Record · not for the build · Business card option C · 85 × 55 mm portrait at 200 % · cream front (name at t… | B-Card-Portrait, B-Card, B-Logo | name, role, phone, email, languages, handle |
| `B-Compare.dc.html` | page (fluid) | 1280 × 2500 | Record · not for the build · Logo options compared · A, B and C in the web header, the browser tab, on the … | A-Bookings, A-Dashboard, A-Disruption, A-Packages, Auth, B-Card-Portrait, B-Card, B-Logo, Blog, Concierge, Destinatio… | — |
| `B-Card-Portrait.dc.html` | fixed | 1400 × 1000 | Business card · logo C chosen · B's front as a top band (person at the foot) + C's back (monogram, company,… | — | name, role, phone, email, languages, handle |
