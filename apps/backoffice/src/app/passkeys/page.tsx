import type { PasskeyStatusDto } from '@ota/schemas';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ota/ui';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { PasskeyManager } from '@/components/passkey-manager';
import { apiFetch, getServerSession } from '@/lib/api';
import { ApiError } from '@/lib/errors';
import { opsDate } from '@/lib/ops-format';

/**
 * The signed-in person's passkeys (`docs/schema-m9-passkeys.md` P3, P4).
 * Outside the desk shell, because a staff member the passkey rule holds back
 * (no passkey yet, or a link sign-in) lands here before the desk opens.
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
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>
            {t('description')}
            {status.required ? ` ${t('required')}` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-body-sm">
          <PasskeyManager
            state={status.state}
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
