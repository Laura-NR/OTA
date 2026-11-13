/**
 * The HTTP status of a refused receipt download, or null when it never
 * reached the API. expo-file-system rejects a non-2xx response with
 * "response has status: 401" and gives no status field.
 */
export function downloadStatus(error: unknown): number | null {
  const message = error instanceof Error ? error.message : String(error);
  const match = /status:? (\d{3})\b/.exec(message);
  return match ? Number(match[1]) : null;
}

/** The file name the API gave the receipt, or a plain one. */
export function receiptFileName(contentDisposition: string | null): string {
  const match = /filename="([^"]+)"/.exec(contentDisposition ?? '');
  return match?.[1] ?? 'recibo.pdf';
}
