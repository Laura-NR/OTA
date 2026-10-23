/**
 * A-Settings' permission matrix (M9 D6): what the API's routes enforce today,
 * one capability per row. It is read-only and kept in step with
 * `apps/api/test/authorization.e2e.test.ts`; it shows the code, not the board.
 */
export type Access = 'yes' | 'view' | 'no';

export interface Capability {
  key: string;
  superAdmin: Access;
  operations: Access;
  support: Access;
}

export const CAPABILITIES: readonly Capability[] = [
  { key: 'bookings', superAdmin: 'yes', operations: 'yes', support: 'view' },
  { key: 'dispatch', superAdmin: 'yes', operations: 'yes', support: 'view' },
  { key: 'messages', superAdmin: 'yes', operations: 'yes', support: 'yes' },
  { key: 'suppliers', superAdmin: 'yes', operations: 'yes', support: 'view' },
  { key: 'credentials', superAdmin: 'yes', operations: 'yes', support: 'yes' },
  { key: 'advisories', superAdmin: 'yes', operations: 'yes', support: 'view' },
  { key: 'disruptions', superAdmin: 'yes', operations: 'yes', support: 'view' },
  { key: 'payments', superAdmin: 'yes', operations: 'yes', support: 'view' },
  { key: 'catalog', superAdmin: 'yes', operations: 'yes', support: 'view' },
  { key: 'reports', superAdmin: 'yes', operations: 'yes', support: 'yes' },
  { key: 'customers', superAdmin: 'yes', operations: 'yes', support: 'view' },
  { key: 'ofacExport', superAdmin: 'yes', operations: 'no', support: 'no' },
  { key: 'thresholds', superAdmin: 'yes', operations: 'view', support: 'view' },
  { key: 'staff', superAdmin: 'yes', operations: 'no', support: 'no' },
];
