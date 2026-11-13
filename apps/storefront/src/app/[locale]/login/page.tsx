import { DEFAULT_LOCALE } from '@ota/i18n';
import { Icon } from '@ota/ui';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { MagicLinkForm } from '@/components/magic-link-form';
import { Link } from '@/i18n/navigation';
import { getServerSession } from '@/lib/api';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('login');
  return { title: t('title') };
}

/**
 * Sign in (Auth / M-Auth boards): the why on primary 700, the form beside it.
 * Travelers sign in with an emailed link until the six-digit code replaces it
 * (Q5); the board's passkey, Google and Apple options and its "Create account"
 * tab are not offered (the link creates the account on first use).
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const locale = await getLocale();
  const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`;
  const callbackPath = next && next.startsWith('/') ? next : `${prefix}/account`;

  const session = await getServerSession();
  if (session) {
    redirect(callbackPath);
  }

  const t = await getTranslations('login');

  return (
    <div className="mx-auto w-full max-w-container px-6 py-8 md:px-8 md:py-12 lg:px-10">
      <div className="grid overflow-hidden rounded-lg border bg-surface lg:grid-cols-2">
        <section className="hidden flex-col justify-between gap-8 bg-primary-700 p-10 text-neutral-0 lg:flex">
          <div className="flex flex-col gap-4">
            <p className="font-display text-h1 text-neutral-0">{t('panelTitle')}</p>
            <p className="max-w-[48ch] text-body text-primary-200">{t('panelText')}</p>
          </div>
          <ul className="flex flex-col gap-3 text-body-sm text-primary-200">
            <li className="flex gap-2.5">
              <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0" />
              {t('linkNote')}
            </li>
            <li className="flex gap-2.5">
              <Icon name="shield-check" className="mt-0.5 h-4 w-4 shrink-0" />
              {t('dataNote')}
            </li>
          </ul>
        </section>
        <section className="flex flex-col justify-center gap-6 p-6 md:p-10">
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-h1-compact text-default">{t('title')}</h1>
            <p className="text-body text-secondary">{t('description')}</p>
          </div>
          <MagicLinkForm callbackPath={callbackPath} />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-body-sm">
            <p className="text-secondary">
              {t('help')}{' '}
              <Link
                href="/support#contact"
                className="font-semibold text-primary-600 underline underline-offset-[3px]"
              >
                {t('helpLink')}
              </Link>
            </p>
            <Link
              href="/"
              className="font-semibold text-primary-600 hover:text-primary-700"
            >
              ← {t('back')}
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
