import { describe, expect, it } from 'vitest';

import {
  base64Bytes,
  daysLeft,
  fileSize,
  kindNameInline,
  photoUpload,
  slotBadge,
} from '../src/lib/credentials';

// 10:00 in Havana on 6 Oct 2026.
const NOW = Date.parse('2026-10-06T14:00:00Z');

function slot(
  kind: Parameters<typeof slotBadge>[0]['kind'],
  state: Parameters<typeof slotBadge>[0]['state'],
  expiresOn: string | null,
  pending = false,
) {
  return {
    kind,
    state,
    current: { expiresOn } as never,
    pending: pending ? ({} as never) : null,
  };
}

describe('daysLeft', () => {
  it('counts calendar days from today in Cuba, 0 on the last day', () => {
    expect(daysLeft('2026-11-30', NOW)).toBe(55);
    expect(daysLeft('2026-10-06', NOW)).toBe(0);
    // 01:00 UTC on the 7th is still the 6th in Havana.
    expect(daysLeft('2026-10-06', Date.parse('2026-10-07T01:00:00Z'))).toBe(0);
  });
});

describe('slotBadge', () => {
  it('says verified in the document’s gender while far from expiry', () => {
    expect(slotBadge(slot('TRANSPORT_LICENCE', 'VALID', '2027-06-12'), NOW, 30)).toEqual({
      text: 'Verificada',
      tone: 'success',
    });
    expect(
      slotBadge(slot('LIABILITY_INSURANCE', 'VALID', '2027-01-31'), NOW, 30).text,
    ).toBe('Verificado');
    expect(slotBadge(slot('IDENTITY_CARD', 'VALID', null), NOW, 30).text).toBe(
      'Verificado',
    );
  });

  it('counts the days down from twice the window, as the board’s "Vence en 55 días"', () => {
    expect(
      slotBadge(slot('TECHNICAL_INSPECTION', 'VALID', '2026-11-30'), NOW, 30),
    ).toEqual({ text: 'Vence en 55 días', tone: 'warning' });
    expect(
      slotBadge(slot('TECHNICAL_INSPECTION', 'EXPIRING', '2026-10-07'), NOW, 30).text,
    ).toBe('Vence mañana');
  });

  it('marks an expired document, a missing one and one waiting for its first review', () => {
    expect(slotBadge(slot('GUIDE_LICENCE', 'EXPIRED', '2026-10-01'), NOW, 30)).toEqual({
      text: 'Vencida',
      tone: 'danger',
    });
    const missing = { kind: 'HOST_LICENCE' as const, state: 'MISSING' as const };
    expect(slotBadge({ ...missing, current: null, pending: null }, NOW, 30).text).toBe(
      'Falta',
    );
    expect(
      slotBadge({ ...missing, current: null, pending: {} as never }, NOW, 30).text,
    ).toBe('En revisión');
  });
});

describe('kindNameInline', () => {
  it('lowers the first letter for "Siguiente vencimiento: …"', () => {
    expect(kindNameInline('TECHNICAL_INSPECTION')).toBe('inspección técnica (somatón)');
  });
});

describe('fileSize and base64Bytes', () => {
  it('reads the photo’s weight as the preview line shows it', () => {
    expect(fileSize(2.1 * 1024 * 1024)).toBe('2,1 MB');
    expect(fileSize(640 * 1024)).toBe('640 KB');
    expect(base64Bytes('AAAA')).toBe(3);
    expect(base64Bytes('AAA=')).toBe(2);
    expect(base64Bytes('AA==')).toBe(1);
  });
});

describe('photoUpload', () => {
  it('sends a phone photo as JPEG with a plain name', () => {
    expect(photoUpload({ base64: 'AAAA', mimeType: null, fileName: null })).toEqual({
      filename: 'documento.jpg',
      contentType: 'image/jpeg',
      contentBase64: 'AAAA',
      bytes: 3,
    });
  });

  it('keeps a web file’s own type and name, and drops a data-URL prefix', () => {
    expect(
      photoUpload({
        base64: 'data:image/png;base64,AAAA',
        mimeType: 'image/png',
        fileName: 'licencia.png',
      }),
    ).toMatchObject({
      filename: 'licencia.png',
      contentType: 'image/png',
      contentBase64: 'AAAA',
    });
  });

  it('has nothing to send without image data', () => {
    expect(photoUpload({ base64: null })).toBeNull();
  });
});
