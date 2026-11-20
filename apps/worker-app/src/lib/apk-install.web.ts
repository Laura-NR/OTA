import { Linking } from 'react-native';

export class ApkDownloadError extends Error {
  constructor(readonly reason: 'no-connection' | 'incomplete') {
    super(reason);
  }
}

/**
 * The web preview (screenshots and e2e only) installs nothing: it opens the
 * download page, as a phone with no installer permission would.
 */
export async function installApk(input: {
  url: string;
  fileName: string;
  sizeBytes: number;
  pageUrl: string;
  onProgress: (written: number, total: number) => void;
}): Promise<void> {
  await Linking.openURL(input.pageUrl);
}
