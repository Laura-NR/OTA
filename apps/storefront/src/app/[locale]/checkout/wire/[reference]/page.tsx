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
import { apiFetch } from '@/lib/api';
import { getTenantConfig } from '@/lib/tenant';

interface WireIntent {
  reference: string;
  amount: string;
  currency: string;
  status: string;
}

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
 * Wire-transfer instructions (spec §7.1 primary rail). The amount and booking
 * reference are read from the persisted receipt through a public, PII-free
 * lookup keyed by the unguessable reference, so the URL carries nothing
 * sensitive. There is deliberately no self-confirm action here (ADR 0003).
 */
export default async function WireCheckoutPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const t = await getTranslations('checkout');
  const bank = getTenantConfig().payments.bankTransfer;

  let intent: WireIntent | null = null;
  try {
    intent = await apiFetch<WireIntent>(
      `/payments/intents/${encodeURIComponent(reference)}`,
    );
  } catch {
    // Unknown reference or API unavailable: fall through to the "not found" panel.
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>{t('wireTitle')}</CardTitle>
          <CardDescription>{t('wireDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {!bank ? (
            <Alert>{t('wireUnavailable')}</Alert>
          ) : !intent ? (
            <Alert>{t('wireNotFound')}</Alert>
          ) : (
            <>
              <p>
                <span className="text-muted-foreground">{t('wireAmount')}:</span>{' '}
                <strong>
                  {intent.currency} {Number(intent.amount).toFixed(2)}
                </strong>
              </p>

              <dl className="grid gap-1">
                <Row label={t('wireBankName')} value={bank.bankName} />
                <Row label={t('wireAccountName')} value={bank.accountName} />
                <Row label={t('wireIban')} value={bank.iban} mono />
                {bank.bic ? <Row label={t('wireBic')} value={bank.bic} mono /> : null}
                <Row label={t('wireReferenceLabel')} value={intent.reference} mono />
              </dl>

              <p className="text-muted-foreground">
                {bank.referenceNote ?? t('wireReferenceNote')}
              </p>
              <Alert>{t('wireNotice')}</Alert>
              <p className="text-muted-foreground">{t('wireNextSteps')}</p>
            </>
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
