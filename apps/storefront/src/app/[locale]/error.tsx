'use client';

import { Button, buttonClassName } from '@ota/ui';
import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';

/**
 * Errors board · 500: our fault, nothing charged twice, try again. During a
 * booking or a payment, the advice is not to resubmit but to give the desk the
 * reference (Next's error digest) so it checks what went through first.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors.server');

  return (
    <div className="mx-auto flex max-w-container flex-col gap-6 px-6 py-16 md:px-8 lg:px-10">
      <h1 className="text-h1-compact text-default md:text-h1">{t('title')}</h1>
      <p className="max-w-prose text-body-lg text-secondary">{t('text')}</p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={reset}>{t('retry')}</Button>
        <Link href="/" className={buttonClassName({ variant: 'secondary' })}>
          {t('home')}
        </Link>
      </div>
      <div className="flex max-w-prose flex-col gap-1 rounded-lg bg-sunken p-4">
        <p className="text-body font-semibold">{t('bookingTitle')}</p>
        <p className="text-body-sm text-secondary">
          {t.rich('bookingText', {
            link: (chunks) => (
              <Link
                href="/support"
                className="text-primary-600 underline underline-offset-[3px]"
              >
                {chunks}
              </Link>
            ),
          })}
        </p>
        {error.digest ? (
          <p className="font-mono text-body-sm text-default">
            {t('reference', { reference: error.digest })}
          </p>
        ) : null}
      </div>
    </div>
  );
}
