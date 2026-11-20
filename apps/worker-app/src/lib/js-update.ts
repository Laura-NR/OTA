import * as Updates from 'expo-updates';

/**
 * Downloads a signed JS update when one is published for this APK's runtime
 * (`docs/worker-app-distribution-plan.md` U5a). It applies at the next cold
 * start; an APK built without the update certificate has updates off and
 * checks nothing.
 */
export async function fetchJsUpdate(): Promise<boolean> {
  if (!Updates.isEnabled) return false;
  const check = await Updates.checkForUpdateAsync();
  if (!check.isAvailable) return false;
  return (await Updates.fetchUpdateAsync()).isNew;
}
