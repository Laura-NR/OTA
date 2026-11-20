import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { ApiError } from './api';
import { downloadStatus } from './receipt';

/**
 * W-Earnings E5: downloads one of the worker's receipts with their bearer into
 * the app's private cache (the same receipt overwrites itself) and hands the
 * PDF to Android's share sheet, where a viewer opens it or the worker keeps it.
 * The bearer stays the only key: there is no link anyone else could open.
 */
export async function openReceipt(
  url: string,
  token: string,
  title: string,
): Promise<void> {
  let file: File;
  try {
    file = await File.downloadFileAsync(url, Paths.cache, {
      headers: { accept: 'application/pdf', authorization: `Bearer ${token}` },
      idempotent: true,
    });
  } catch (error) {
    throw new ApiError(downloadStatus(error), 'Receipt not downloaded');
  }
  await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: title });
}
