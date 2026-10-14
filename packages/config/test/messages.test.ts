import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadTenantMessages } from '../src/messages';

const dir = mkdtempSync(join(tmpdir(), 'ota-tenant-messages-'));

describe('loadTenantMessages', () => {
  it('treats a missing file as no overrides', () => {
    expect(loadTenantMessages(join(dir, 'missing.json'))).toEqual({});
  });

  it('reads a JSON object', () => {
    const path = join(dir, 'en.json');
    writeFileSync(path, JSON.stringify({ content: { footer: { tagline: 'Hi' } } }));
    expect(loadTenantMessages(path)).toEqual({ content: { footer: { tagline: 'Hi' } } });
  });

  it('rejects a file that is not an object', () => {
    const path = join(dir, 'list.json');
    writeFileSync(path, '["not", "an", "object"]');
    expect(() => loadTenantMessages(path)).toThrow(/must be a JSON object/);
  });
});
