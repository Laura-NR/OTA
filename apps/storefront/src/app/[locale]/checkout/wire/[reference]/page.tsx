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
import { getTenantConfig } from '@/lib/tenant';

function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="text-muted-foreground">{label}:</dt>
      <dd className={mono ? 'font-mono' : undefined}>{value}</dd>
    </div>
  );
}

/**
 * Wire-transfer instructions (spec §7.1 primary rail). The traveler pays from
 * their own bank and operations confirms the receipt; there is deliberately no
 * self-confirm action here (ADR 0003). Amount/currency come from the checkout
 * URL for display only — the persisted receipt is the source of truth.
 */
export default async function WireCheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<{
    reference?: string;
    amount?: string;
    currency?: string;
  }>;
}) {
  const { reference: providerReference } = await params;
  const { reference, amount, currency } = await searchParams;
  const t = await getTranslations('checkout');
  const bank = getTenantConfig().payments.bankTransfer;

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>{t('wireTitle')}</CardTitle>
          <CardDescription>{t('wireDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {bank ? (
            <>
              {amount ? (
                <p>
                  <span className="text-muted-foreground">{t('wireAmount')}:</span>{' '}
                  <strong>
                    {currency} {amount}
                  </strong>
                </p>
              ) : null}

              <dl className="grid gap-1">
                <Row label={t('wireBankName')} value={bank.bankName} />
                <Row label={t('wireAccountName')} value={bank.accountName} />
                <Row label={t('wireIban')} value={bank.iban} mono />
                {bank.bic ? <Row label={t('wireBic')} value={bank.bic} mono /> : null}
                <Row
                  label={t('wireReferenceLabel')}
                  value={reference ?? providerReference}
                  mono
                />
              </dl>

              <p className="text-muted-foreground">
                {bank.referenceNote ?? t('wireReferenceNote')}
              </p>
              <Alert>{t('wireNotice')}</Alert>
            </>
          ) : (
            <Alert>{t('wireUnavailable')}</Alert>
          )}

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
