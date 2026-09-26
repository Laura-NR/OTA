'use client';

import { Button } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

import { authClient } from '@/lib/auth-client';

export function SignOutButton() {
  const router = useRouter();
  const t = useTranslations('backoffice.shell');

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await authClient.signOut();
        router.push('/login');
        router.refresh();
      }}
    >
      {t('signOut')}
    </Button>
  );
}
