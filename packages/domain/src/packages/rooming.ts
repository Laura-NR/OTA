/**
 * Rooming for a booking the traveler builds (Booking board step 1, M2). The
 * traveler picks a set-up, never the rooms themselves: the server builds the
 * rooms from it, and a room of one is what the tier's single supplement is
 * charged on, so a client cannot shape the rooms to avoid a supplement.
 *
 * - SHARE puts travelers two to a room (a double or twin); with an odd number
 *   the last room takes three. A traveler alone cannot share, so a party of
 *   one gets a room of one.
 * - PRIVATE gives every traveler a room of their own.
 *
 * Infants take no bed: they sleep in the first adult's room.
 */

import type { TravelerKind } from './booking-price';

export type Rooming = 'SHARE' | 'PRIVATE';

export interface RoomPlan {
  /** Beds per room, in order. */
  rooms: { capacity: number }[];
  /** Each traveler's room (an index into `rooms`), or null when there is none. */
  roomOf: (number | null)[];
  /** Rooms of one, which the single supplement prices. */
  singleRooms: number;
}

export function planRooms(kinds: readonly TravelerKind[], rooming: Rooming): RoomPlan {
  const sleepers = kinds.flatMap((kind, index) => (kind === 'INFANT' ? [] : [index]));
  const capacities: number[] = [];

  if (rooming === 'PRIVATE' || sleepers.length === 1) {
    sleepers.forEach(() => capacities.push(1));
  } else {
    for (let start = 0; start < sleepers.length; start += 2) {
      capacities.push(2);
    }
    if (sleepers.length % 2 === 1) {
      // The odd traveler joins the last pair rather than taking a room alone.
      capacities.pop();
      capacities[capacities.length - 1] = 3;
    }
  }

  const roomOf: (number | null)[] = kinds.map(() => null);
  let room = 0;
  let filled = 0;
  for (const index of sleepers) {
    roomOf[index] = room;
    filled += 1;
    if (filled === capacities[room]) {
      room += 1;
      filled = 0;
    }
  }

  const firstAdult = kinds.indexOf('ADULT');
  const infantRoom =
    firstAdult === -1 ? (capacities.length > 0 ? 0 : null) : roomOf[firstAdult]!;
  kinds.forEach((kind, index) => {
    if (kind === 'INFANT') {
      roomOf[index] = infantRoom;
    }
  });

  return {
    rooms: capacities.map((capacity) => ({ capacity })),
    roomOf,
    singleRooms: capacities.filter((capacity) => capacity === 1).length,
  };
}
