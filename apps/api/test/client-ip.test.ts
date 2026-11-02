import { describe, expect, it } from 'vitest';

import { writeClientIp } from '../src/common/client-ip';

const HEADER = 'x-ota-client-ip';

describe("the client address handed to Better Auth (docs/schema-m9-ip-allowlist.md I2)", () => {
  it("replaces a value the client sent with Express's address", () => {
    const headers = { [HEADER]: '203.0.113.9', 'x-forwarded-for': '203.0.113.9' };
    writeClientIp(headers, HEADER, '198.51.100.7');
    expect(headers[HEADER]).toBe('198.51.100.7');
  });

  it('removes a value the client sent when Express has no address', () => {
    const headers: Record<string, string> = { [HEADER]: '203.0.113.9' };
    writeClientIp(headers, HEADER, undefined);
    expect(headers).not.toHaveProperty(HEADER);
  });
});
