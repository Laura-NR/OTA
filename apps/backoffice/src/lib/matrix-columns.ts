import type { ServiceType } from '@ota/domain';

/**
 * The matrix's service columns, one per type in A-Dashboard's order. The timer
 * column comes before them, right after the booking, so the time left stays in
 * view where the table scrolls (the board puts it last). Their keys also name
 * a service in the alert announcements.
 */
export const MATRIX_COLUMNS: ReadonlyArray<{ key: string; type: ServiceType }> = [
  { key: 'stay', type: 'ACCOMMODATION' },
  { key: 'transport', type: 'TRANSPORTATION' },
  { key: 'guide', type: 'GUIDE' },
  { key: 'activities', type: 'EXPERIENCE' },
];
