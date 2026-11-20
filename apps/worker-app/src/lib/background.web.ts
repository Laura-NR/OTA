/**
 * The web preview (screenshots and e2e only, never shipped to workers) has no
 * background: its answers resend while the page is open.
 */
export async function setBackgroundResend(_on: boolean): Promise<void> {}
