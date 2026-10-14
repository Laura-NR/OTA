'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

import { authClient } from '@/lib/auth-client';

/** The sidebar's sign-out action: a caption-size text button on the dark desk. */
export function SignOutButton() {
  const router = useRouter();
  const t = useTranslations('backoffice.shell');

  return (
    <button
      type="button"
      className="self-start text-caption font-normal text-primary-200 underline underline-offset-[3px] hover:text-neutral-0 focus-visible:outline-accent-500"
      onClick={async () => {
        await authClient.signOut();
        router.push('/login');
        router.refresh();
      }}
    >
      {t('signOut')}
    </button>
  );
}
