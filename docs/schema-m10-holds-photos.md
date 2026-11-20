# M10 follow-ups: festival room holds and event photos (schema diff for review)

**Status:** Draft for review, 2026-11-20. **A migration** (additive: nullable columns, one new
table).
**Scope:** the two items `docs/schema-m10-events.md` §4 deferred. First, the Concierge board's
line "Festival week casas in Vedado fill early. We hold a room at Casa Lis (balcony rooms,
battery 8 h) for concierge requests until [hold date]; the custom builder opens with these dates
and Havana already placed." (`Concierge.074`). Second, event photos.

## 1. Today

| Item | Today |
|---|---|
| Room hold | Not modelled. The desk holds rooms by hand, and the event page has no hold line. The platform counts no casa rooms anywhere (`InventoryItem` has no room count; `Availability` is a supplier's day, on or off). |
| "The builder opens with these dates and Havana placed" | The event page links to `/custom`, which reads only `?edit=`. |
| Event photos | None. Events have alt text nowhere and no media table. Packages have `package_media` (storage key, alt text, position, `shows_people`, `consent_reference`) with per-locale alt text in `package_translations.media_alt`, and publishing refuses a photo of people without a consent reference. |

## 2. Data changes (this is why it is Article 2)

- `events`: `hold_inventory_item_id` (UUID, nullable, FK `inventory_items`, ON DELETE SET NULL),
  `hold_until` (DATE, nullable), `hold_note` (TEXT, nullable: "balcony rooms, battery 8 h").
- `event_translations`: `hold_note` (TEXT, nullable), `media_alt` (JSONB, nullable:
  `{ [mediaId]: altText }`, as packages).
- New table `event_media`: id, event_id (FK, cascade), storage_key, alt_text, position,
  shows_people, consent_reference, created_at. This is `package_media`'s shape.
- Nothing is backfilled. Existing events have no hold and no photos.

## 3. Decisions (options and recommendation)

**H1 · What a hold is.**
(a) **Recommended:** one hold per event, shown and not counted. On the editor the desk picks an
active ACCOMMODATION catalog item (the casa), a "held until" date and a short note (translated
like the event's other text). The event page shows the board's line with the casa's name, the
note and the date while today ≤ `hold_until`, and nothing after. The desk keeps holding the room
with the host by hand, as today.
(b) A `room_holds` table (event, casa, nights, rooms, until, status, the request that used it),
consumed when a proposal books the room. This needs room counts the platform does not have,
for one line of copy.
(c) Copy only: the desk types the sentence into the event's notes. The date never hides itself.

**H2 · A hold about to end.**
(a) **Recommended:** a dashboard task on the desk, "Hold at Casa Lis for <event> ends <date>",
from 3 days before `hold_until` until the day after. It goes in the existing tasks list, as M10's
unanswered requests do. 3 days is a domain constant, as the refund nudge's cooldown is.
(b) No reminder.

**H3 · The builder link.**
(a) **Recommended:** while a hold shows, the line's link opens `/custom` with the event's dates
and province (`?from=&to=&province=`). The builder starts with those dates and that destination
placed, and the traveler can change both. Without a hold, the page's existing builder link gets
the same parameters.
(b) Leave the plain `/custom` link.

**P1 · Event photos.**
(a) **Recommended:** `event_media` as packages do. The event editor gains a Photos section
(upload, alt text, order, "shows people" with its consent reference). Publishing refuses a photo
of people without a consent reference, as packages do. The event page's hero is the first photo
and the events list shows it as a thumbnail. Low-bandwidth mode keeps photos on tap. Translations
carry the alt text per locale.
(b) Reuse the casa's catalog photos (`inventory_media`). Events are concerts and festivals, not
casas, so there would be nothing to show.

**P2 · Routes** (every route goes in the RBAC matrix): `POST /events/:id/media`, `PATCH|DELETE
/events/:id/media/:mediaId` (ops write), `GET /events/media/:mediaId` (ops read), and public `GET
/catalog/events/media/:mediaId`, which refuses photos of unpublished events, as
`/catalog/packages/media/:id` does.

## 4. Not in this batch

- Counting rooms or blocking the casa's calendar for the hold (H1(b)).
- Several holds per event: one casa per event, as the board draws it.
- Photo credits or captions beyond alt text.

## 5. What lands once approved (H1a, H2a, H3a, P1a, P2)

- Migration `m10_holds_and_photos` (above). The seed adds a hold and one placeholder photo to the
  sample event (dev only).
- `@ota/domain`: whether a hold shows, the reminder window, and the publish refusal for people
  photos, with unit tests.
- `@ota/schemas`: the editor and public event DTOs gain `hold` and `media` (optional additions),
  and the translation gains `holdNote` and `mediaAlt`.
- API, desk (en/es/fr) and storefront (en/es/fr) as above. The builder reads `from`, `to` and
  `province`.
- e2e: the desk sets a hold and uploads a photo; the event page shows the line and the photo;
  the line's link opens the builder with the dates; the hold line is gone after its date.

## 6. The diff

```prisma
model Event {
  // …
  holdInventoryItemId String?        @map("hold_inventory_item_id") @db.Uuid
  holdUntil           DateTime?      @map("hold_until") @db.Date
  holdNote            String?        @map("hold_note")
  holdInventoryItem   InventoryItem? @relation(fields: [holdInventoryItemId], references: [id], onDelete: SetNull)
  media               EventMedia[]
}

model EventTranslation {
  // …
  holdNote String? @map("hold_note")
  mediaAlt Json?   @map("media_alt")
}

/// M10 P1: an event's photo, as package_media.
model EventMedia {
  id               String   @id @default(uuid()) @db.Uuid
  eventId          String   @map("event_id") @db.Uuid
  storageKey       String   @map("storage_key")
  altText          String   @map("alt_text")
  position         Int      @default(0)
  showsPeople      Boolean  @default(false) @map("shows_people")
  consentReference String?  @map("consent_reference")
  createdAt        DateTime @default(now()) @map("created_at")

  event Event @relation(fields: [eventId], references: [id], onDelete: Cascade)

  @@index([eventId])
  @@map("event_media")
}
```
