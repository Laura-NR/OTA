import type { EmailMessage } from '../mailer';
import type { EmailBranding } from './magic-link';

export interface WorkerMessageEmailInput {
  /** The desk's inbox (`OPS_NOTIFY_EMAIL`). */
  to: string;
  workerName: string;
  /** The booking the message is about, when it names a job. */
  bookingCode: string | null;
  body: string;
  /** The supplier page, where the thread opens. */
  threadUrl: string;
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
 * The desk's email copy of a worker's message (`docs/schema-w-messages.md`
 * M5), as for a traveler's. It goes only to the agency's own inbox: a reply
 * is written in the thread, which the worker reads in the app.
 */
export function workerMessageEmail({
  to,
  workerName,
  bookingCode,
  body,
  threadUrl,
  branding,
}: WorkerMessageEmailInput): EmailMessage {
  const about = bookingCode ? ` about booking ${bookingCode}` : '';
  const html = `<!doctype html>
<html>
<body style="font-family: Arial, Helvetica, sans-serif; color: #1f2937;">
  <h1 style="color: ${branding.primaryColor}; font-size: 18px;">${escapeHtml(branding.agencyName)}</h1>
  <p>New message from worker <strong>${escapeHtml(workerName)}</strong>${escapeHtml(about)}:</p>
  <blockquote style="border-left:3px solid ${branding.primaryColor};margin:0;padding:8px 12px;background:#f9fafb;">
    ${escapeHtml(body).replaceAll('\n', '<br/>')}
  </blockquote>
  <p><a href="${escapeHtml(threadUrl)}" style="color:${branding.primaryColor};">Open the thread to reply</a></p>
</body>
</html>`;

  const text = `${branding.agencyName}\n\nNew message from worker ${workerName}${about}:\n\n${body}\n\nReply at ${threadUrl}`;

  return {
    to,
    subject: `Worker message from ${workerName}${about}`,
    html,
    text,
  };
}
