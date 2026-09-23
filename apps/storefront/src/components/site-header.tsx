import { getTranslations } from 'next-intl/server';

import { LocaleSwitcher } from '@/components/locale-switcher';
import { Link } from '@/i18n/navigation';
import { getServerSession } from '@/lib/api';

export async function SiteHeader({ agencyName }: { agencyName: string }) {
  const t = await getTranslations('nav');
  const session = await getServerSession();

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          {agencyName}
        </Link>
        <nav className="flex items-center gap-4 text-sm font-medium">
          <Link href="/" className="hover:text-primary">
            {t('home')}
          </Link>
          <Link href="/catalog" className="hover:text-primary">
            {t('experiences')}
          </Link>
          <Link href="/packages" className="hover:text-primary">
            {t('packages')}
          </Link>
          <Link href="/join-our-network" className="hover:text-primary">
            {t('workWithUs')}
          </Link>
          {session ? (
            <Link href="/account" className="hover:text-primary">
              {t('account')}
            </Link>
          ) : (
            <Link href="/login" className="hover:text-primary">
              {t('signIn')}
            </Link>
          )}
          <LocaleSwitcher />
        </nav>
      </div>
    </header>
  );
}
