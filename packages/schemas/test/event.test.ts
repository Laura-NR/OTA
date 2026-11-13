import { describe, expect, it } from 'vitest';

import {
  createEventRequestSchema,
  eventBannerContentSchema,
  eventWriteSchema,
  operatingThresholdsSchema,
} from '../src';

const CATEGORY = '00000000-0000-4000-8000-000000000001';
const BOOKING = '00000000-0000-4000-8000-000000000002';
const REQUEST = '00000000-0000-4000-8000-000000000003';

const base = { eventSlug: 'havana-jazz', categoryId: CATEGORY, seats: 2 };

describe('M10 event request (D3–D5)', () => {
  it('takes a trip to build only with an arrival and its nights', () => {
    expect(createEventRequestSchema.safeParse({ ...base, path: 'BUILD' }).success).toBe(
      false,
    );
    expect(
      createEventRequestSchema.safeParse({
        ...base,
        path: 'BUILD',
        arrival: '2027-01-16',
        totalNights: 10,
        afterProvince: 'CU01',
      }).success,
    ).toBe(true);
  });

  it('attaches to exactly one existing booking or custom request', () => {
    const existing = { ...base, path: 'EXISTING' };
    expect(createEventRequestSchema.safeParse(existing).success).toBe(false);
    expect(
      createEventRequestSchema.safeParse({
        ...existing,
        reservationId: BOOKING,
        customRequestId: REQUEST,
      }).success,
    ).toBe(false);
    expect(
      createEventRequestSchema.safeParse({ ...existing, reservationId: BOOKING }).success,
    ).toBe(true);
  });

  it('never lets another path name a booking, and caps the seats at 8', () => {
    expect(
      createEventRequestSchema.safeParse({
        ...base,
        path: 'TICKETS_ONLY',
        reservationId: BOOKING,
      }).success,
    ).toBe(false);
    expect(
      createEventRequestSchema.safeParse({ ...base, path: 'TICKETS_ONLY', seats: 9 })
        .success,
    ).toBe(false);
  });
});

describe('M10 event document (D1, D2)', () => {
  const event = {
    access: 'ALLOCATIONS_OPEN',
    province: 'CU03',
    startsOn: '2027-01-18',
    endsOn: '2027-01-24',
    datesConfirmed: true,
    sourceLocale: 'en',
    name: 'Havana Jazz Festival',
    place: 'Vedado and Old Havana',
    summary: 'Seven nights of concerts.',
  };

  it('accepts an event with no nights or categories yet, and refuses reversed dates', () => {
    expect(eventWriteSchema.safeParse(event).success).toBe(true);
    expect(eventWriteSchema.safeParse({ ...event, endsOn: '2027-01-10' }).success).toBe(
      false,
    );
  });

  it('refuses a province outside the ISO codes and a negative seat price', () => {
    expect(eventWriteSchema.safeParse({ ...event, province: 'Havana' }).success).toBe(
      false,
    );
    expect(
      eventWriteSchema.safeParse({
        ...event,
        categories: [{ kind: 'GENERAL', name: 'General', pricePerSeat: -1 }],
      }).success,
    ).toBe(false);
  });
});

describe('M10 thresholds and the Home strip', () => {
  it('bounds the concierge answer time between 1 hour and a week', () => {
    const shape = operatingThresholdsSchema.shape.conciergeAnswerHours;
    expect(shape.safeParse(48).success).toBe(true);
    expect(shape.safeParse(0).success).toBe(false);
    expect(shape.safeParse(169).success).toBe(false);
  });

  it('lets the strip name an event, and works without one', () => {
    const strip = {
      status: 'placeholder',
      label: 'Event',
      headline: 'Havana Jazz Festival',
      text: 'Concerts.',
      cta: 'Request event access',
    };
    expect(eventBannerContentSchema.safeParse(strip).success).toBe(true);
    expect(
      eventBannerContentSchema.safeParse({ ...strip, eventSlug: 'havana-jazz' }).success,
    ).toBe(true);
  });
});
