import { ApiError } from './api';
import { receiptFileName } from './receipt';

/**
 * The web preview (screenshots and e2e only, never shipped to workers) has no
 * share sheet, so it saves the PDF through the browser.
 */
export async function openReceipt(
  url: string,
  token: string,
  _title: string,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: 'application/pdf', authorization: `Bearer ${token}` },
    });
  } catch {
    throw new ApiError(null, 'No connection');
  }
  if (!response.ok) throw new ApiError(response.status, response.statusText);
  const href = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = href;
  link.download = receiptFileName(response.headers.get('content-disposition'));
  link.click();
  // Revoked later, not at once: some browsers read the blob after click() returns.
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}
