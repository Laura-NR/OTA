import { workerToday, type CredentialKind } from '@ota/domain';
import type { CredentialSlotDto } from '@ota/schemas';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The API's 5 MB cap on a credential file. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** The types the API takes; a phone photo is JPEG. */
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type PhotoType = (typeof PHOTO_TYPES)[number];

const KIND_NAMES: Record<CredentialKind, { name: string; feminine: boolean }> = {
  TRANSPORT_LICENCE: { name: 'Licencia de transporte', feminine: true },
  TECHNICAL_INSPECTION: { name: 'Inspección técnica (somatón)', feminine: true },
  LIABILITY_INSURANCE: { name: 'Seguro de responsabilidad civil', feminine: false },
  GUIDE_LICENCE: { name: 'Licencia de guía', feminine: true },
  HOST_LICENCE: { name: 'Licencia de arrendador', feminine: true },
  IDENTITY_CARD: { name: 'Carnet de identidad', feminine: false },
};

/** "Licencia de transporte" */
export function kindName(kind: CredentialKind): string {
  return KIND_NAMES[kind].name;
}

/** "inspección técnica (somatón)", inside a sentence ("Siguiente vencimiento: …"). */
export function kindNameInline(kind: CredentialKind): string {
  const { name } = KIND_NAMES[kind];
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/** Days from today in Cuba to a `YYYY-MM-DD` expiry; 0 on its last day. */
export function daysLeft(day: string, now: number): number {
  return Math.round(
    (Date.parse(`${day}T00:00:00Z`) -
      Date.parse(`${workerToday(new Date(now))}T00:00:00Z`)) /
      DAY_MS,
  );
}

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info';

/**
 * The document's chip, the board's "Verificada" / "Vence en 55 días": the
 * days are counted from when its pause is near, a window ahead of it.
 */
export function slotBadge(
  slot: Pick<CredentialSlotDto, 'kind' | 'state' | 'current' | 'pending'>,
  now: number,
  windowDays: number,
): { text: string; tone: BadgeTone } {
  const { feminine } = KIND_NAMES[slot.kind];
  const expiresOn = slot.current?.expiresOn ?? null;
  switch (slot.state) {
    case 'MISSING':
      return slot.pending
        ? { text: 'En revisión', tone: 'info' }
        : { text: 'Falta', tone: 'danger' };
    case 'EXPIRED':
      return { text: feminine ? 'Vencida' : 'Vencido', tone: 'danger' };
    case 'EXPIRING':
      return { text: expiringText(daysLeft(expiresOn!, now)), tone: 'warning' };
    case 'VALID': {
      const days = expiresOn ? daysLeft(expiresOn, now) : null;
      return days !== null && days <= windowDays * 2
        ? { text: expiringText(days), tone: 'warning' }
        : { text: feminine ? 'Verificada' : 'Verificado', tone: 'success' };
    }
  }
}

function expiringText(days: number): string {
  return days === 0 ? 'Vence hoy' : days === 1 ? 'Vence mañana' : `Vence en ${days} días`;
}

/** "2,1 MB" or "640 KB", as the preview line shows the photo's weight. */
export function fileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toLocaleString('es-ES', {
      maximumFractionDigits: 1,
    })} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** The bytes a base64 string decodes to. */
export function base64Bytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/** A picked photo as the upload sends it. */
export interface PhotoUpload {
  filename: string;
  contentType: PhotoType;
  contentBase64: string;
  bytes: number;
}

/**
 * The picker's asset as an upload, or null when it carries no image data. A
 * native picker re-encodes the photo as JPEG; the web preview keeps the file's
 * own type.
 */
export function photoUpload(asset: {
  base64?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
}): PhotoUpload | null {
  const base64 = asset.base64?.replace(/^data:[^,]*,/, '');
  if (!base64) return null;
  const contentType = PHOTO_TYPES.includes(asset.mimeType as PhotoType)
    ? (asset.mimeType as PhotoType)
    : 'image/jpeg';
  const extension = contentType.split('/')[1]!.replace('jpeg', 'jpg');
  return {
    filename: asset.fileName || `documento.${extension}`,
    contentType,
    contentBase64: base64,
    bytes: base64Bytes(base64),
  };
}
