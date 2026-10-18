import { describe, expect, it } from 'vitest';

import { providerProgress } from '../src';

describe('providerProgress', () => {
  it('reads the dispatch ledger as confirmed, awaiting and being arranged', () => {
    expect(
      providerProgress([
        { status: 'ACCEPTED', offers: [{ status: 'DECLINED' }, { status: 'ACCEPTED' }] },
        { status: 'FULFILLED', offers: [{ status: 'ACCEPTED' }] },
        { status: 'OFFERED', offers: [{ status: 'TIMEOUT' }, { status: 'OFFERED' }] },
        { status: 'DECLINED', offers: [{ status: 'DECLINED' }] },
        { status: 'UNASSIGNED', offers: [{ status: 'CANCELLED' }] },
      ]),
    ).toEqual({
      services: 5,
      confirmed: 2,
      awaiting: 1,
      arranging: 2,
      // The withdrawn (cancelled) offer was never a request the provider saw.
      requestsSent: 6,
      // Yes or no; a timeout is not an answer.
      answered: 4,
    });
  });

  it('is all zeros before anything is booked', () => {
    expect(providerProgress([])).toEqual({
      services: 0,
      confirmed: 0,
      awaiting: 0,
      arranging: 0,
      requestsSent: 0,
      answered: 0,
    });
  });
});
