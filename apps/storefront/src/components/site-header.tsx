import { buttonClassName, cn } from '@ota/ui';
import { getTranslations } from 'next-intl/server';
import Image from 'next/image';

import { LocaleSwitcher } from '@/components/locale-switcher';
import { PrimaryNav } from '@/components/primary-nav';
import { SiteMenu } from '@/components/site-menu';
import { Link } from '@/i18n/navigation';
import { brand } from '@/lib/brand';

/**
 * The Home header (DS 07): sticky on the cream page. From `lg` the link row
 * and sign-in sit beside the 28 px wordmark, and "Talk to a specialist" joins
 * them as a secondary button from `xl` (DS 07 also draws it as a text button at
 * `lg`, where the six links leave no room for it); below `lg` a menu button
 * opens the drawer, and sign-in stays in the header from `md`.
 */
export async function SiteHeader({
  agencyName,
  signedIn,
}: {
  agencyName: string;
  signedIn: boolean;
}) {
  const t = await getTranslations('nav');

  return (
    <header className="sticky top-0 z-30 border-b bg-page">
      <div className="mx-auto flex h-16 max-w-container items-center gap-6 px-6 md:px-8 lg:h-[72px] lg:px-10">
        <Link
          href="/"
          aria-label={t('homeLabel', { agency: agencyName })}
          className="shrink-0"
        >
          <Image
            src={brand.wordmark}
            alt=""
            className="h-7 w-auto"
            priority
            unoptimized
          />
        </Link>
        <PrimaryNav />
        <div className="ml-auto flex items-center gap-2">
          <LocaleSwitcher />
          <Link
            href={signedIn ? '/account' : '/login'}
            className={cn(
              buttonClassName({ variant: 'tertiary', size: 'sm' }),
              'hidden md:inline-flex',
            )}
          >
            {signedIn ? t('account') : t('signIn')}
          </Link>
          <Link
            href="/support"
            className={cn(
              buttonClassName({ variant: 'secondary' }),
              'hidden xl:inline-flex',
            )}
          >
            {t('specialist')}
          </Link>
          <SiteMenu signedIn={signedIn} variant="header" className="lg:hidden" />
        </div>
      </div>
    </header>
  );
}
