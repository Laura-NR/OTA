import type { EmailMessage } from '../mailer';
import type { EmailBranding } from './magic-link';

export interface RetentionNoticeEmailInput {
  to: string;
  /** One-click [Keep My Account Active] link. */
  keepAliveUrl: string;
  /** Last day the account can be kept before the record is anonymized. */
  purgeAt: Date;
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
 * Spec §3.5 keep-alive notice: tells the traveler their profile, travel history,
 * and identity details are scheduled for deletion, with a one-click link to keep
 * the account active for another 12 months.
 */
export function retentionNoticeEmail({
  to,
  keepAliveUrl,
  purgeAt,
  branding,
}: RetentionNoticeEmailInput): EmailMessage {
  const safeUrl = escapeHtml(keepAliveUrl);
  const deadline = purgeAt.toISOString().slice(0, 10);
  const html = `<!doctype html>
<html>
<body style="font-family: Arial, Helvetica, sans-serif; color: #1f2937;">
  <h1 style="color: ${branding.primaryColor}; font-size: 20px;">${escapeHtml(branding.agencyName)}</h1>
  <p>Your profile, travel history, and identity details are scheduled for deletion
     to protect your data privacy.</p>
  <p>If you would like to keep your account active, confirm before
     <strong>${escapeHtml(deadline)}</strong>:</p>
  <p>
    <a href="${safeUrl}"
       style="display:inline-block;background:${branding.primaryColor};color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">
      Keep My Account Active
    </a>
  </p>
  <p style="color:#6b7280;font-size:12px;">If you take no action, your record will
     be anonymized on ${escapeHtml(deadline)} and your personal details removed.
     If the button does not work, paste this link into your browser:<br/>${safeUrl}</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;" />
  <p style="color:#6b7280;font-size:11px;">
    ${escapeHtml(branding.agencyName)} · MINTUR License ${escapeHtml(branding.licenseNumber)}
  </p>
</body>
</html>`;

  const text = `${branding.agencyName}\n\nYour profile, travel history, and identity details are scheduled for deletion to protect your data privacy.\n\nKeep your account active before ${deadline}: ${keepAliveUrl}\n\nIf you take no action, your record will be anonymized on ${deadline} and your personal details removed.\nMINTUR License ${branding.licenseNumber}`;

  return {
    to,
    subject: `Keep your ${branding.agencyName} account active`,
    html,
    text,
  };
}
