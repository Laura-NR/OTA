import { buttonClassName } from '@ota/ui';
import { getTranslations } from 'next-intl/server';

import { ErrorReference } from '@/components/error-reference';
import { Link } from '@/i18n/navigation';

/** Errors board · 404: what happened, nothing booked is affected, three ways back. */
export default async function NotFound() {
  const t = await getTranslations('errors.notFound');

  return (
    <div className="mx-auto flex max-w-container flex-col gap-6 px-6 py-16 md:px-8 lg:px-10">
      <p aria-hidden="true" className="font-display text-display-1 text-secondary-600">
        404
      </p>
      <h1 className="text-h1-compact text-default md:text-h1">{t('title')}</h1>
      <p className="max-w-prose text-body-lg text-secondary">{t('text')}</p>
      <div className="flex flex-wrap gap-3">
        <Link href="/" className={buttonClassName()}>
          {t('home')}
        </Link>
        <Link href="/packages" className={buttonClassName({ variant: 'secondary' })}>
          {t('browse')}
        </Link>
        <Link href="/account" className={buttonClassName({ variant: 'tertiary' })}>
          {t('trips')}
        </Link>
      </div>
      <p className="max-w-prose text-body-sm text-muted">
        {t.rich('emailLink', {
          link: (chunks) => (
            <Link
              href="/support"
              className="text-primary-600 underline underline-offset-[3px]"
            >
              {chunks}
            </Link>
          ),
        })}{' '}
        <ErrorReference prefix="404" />
      </p>
    </div>
  );
}
