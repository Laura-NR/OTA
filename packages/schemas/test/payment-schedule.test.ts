import { describe, expect, it } from 'vitest';

import {
  createPaymentIntentSchema,
  createRefundSchema,
  proofQueueItemSchema,
  proofSummarySchema,
  proofUploadSchema,
  rejectProofSchema,
} from '../src';

const RECEIPT = '0b8f3c2e-6a1d-4f5e-9c7b-2d4e6f8a0b1c';

describe('M4 payment schedule DTOs', () => {
  it('keeps the plan optional on a payment link, so existing clients pay in full', () => {
    expect(createPaymentIntentSchema.parse({ rail: 'OPEN_BANKING_SEPA' })).toEqual({
      rail: 'OPEN_BANKING_SEPA',
    });
    expect(
      createPaymentIntentSchema.parse({ rail: 'OPEN_BANKING_SEPA', plan: 'DEPOSIT' })
        .plan,
    ).toBe('DEPOSIT');
  });

  it('never carries a proof file location in a proof summary or the queue', () => {
    for (const shape of [proofSummarySchema.shape, proofQueueItemSchema.shape]) {
      expect(Object.keys(shape).some((key) => /storage|key|url/i.test(key))).toBe(false);
    }
  });

  it('takes a proof as a PDF or a photo only', () => {
    expect(
      proofUploadSchema.safeParse({ contentType: 'image/png', contentBase64: 'AA==' })
        .success,
    ).toBe(true);
    expect(
      proofUploadSchema.safeParse({ contentType: 'text/html', contentBase64: 'AA==' })
        .success,
    ).toBe(false);
  });

  it('needs a reason for a refund and a note for a rejected proof', () => {
    expect(
      createRefundSchema.safeParse({ receiptId: RECEIPT, reason: 'GOODWILL', note: '' })
        .success,
    ).toBe(false);
    expect(
      createRefundSchema.parse({
        receiptId: RECEIPT,
        reason: 'TRAVELER_CANCELLATION',
        note: 'Cancelled by email on 1 Oct.',
      }),
    ).not.toHaveProperty('amount');
    expect(rejectProofSchema.safeParse({ note: ' ' }).success).toBe(false);
  });
});
