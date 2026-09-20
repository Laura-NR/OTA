import type { EmailMessage } from '../mailer';

export interface EmailBranding {
  agencyName: string;
  licenseNumber: string;
  primaryColor: string;
  supportEmail?: string | null;
  supportPhone?: string | null;
}

export interface MagicLinkEmailInput {
  to: string;
  url: string;
  branding: EmailBranding;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function magicLinkEmail({ to, url, branding }: MagicLinkEmailInput): EmailMessage {
  const safeUrl = escapeHtml(url);
  const html = `<!doctype html>
<html>
<body style="font-family: Arial, Helvetica, sans-serif; color: #1f2937;">
  <h1 style="color: ${branding.primaryColor}; font-size: 20px;">${escapeHtml(branding.agencyName)}</h1>
  <p>Click the button below to sign in. This link expires shortly and can only be used once.</p>
  <p>
    <a href="${safeUrl}"
       style="display:inline-block;background:${branding.primaryColor};color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">
      Sign in
    </a>
  </p>
  <p style="color:#6b7280;font-size:12px;">If the button does not work, paste this link into your browser:<br/>${safeUrl}</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;" />
  <p style="color:#6b7280;font-size:11px;">
    ${escapeHtml(branding.agencyName)} · MINTUR License ${escapeHtml(branding.licenseNumber)}
  </p>
</body>
</html>`;

  const text = `${branding.agencyName}\n\nSign in: ${url}\n\nThis link expires shortly and can only be used once.\nMINTUR License ${branding.licenseNumber}`;

  return {
    to,
    subject: `Sign in to ${branding.agencyName}`,
    html,
    text,
  };
}
