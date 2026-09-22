import { DEFAULT_LOCALE } from '@ota/i18n';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ota/ui';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { MagicLinkForm } from '@/components/magic-link-form';
import { getServerSession } from '@/lib/api';

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
    <main className="mx-auto flex max-w-5xl justify-center px-4 py-16">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <MagicLinkForm callbackPath={callbackPath} />
        </CardContent>
      </Card>
    </main>
  );
}
