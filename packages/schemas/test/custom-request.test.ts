import { describe, expect, it } from 'vitest';

import { createCustomRequestSchema } from '../src';

const base = {
  startDate: '2027-03-06',
  endDate: '2027-03-16',
  adults: 2,
  children: 0,
};

describe('createCustomRequestSchema (the designed builder)', () => {
  it('takes a route whose nights add up to the trip, with transport and guiding', () => {
    const parsed = createCustomRequestSchema.parse({
      ...base,
      route: [
        { province: 'CU03', nights: 3, stay: 'comfort' },
        { province: 'CU01', nights: 4 },
        { province: 'CU07', nights: 3, stay: 'heritage' },
      ],
      transport: 'minivan',
      guiding: 'shared',
      interpreter: false,
      stepFree: true,
      pace: 'moderate',
      interests: ['nature', 'food'],
    });
    expect(parsed.route).toHaveLength(3);
    expect(parsed.guiding).toBe('shared');
  });

  it('still takes the first-cut request without a route', () => {
    expect(createCustomRequestSchema.parse(base).route).toEqual([]);
  });

  it("refuses a route whose nights do not match the trip's", () => {
    const result = createCustomRequestSchema.safeParse({
      ...base,
      route: [{ province: 'CU03', nights: 3 }],
    });
    expect(result.success).toBe(false);
  });

  it('refuses an unknown province code, guiding choice or too many stops', () => {
    expect(
      createCustomRequestSchema.safeParse({
        ...base,
        route: [{ province: 'Havana', nights: 10 }],
      }).success,
    ).toBe(false);
    expect(createCustomRequestSchema.safeParse({ ...base, guiding: 'bus' }).success).toBe(
      false,
    );
    expect(
      createCustomRequestSchema.safeParse({
        ...base,
        endDate: '2027-03-13',
        route: Array.from({ length: 7 }, (_, index) => ({
          province: `CU0${index + 1}`,
          nights: 1,
        })),
      }).success,
    ).toBe(false);
  });
});
