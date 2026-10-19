import type { OnApplicationShutdown } from '@nestjs/common';
import { closePdfRenderer, renderHtmlToPdf } from '@ota/documents';

export const DOCUMENT_RENDERER = 'ota:document-renderer';

export interface DocumentRenderer {
  render(html: string): Promise<Uint8Array>;
}

/** Converts HTML to PDF with headless Chromium (packages/documents). */
export class PlaywrightDocumentRenderer
  implements DocumentRenderer, OnApplicationShutdown
{
  render(html: string): Promise<Uint8Array> {
    return renderHtmlToPdf(html);
  }

  // A shutdown hook rather than a destroy hook: Nest runs it after the HTTP
  // server has drained, so a request still rendering keeps its browser.
  async onApplicationShutdown(): Promise<void> {
    await closePdfRenderer();
  }
}
