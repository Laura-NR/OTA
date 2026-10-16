import { describe, expect, it } from 'vitest';

import {
  addReservationExtraSchema,
  reservationPartySchema,
  reservationTravelerSchema,
  updateReservationPartySchema,
} from '../src';

const lead = { fullName: 'Margaret Chen', isLead: true };

describe('reservationTravelerSchema', () => {
  it('never carries a passport number in the party view', () => {
    const shape = Object.keys(reservationTravelerSchema.shape);

    expect(shape).toContain('hasPassport');
    expect(shape.some((key) => /passportNumber/i.test(key))).toBe(false);

    const parsed = reservationPartySchema.shape.travelers.element.parse({
      id: '7d0c5f0e-8f43-4c3a-9a43-1f8f2b6c0a11',
      position: 0,
      kind: 'ADULT',
      isLead: true,
      fullName: 'Margaret Chen',
      dateOfBirth: null,
      nationality: 'CA',
      hasPassport: true,
      passportExpiresAt: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
      roomId: null,
      passportNumber: 'X1234567',
    });
    expect(parsed).not.toHaveProperty('passportNumber');
  });
});

describe('updateReservationPartySchema', () => {
  it('normalises the passport number and the nationality', () => {
    const parsed = updateReservationPartySchema.parse({
      travelers: [{ ...lead, nationality: 'ca', passportNumber: ' ab 123-456 ' }],
    });

    expect(parsed.travelers[0]?.passportNumber).toBe('AB123456');
    expect(parsed.travelers[0]?.nationality).toBe('CA');
  });

  it('keeps an omitted passport number distinct from a cleared one', () => {
    const parsed = updateReservationPartySchema.parse({
      travelers: [lead, { fullName: 'David Chen', passportNumber: null }],
    });

    expect(parsed.travelers[0]?.passportNumber).toBeUndefined();
    expect(parsed.travelers[1]?.passportNumber).toBeNull();
  });

  it('requires a date of birth for a child or infant, so the band can be priced', () => {
    expect(() =>
      updateReservationPartySchema.parse({
        travelers: [lead, { fullName: 'Emma Chen', kind: 'CHILD' }],
      }),
    ).toThrowError(/date of birth/);
  });

  it('refuses two leads, an unknown room and an overfull room', () => {
    expect(() =>
      updateReservationPartySchema.parse({ travelers: [lead, { ...lead }] }),
    ).toThrowError(/lead/);
    expect(() =>
      updateReservationPartySchema.parse({ travelers: [{ ...lead, room: 0 }] }),
    ).toThrowError(/room/);
    expect(() =>
      updateReservationPartySchema.parse({
        rooms: [{ label: 'Single', capacity: 1 }],
        travelers: [
          { ...lead, room: 0 },
          { fullName: 'David Chen', room: 0 },
        ],
      }),
    ).toThrowError(/sleeps/);
  });

  it('needs at least one traveler', () => {
    expect(() => updateReservationPartySchema.parse({ travelers: [] })).toThrowError();
  });
});

describe('addReservationExtraSchema', () => {
  it('accepts a package extra or a manual add-on, and nothing in between', () => {
    expect(
      addReservationExtraSchema.parse({
        packageExtraId: '7d0c5f0e-8f43-4c3a-9a43-1f8f2b6c0a11',
      }),
    ).toEqual({ packageExtraId: '7d0c5f0e-8f43-4c3a-9a43-1f8f2b6c0a11', quantity: 1 });
    expect(
      addReservationExtraSchema.parse({ label: 'Birthday cake', unitAmount: '18' }),
    ).toEqual({
      label: 'Birthday cake',
      unit: 'PER_PERSON',
      unitAmount: 18,
      quantity: 1,
    });
    expect(() => addReservationExtraSchema.parse({ label: 'No price' })).toThrowError();
  });
});
