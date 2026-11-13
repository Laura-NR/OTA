import type { PasskeyStatusDto } from '@ota/schemas';
import { Alert, Card, CardContent, CardDescription, CardHeader } from '@ota/ui';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { PasskeyManager } from '@/components/passkey-manager';
import { apiFetch, getServerSession } from '@/lib/api';
import { ApiError } from '@/lib/errors';
import { ipRefusal, ipRefusedLoginPath } from '@/lib/ip-allowlist';
import { opsDate } from '@/lib/ops-format';

/**
 * The signed-in person's passkeys (`docs/schema-m9-passkeys.md` P3, P4).
 * Outside the desk shell, because a staff member the passkey rule holds back
 * (no passkey yet, a link sign-in, or a recovery code,
 * `docs/schema-m9-recovery-codes.md` R3) lands here before the desk opens.
 */
export default async function PasskeysPage() {
  const [t, locale, session] = await Promise.all([
    getTranslations('backoffice.passkeys'),
    getLocale(),
    getServerSession(),
  ]);
  if (!session) {
    redirect('/login?next=/passkeys');
  }
  let status: PasskeyStatusDto | null = null;
  try {
    status = await apiFetch<PasskeyStatusDto>('/me/passkeys');
  } catch (error) {
    // A Super Admin signed in from outside the IP allowlist: the login page
    // signs the session out and names the address.
    const ipRefused = error instanceof ApiError ? ipRefusal(error.details) : null;
    if (ipRefused) redirect(ipRefusedLoginPath(ipRefused.address));
    // A deactivated account or an ended staff session: sign in again.
    if (!(error instanceof ApiError && error.status === 401)) throw error;
  }
  if (!status) {
    redirect('/login');
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <h1 className="text-h4 text-default">{t('title')}</h1>
          <CardDescription>
            {t('description')}
            {status.required ? ` ${t('required')}` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-body-sm">
          {status.recoverySession ? <Alert>{t('recoverySession')}</Alert> : null}
          <PasskeyManager
            state={status.state}
            recovery={status.recoverySession}
            passkeys={status.passkeys.map((passkey) => ({
              id: passkey.id,
              name: passkey.name,
              addedOn: passkey.createdAt ? opsDate(passkey.createdAt, locale) : null,
              synced: passkey.backedUp,
            }))}
          />
        </CardContent>
      </Card>
    </main>
  );
}
