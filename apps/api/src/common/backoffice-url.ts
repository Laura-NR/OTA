/** The back-office origin that emails link to (invitations, passkey changes). */
export function backofficeBaseUrl(): string {
  return (process.env.BACKOFFICE_PUBLIC_URL ?? 'http://localhost:3002').replace(
    /\/$/,
    '',
  );
}
