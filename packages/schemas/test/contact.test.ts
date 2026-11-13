import { describe, expect, it } from 'vitest';

import { contactMessageSchema } from '../src/contact';

describe('contactMessageSchema', () => {
  const valid = {
    name: 'Jane',
    email: 'jane@example.test',
    topic: 'booking',
    bookingCode: ' e2e0001 ',
    message: 'Can we add a night in Viñales?',
    replyLocale: 'en',
    consent: true,
  };

  it('accepts a message and normalises the booking code', () => {
    expect(contactMessageSchema.parse(valid).bookingCode).toBe('E2E0001');
  });

  it('refuses a message without consent, an unknown topic or a one-word message', () => {
    expect(() => contactMessageSchema.parse({ ...valid, consent: false })).toThrow();
    expect(() => contactMessageSchema.parse({ ...valid, topic: 'spam' })).toThrow();
    expect(() => contactMessageSchema.parse({ ...valid, message: 'hi' })).toThrow();
  });
});
