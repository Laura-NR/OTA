import { chromium, type Browser } from 'playwright';

let browserPromise: Promise<Browser> | undefined;

/**
 * The shared browser, launched on first use. A browser that has crashed or
 * been killed (or a launch that failed) is replaced rather than reused, so one
 * lost Chromium process does not fail every later document.
 */
async function getBrowser(): Promise<Browser> {
  const current = browserPromise;
  if (current) {
    const browser = await current.catch(() => undefined);
    if (browser?.isConnected()) {
      return browser;
    }
    // Another caller may already have replaced it while this one waited.
    if (browserPromise === current) {
      browserPromise = undefined;
    }
  }
  // Playwright's default signal handlers close the browser on SIGTERM but never
  // exit, and a SIGTERM listener disables Node's default exit: the host process
  // would survive `node --watch` restarts and deploy stops. The host app owns
  // its signals; Chromium exits on its own when its pipe to us closes.
  browserPromise ??= chromium.launch({
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
  });
  return browserPromise;
}

/**
 * Render a standalone HTML document to a PDF using headless Chromium. The
 * browser is launched lazily and reused across calls while it is connected.
 */
export async function renderHtmlToPdf(html: string): Promise<Uint8Array> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load' });
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '18mm', bottom: '20mm', left: '16mm', right: '16mm' },
    });
  } finally {
    await page.close();
  }
}

export async function closePdfRenderer(): Promise<void> {
  if (browserPromise) {
    const browser = await browserPromise;
    browserPromise = undefined;
    await browser.close();
  }
}
