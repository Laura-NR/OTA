'use client';

import { Button } from '@ota/ui';
import { useTranslations } from 'next-intl';

import { useRouter } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { clearOfflineKits } from '@/lib/offline-kit';

export function SignOutButton() {
  const t = useTranslations('account');
  const router = useRouter();

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={async () => {
        // Saved trips are the traveler's; none stays on a device they left.
        await clearOfflineKits().catch(() => {});
        await authClient.signOut();
        router.push('/');
        router.refresh();
      }}
    >
      {t('signOut')}
    </Button>
  );
}
