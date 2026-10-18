import type { EmailBranding } from './magic-link';

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export interface EmailShellInput {
  branding: EmailBranding;
  /** The opening line ("Hello Margaret,"). */
  greeting: string;
  /** Plain-text paragraphs; each is escaped and set as its own <p>. */
  paragraphs: readonly string[];
  /** Optional bullet points under the paragraphs. */
  points?: readonly string[];
  /** Paragraphs after the points, before the button. */
  closing?: readonly string[];
  cta: { label: string; url: string } | null;
  /** The small print above the footer (what the email is about). */
  note: string;
}

/**
 * The Phase 6 email shell: the tenant's name and primary colour, plain
 * paragraphs, one button and the MINTUR footer, as HTML and plain text. Email
 * clients do not load the web tokens, so the shell stays inline Arial (ADR
 * 0006, Phase 6 amendment).
 */
export function emailShell({
  branding,
  greeting,
  paragraphs,
  points = [],
  closing = [],
  cta,
  note,
}: EmailShellInput): { html: string; text: string } {
  const color = branding.primaryColor;
  const list =
    points.length > 0
      ? `\n  <ul>${points.map((point) => `<li>${escapeHtml(point)}</li>`).join('')}</ul>`
      : '';
  const after = closing
    .map((paragraph) => `\n  <p>${escapeHtml(paragraph)}</p>`)
    .join('');
  const button = cta
    ? `
  <p>
    <a href="${escapeHtml(cta.url)}"
       style="display:inline-block;background:${color};color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">
      ${escapeHtml(cta.label)}
    </a>
  </p>`
    : '';

  const html = `<!doctype html>
<html>
<body style="font-family: Arial, Helvetica, sans-serif; color: #1f2937;">
  <h1 style="color: ${color}; font-size: 20px;">${escapeHtml(branding.agencyName)}</h1>
  <p>${escapeHtml(greeting)}</p>
${paragraphs.map((paragraph) => `  <p>${escapeHtml(paragraph)}</p>`).join('\n')}${list}${after}${button}
  <hr style="border:none;border-top:1px solid #e5e7eb;" />
  <p style="color:#6b7280;font-size:11px;">
    ${escapeHtml(branding.agencyName)} · MINTUR License ${escapeHtml(branding.licenseNumber)}
    ${branding.supportEmail ? ` · ${escapeHtml(branding.supportEmail)}` : ''}
    <br/>${escapeHtml(note)}
  </p>
</body>
</html>`;

  const text = [
    branding.agencyName,
    '',
    greeting,
    ...paragraphs,
    ...points.map((point) => `- ${point}`),
    ...closing,
    ...(cta ? ['', `${cta.label}: ${cta.url}`] : []),
    '',
    `MINTUR License ${branding.licenseNumber}`,
    note,
  ].join('\n');

  return { html, text };
}
