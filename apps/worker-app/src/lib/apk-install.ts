import { File, Paths } from 'expo-file-system';
import { getContentUriAsync } from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';

/** Why a new APK did not reach Android's installer. */
export class ApkDownloadError extends Error {
  constructor(readonly reason: 'no-connection' | 'incomplete') {
    super(reason);
  }
}

/** Android's flag letting the installer read our file. */
const FLAG_GRANT_READ_URI_PERMISSION = 1;

/**
 * U4a: downloads the APK into the app's cache, checks its size against the
 * release and hands it to Android's installer, which shows the update and,
 * the first time, asks to allow installs from this app. Android installs it
 * only over the same signature. Resolves when the installer returns without
 * installing; after an install Android replaces the running app.
 */
export async function installApk(input: {
  url: string;
  fileName: string;
  sizeBytes: number;
  pageUrl: string;
  onProgress: (written: number, total: number) => void;
}): Promise<void> {
  const destination = new File(Paths.cache, input.fileName);
  if (destination.exists) destination.delete();
  const task = File.createDownloadTask(input.url, destination, {
    onProgress: ({ bytesWritten, totalBytes }) =>
      input.onProgress(bytesWritten, totalBytes > 0 ? totalBytes : input.sizeBytes),
  });
  let file: File | null;
  try {
    file = await task.downloadAsync();
  } catch {
    throw new ApkDownloadError('no-connection');
  }
  if (!file || file.size !== input.sizeBytes) throw new ApkDownloadError('incomplete');
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: await getContentUriAsync(file.uri),
    flags: FLAG_GRANT_READ_URI_PERMISSION,
    type: 'application/vnd.android.package-archive',
  });
}
