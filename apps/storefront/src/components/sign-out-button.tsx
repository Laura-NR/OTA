'use client';

import { Button } from '@ota/ui';
import { useTranslations } from 'next-intl';

import { useRouter } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';

export function SignOutButton() {
  const t = useTranslations('account');
  const router = useRouter();

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await authClient.signOut();
        router.push('/');
        router.refresh();
      }}
    >
      {t('signOut')}
    </Button>
  );
}
