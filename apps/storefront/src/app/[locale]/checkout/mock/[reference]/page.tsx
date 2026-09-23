import {
  Alert,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@ota/ui';
import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';

/**
 * Mock gateway landing page (ADR 0003 open item). It deliberately has no
 * "mark paid" action: confirmation is an authenticated operations step, so an
 * unauthenticated self-confirm route never exists.
 */
export default async function MockCheckoutPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const t = await getTranslations('checkout');

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>{t('mockTitle')}</CardTitle>
          <CardDescription>{t('mockDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p>
            <span className="text-muted-foreground">{t('reference')}:</span>{' '}
            <code className="rounded bg-muted px-1.5 py-0.5">{reference}</code>
          </p>
          <Alert>{t('mockNotice')}</Alert>
          <Link
            href="/account"
            className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {t('backToAccount')}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
