# W-Credentials vehicle follow-ups: decisions for review

**Status:** **Approved 2026-11-20 as recommended (X1a, X2a, X3a) and built the same day** (§5).
**No migration** (the vehicle stays in `supplier_profiles.vehicle_details`, JSON).
**Scope:** the two items `docs/schema-w-credentials.md` §4 left out: the worker changing vehicle
(W-Credentials' "Cambiar de vehículo") and aligning the vehicle form's own insurance date with the
insurance document.

## 1. Today

| Item | Today |
|---|---|
| The vehicle | Only the desk writes it: `PUT /suppliers/:id/vehicle` (M6 D7(b)), the whole object replaced; model, seats, A/C, extras, plate, insurance name, `insuranceUntil`, routes. |
| The app | W-Credentials' insurance card shows the vehicle line (model · plate · seats · A/C). There is no "Cambiar de vehículo" button. |
| Two insurance dates | The vehicle form's `insuranceUntil` (typed by the desk, informational, M6 D7(b)) and the `LIABILITY_INSURANCE` document's `expiresOn` (read off the document at approval; it pauses auto-offers through `credential_expires_at`). They can disagree; the supplier page shows both. |
| Vehicle-bound documents | `TECHNICAL_INSPECTION` and `LIABILITY_INSURANCE` name a vehicle, but a credential has no link to the plate. |

## 2. Decisions (options and recommendation)

**X1 · How a worker changes vehicle.**
(a) **Recommended:** a request the desk approves. "Cambiar de vehículo" opens a short form in the
app (model, plate, seats, A/C) and sends it with `POST /worker/vehicle`. It is kept as
`pendingVehicle` beside the current vehicle in the same JSON, so the current vehicle stays on file
and in dispatch until the desk has seen the new one ("a vehicle we've sat in"). The supplier
page's vehicle card shows the request with **Approve** (the request becomes the vehicle; extras,
insurance name and routes carry over) and **Reject** (with a reason sent by SMS, like a document
rejection). There is one request at a time, and a new one replaces it. Audited as
`supplier.vehicle_requested` and `…_approved` / `…_rejected`.
(b) The button opens the worker ↔ desk thread with a prefilled message, and the desk retypes the
vehicle. This needs no route, but the desk copies by hand and nothing on the supplier page shows
a request waiting.
(c) The worker edits the vehicle directly. Not recommended: the agency inspects every vehicle.

**X2 · The documents of the old vehicle (only with X1(a)).**
(a) **Recommended:** approving a vehicle with a **different plate** supersedes the current
`TECHNICAL_INSPECTION` and `LIABILITY_INSURANCE`. Both named the old car, so the app asks for both
again, and auto-offers pause until the desk approves them (V3's rule for a missing required
document). The approve dialog says so before the desk confirms. The same plate (a corrected
model or seat count) supersedes nothing.
(b) Keep them and show a warning on the supplier page only. The driver keeps getting offers on
the old car's insurance.

**X3 · One insurance date.**
(a) **Recommended:** the vehicle's insurance date **is** the insurance document's. The DTO's
`vehicle.insuranceUntil` is read from the current verified `LIABILITY_INSURANCE` (null when there
is none). The desk form loses its own date field and shows the document's date read-only ("From
the insurance document"). `PUT /suppliers/:id/vehicle` no longer takes `insuranceUntil` (an old
client's field is stripped, not refused). A stored date is left in the JSON and never read
again. The insurance badge on the supplier page then follows the document, which is what
dispatch already follows.
(b) Approving an insurance document copies its date into the form, and the form stays editable.
They can drift again on the next edit.
(c) Keep both, with a mismatch warning.

## 3. What lands once approved (X1a, X2a, X3a)

- `@ota/domain`: the vehicle request's rules (one pending at a time; a plate change supersedes
  the vehicle-bound kinds), the insurance date from the document, with unit tests.
- `@ota/schemas`: `vehicleRequestSchema`, `pendingVehicle` on the supplier detail and the
  worker's credentials DTO (both optional additions), and `insuranceUntil` dropped from the input.
- API: `POST /worker/vehicle` (SERVICE_WORKER, own profile, drivers only, 409 for any other
  category), `POST /suppliers/:id/vehicle/approve|reject` (ops + super). All three go in the RBAC
  matrix.
- App: the button and form on W-Credentials' insurance card, the "En revisión" state, offline
  queueing like a document upload (Spanish, as the app is).
- Desk: the request on the supplier page's vehicle card, the approve dialog, and the read-only
  date, in en/es/fr.
- e2e: a driver requests a new vehicle in the web preview; the desk approves it; the insurance
  and inspection cards ask for new documents.

## 4. Not in this batch

- Several vehicles per driver (a fleet): one vehicle per driver, as M6 D7(b).
- Linking a document to a plate: X2(a) works on the request's plate, so no column is needed.

## 5. As built (2026-11-20)

- Domain `packages/domain/src/supplier/vehicle.ts`: `vehicleRequestRefusal` (drivers only),
  `normalizePlate` (spaces, hyphens and case ignored), `credentialsSupersededByVehicle` (a
  different plate takes the inspection and the insurance; the same plate or a first vehicle
  takes nothing), `vehicleInsuranceUntil` (the latest verified insurance's expiry), and
  `vehicleReviewSms` (one GSM-7 segment, no accents).
- Storage: `vehicle_details` keeps the desk's fields at the top level, with `pendingVehicle`
  and `rejectedVehicle` beside them (`apps/api/src/suppliers/vehicle-json.ts`). The desk's save
  keeps a waiting request. A date stored before X3a is not read, and the next save drops it.
- API `SupplierVehicleService`: `POST /worker/vehicle` (SERVICE_WORKER; a non-driver gets
  **422**, as the desk's `PUT …/vehicle` already answers, not the 409 §3 named),
  `POST /suppliers/:id/vehicle/approve|reject` (ops + super; 409 with nothing waiting). Every
  step, and the desk's `PUT`, locks the profile row (`SELECT … FOR UPDATE`). Approval
  supersedes only **verified** versions: an upload already waiting may be the new car's.
  Audited as `supplier.vehicle_requested`, `…_approved` (with the superseded ids) and
  `…_rejected`. An SMS goes out after each decision. RBAC matrix +3.
- DTOs: `SupplierDetailDto.pendingVehicle`, and on `WorkerCredentialsDto`, `vehicleRequest`
  and `vehicleRejection` (the refusal shows until the worker asks again). `vehicle.insuranceUntil`
  is the document's date. `vehicleDetailsInputSchema` no longer has `insuranceUntil`.
- App: "Cambiar de vehículo" on the insurance card opens model, plate, seats and A/C, plus
  the note about the new documents. "Cambio de vehículo en revisión" while waiting, and the
  desk's reason after a rejection. Unsent fields stay on screen. The vehicle line now shows
  whether or not the insurance is current.
- Desk: the vehicle card shows the request ("Vehicle change asked from the app", a
  warning-500 border) with "Review and approve…" (a DS 06 dialog that says when the plate
  change sets the documents aside) and an inline reject form with the reason, as the
  credential panel's. The form's insurance date is read-only ("From the verified liability
  insurance document."), in en/es/fr.
- e2e: `worker-app.spec.ts` (request from the app, approval on the desk, the app asks for
  both documents) and `supplier-resources.spec.ts` (the date from a verified insurance).
