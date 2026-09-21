import type { EmailMessage } from '../mailer';
import type { EmailBranding } from './magic-link';

export interface NewMessageEmailInput {
  to: string;
  reservationCode: string;
  body: string;
  portalUrl: string;
  branding: EmailBranding;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function newMessageEmail({
  to,
  reservationCode,
  body,
  portalUrl,
  branding,
}: NewMessageEmailInput): EmailMessage {
  const html = `<!doctype html>
<html>
<body style="font-family: Arial, Helvetica, sans-serif; color: #1f2937;">
  <h1 style="color: ${branding.primaryColor}; font-size: 18px;">${escapeHtml(branding.agencyName)}</h1>
  <p>New message about booking <strong>${escapeHtml(reservationCode)}</strong>:</p>
  <blockquote style="border-left:3px solid ${branding.primaryColor};margin:0;padding:8px 12px;background:#f9fafb;">
    ${escapeHtml(body).replaceAll('\n', '<br/>')}
  </blockquote>
  <p><a href="${escapeHtml(portalUrl)}" style="color:${branding.primaryColor};">Open the portal to reply</a></p>
  <p style="color:#6b7280;font-size:11px;">
    ${escapeHtml(branding.agencyName)} · MINTUR License ${escapeHtml(branding.licenseNumber)}
  </p>
</body>
</html>`;

  const text = `${branding.agencyName}\n\nNew message about booking ${reservationCode}:\n\n${body}\n\nReply at ${portalUrl}\nMINTUR License ${branding.licenseNumber}`;

  return {
    to,
    subject: `New message about booking ${reservationCode}`,
    html,
    text,
  };
}
