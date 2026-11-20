import type { EmergencyPosition } from '@ota/domain';
import * as Location from 'expo-location';

/** How long the emergency waits for a fix before it goes without one (J7). */
const FIX_TIMEOUT_MS = 10_000;

/**
 * Asks for the position permission, while the app is open only, the first
 * time a job opens, so the emergency itself never waits on the prompt
 * (`docs/schema-w-job.md` J7). Android asks once; a refusal is kept.
 */
export async function askForPosition(): Promise<void> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted || !current.canAskAgain) return;
  await Location.requestForegroundPermissionsAsync();
}

function toPosition(fix: Location.LocationObject): EmergencyPosition {
  return {
    latitude: fix.coords.latitude,
    longitude: fix.coords.longitude,
    accuracyM: fix.coords.accuracy ?? null,
  };
}

/**
 * One fix for the emergency report: GPS needs no data. With no permission,
 * the location off or no fix within ten seconds, the last known position
 * stands in; failing that the report goes without one, which the desk sees.
 * There is no tracking: nothing reads the position outside this call.
 */
export async function emergencyPosition(): Promise<EmergencyPosition | null> {
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted) return null;
    const fix = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), FIX_TIMEOUT_MS)),
    ]);
    if (fix) return toPosition(fix);
    const last = await Location.getLastKnownPositionAsync();
    return last ? toPosition(last) : null;
  } catch {
    // Location services off or the fix failed: the report goes without a position.
    return null;
  }
}
