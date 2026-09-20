import { renderHtmlToPdf } from '@ota/documents';

export const DOCUMENT_RENDERER = 'ota:document-renderer';

export interface DocumentRenderer {
  render(html: string): Promise<Uint8Array>;
}

/** Converts HTML to PDF with headless Chromium (packages/documents). */
export class PlaywrightDocumentRenderer implements DocumentRenderer {
  render(html: string): Promise<Uint8Array> {
    return renderHtmlToPdf(html);
  }
}
