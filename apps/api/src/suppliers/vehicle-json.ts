import type { Prisma } from '@ota/db';
import {
  pendingVehicleSchema,
  vehicleDetailsSchema,
  vehicleRejectionSchema,
  type PendingVehicleDto,
  type VehicleRejectionDto,
} from '@ota/schemas';
import { z } from 'zod';

/**
 * `supplier_profiles.vehicle_details` (M6 D7(b), `docs/schema-w-vehicle.md`):
 * the desk's vehicle fields at the top level, with the worker's pending change
 * and the desk's last refusal beside them. An insurance date stored before
 * X3a is not read (the insurance document's is), and the next write drops it.
 */
const currentSchema = vehicleDetailsSchema.omit({ insuranceUntil: true });

export type StoredVehicleFields = z.infer<typeof currentSchema>;

export interface StoredVehicle {
  /** Null when no vehicle is on file or the stored fields do not match the shape. */
  current: StoredVehicleFields | null;
  pending: PendingVehicleDto | null;
  rejection: VehicleRejectionDto | null;
}

const sideSchema = z.object({
  pendingVehicle: pendingVehicleSchema.optional().catch(undefined),
  rejectedVehicle: vehicleRejectionSchema.optional().catch(undefined),
});

export function readVehicleJson(value: Prisma.JsonValue | null): StoredVehicle {
  const current = currentSchema.safeParse(value);
  const side = sideSchema.safeParse(value);
  return {
    current: current.success ? current.data : null,
    pending: side.success ? (side.data.pendingVehicle ?? null) : null,
    rejection: side.success ? (side.data.rejectedVehicle ?? null) : null,
  };
}

/** The JSON to store: the vehicle's fields, and the change and refusal beside them. */
export function writeVehicleJson(vehicle: StoredVehicle): Prisma.InputJsonValue {
  return {
    ...(vehicle.current ?? {}),
    ...(vehicle.pending ? { pendingVehicle: vehicle.pending } : {}),
    ...(vehicle.rejection ? { rejectedVehicle: vehicle.rejection } : {}),
  };
}
