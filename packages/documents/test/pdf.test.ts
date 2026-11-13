import { chromium } from 'playwright';
import { afterEach, describe, expect, it, vi } from 'vitest';

const launches: { connected: boolean; pages: number }[] = [];

vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn(async () => {
      const state = { connected: true, pages: 0 };
      launches.push(state);
      return {
        isConnected: () => state.connected,
        newPage: async () => {
          if (!state.connected) {
            throw new Error(
              'browser.newPage: Target page, context or browser has been closed',
            );
          }
          state.pages += 1;
          return {
            setContent: async () => undefined,
            pdf: async () => new TextEncoder().encode('%PDF-1.7'),
            close: async () => undefined,
          };
        },
        close: async () => {
          state.connected = false;
        },
      };
    }),
  },
}));

const { closePdfRenderer, renderHtmlToPdf } = await import('../src/pdf');

afterEach(async () => {
  await closePdfRenderer();
  launches.length = 0;
});

describe('renderHtmlToPdf', () => {
  it('reuses one browser while it stays connected', async () => {
    await renderHtmlToPdf('<p>1</p>');
    await renderHtmlToPdf('<p>2</p>');
    expect(launches).toHaveLength(1);
    expect(launches[0]!.pages).toBe(2);
  });

  it('launches a new browser after the old one was lost', async () => {
    await renderHtmlToPdf('<p>1</p>');
    // The Chromium process dies (a crash, or a signal sent to its group).
    launches[0]!.connected = false;

    const pdf = await renderHtmlToPdf('<p>2</p>');

    expect(new TextDecoder().decode(pdf)).toBe('%PDF-1.7');
    expect(launches).toHaveLength(2);
    expect(launches[1]!.pages).toBe(1);
  });

  it('launches one replacement for concurrent renders', async () => {
    await renderHtmlToPdf('<p>1</p>');
    launches[0]!.connected = false;

    await Promise.all([renderHtmlToPdf('<p>2</p>'), renderHtmlToPdf('<p>3</p>')]);

    expect(launches).toHaveLength(2);
    expect(launches[1]!.pages).toBe(2);
  });

  it('closes cleanly after a launch that failed', async () => {
    vi.mocked(chromium.launch).mockRejectedValueOnce(new Error('no Chromium'));
    await expect(renderHtmlToPdf('<p>1</p>')).rejects.toThrow('no Chromium');

    // The host's shutdown hook must not fail on a browser that never started.
    await expect(closePdfRenderer()).resolves.toBeUndefined();
  });

  it('leaves the process signals to the host app', async () => {
    // Playwright's own SIGTERM handler closes the browser but never exits, and
    // any SIGTERM listener stops Node's default exit: the API would outlive a
    // `node --watch` restart or the end of `pnpm e2e`.
    await renderHtmlToPdf('<p>1</p>');
    expect(chromium.launch).toHaveBeenCalledWith(
      expect.objectContaining({
        handleSIGINT: false,
        handleSIGTERM: false,
        handleSIGHUP: false,
      }),
    );
  });
});
