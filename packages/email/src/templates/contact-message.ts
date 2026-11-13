import type { EmailMessage } from '../mailer';
import type { EmailBranding } from './magic-link';

export interface ContactMessageEmailInput {
  /** The agency inbox. */
  to: string;
  name: string;
  email: string;
  topic: string;
  bookingCode?: string;
  replyLocale: string;
  message: string;
  branding: EmailBranding;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * A message from the public Support form, to the agency inbox. Replying goes
 * straight to the person who wrote in; nothing is ever sent to the address they
 * typed, so the form cannot be used to mail third parties.
 */
export function contactMessageEmail({
  to,
  name,
  email,
  topic,
  bookingCode,
  replyLocale,
  message,
  branding,
}: ContactMessageEmailInput): EmailMessage {
  const facts: [string, string][] = [
    ['From', `${name} <${email}>`],
    ['Topic', topic],
    ...(bookingCode ? ([['Booking', bookingCode]] as [string, string][]) : []),
    ['Reply in', replyLocale],
  ];

  const html = `<!doctype html>
<html>
<body style="font-family: Arial, Helvetica, sans-serif; color: #1f2937;">
  <h1 style="color: ${branding.primaryColor}; font-size: 18px;">${escapeHtml(branding.agencyName)} · Support form</h1>
  <table style="border-collapse:collapse;">
    ${facts
      .map(
        ([label, value]) =>
          `<tr><td style="padding:2px 12px 2px 0;color:#6b7280;">${label}</td><td>${escapeHtml(value)}</td></tr>`,
      )
      .join('\n    ')}
  </table>
  <blockquote style="border-left:3px solid ${branding.primaryColor};margin:12px 0 0;padding:8px 12px;background:#f9fafb;">
    ${escapeHtml(message).replaceAll('\n', '<br/>')}
  </blockquote>
</body>
</html>`;

  const text = `${branding.agencyName} · Support form\n\n${facts
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n')}\n\n${message}`;

  return {
    to,
    replyTo: email,
    subject: `Support form · ${topic} · ${name}${bookingCode ? ` · ${bookingCode}` : ''}`,
    html,
    text,
  };
}
