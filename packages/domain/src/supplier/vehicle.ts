import { SupplierCategory } from './compliance';
import type { CredentialKind, CredentialVersion } from './credentials';

/**
 * A driver's vehicle (`docs/schema-w-vehicle.md`). The worker asks for a
 * change and the desk approves it (X1a); a new plate takes the documents that
 * named the old car with it (X2a); the vehicle's insurance date is the
 * insurance document's (X3a).
 */

/** The documents that name a vehicle, so a different plate needs new ones (X2a). */
export const VEHICLE_BOUND_CREDENTIALS: readonly CredentialKind[] = [
  'TECHNICAL_INSPECTION',
  'LIABILITY_INSURANCE',
];

export type VehicleRequestRefusal = 'NOT_A_DRIVER';

/** Only drivers keep a vehicle on file (M6 D7(b)). */
export function vehicleRequestRefusal(
  category: SupplierCategory,
): VehicleRequestRefusal | null {
  return category === SupplierCategory.PrivateDriver ? null : 'NOT_A_DRIVER';
}

/** "P 207 913", "p207913" and "P-207-913" are one plate. */
export function normalizePlate(plate: string): string {
  return plate.replace(/[\s-]/g, '').toUpperCase();
}

/**
 * The documents an approved vehicle supersedes: the vehicle-bound ones when
 * the plate changes, none for a correction of the same car. A first vehicle
 * on file supersedes nothing, as no document named a car before it.
 */
export function credentialsSupersededByVehicle(
  currentPlate: string | null,
  nextPlate: string,
): readonly CredentialKind[] {
  if (currentPlate === null) return [];
  return normalizePlate(currentPlate) === normalizePlate(nextPlate)
    ? []
    : VEHICLE_BOUND_CREDENTIALS;
}

/**
 * The vehicle's insurance date (X3a): the expiry of the verified liability
 * insurance, the latest upload when more than one is verified; null when none
 * is verified.
 */
export function vehicleInsuranceUntil(
  versions: readonly CredentialVersion[],
): Date | null {
  const current = versions
    .filter(
      (version) =>
        version.kind === 'LIABILITY_INSURANCE' && version.status === 'VERIFIED',
    )
    .reduce<CredentialVersion | null>(
      (best, version) =>
        !best || version.uploadedAt.getTime() > best.uploadedAt.getTime()
          ? version
          : best,
      null,
    );
  return current?.expiresOn ?? null;
}

/**
 * The review's SMS to the worker (ADR 0007: one GSM-7 segment, no accents).
 * A rejection's reason is the desk's own words, so the app shows it instead.
 */
export function vehicleReviewSms(approved: boolean, newDocuments: boolean): string {
  if (!approved) {
    return 'Vereda: la central no acepto el cambio de vehiculo. Abre Mis credenciales en la app para ver el motivo.';
  }
  return newDocuments
    ? 'Vereda: la central aprobo tu vehiculo nuevo. Sube su seguro y su inspeccion tecnica en Mis credenciales.'
    : 'Vereda: la central aprobo los datos de tu vehiculo. Los ves en la app, en Mis credenciales.';
}
