import type { PaymentIntentLookupDto } from '@ota/schemas';
import { Alert, Badge, buttonClassName, Icon } from '@ota/ui';
import type { BadgeVariant } from '@ota/ui';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { CopyButton } from '@/components/copy-button';
import { Link } from '@/i18n/navigation';
import { apiFetch } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { getTenantConfig } from '@/lib/tenant';

const STATUS_BADGES: Record<PaymentIntentLookupDto['status'], BadgeVariant> = {
  PENDING: 'accent',
  AUTHORIZED: 'info',
  PAID: 'success',
  FAILED: 'destructive',
  REFUNDED: 'secondary',
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('checkout');
  return { title: t('wireTitle') };
}

function Detail({
  label,
  value,
  mono = false,
  copy,
  note,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copy?: ReactNode;
  note?: string;
}) {
  return (
    <div className="grid gap-x-6 gap-y-0.5 border-b py-3 last:border-b-0 sm:grid-cols-[160px_minmax(0,1fr)]">
      <dt className="text-body-sm text-secondary">{label}</dt>
      <dd className="flex flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-x-3">
          <span
            className={
              mono
                ? 'break-all font-mono text-body text-default'
                : 'text-body font-semibold text-default'
            }
          >
            {value}
          </span>
          {copy}
        </span>
        {note ? <span className="text-caption text-muted">{note}</span> : null}
      </dd>
    </div>
  );
}

/**
 * Bank transfer (Payment / M-Payment boards, the wire rail of spec §7.1). The
 * amount and booking code come from the persisted receipt through the public,
 * PII-free lookup keyed by the unguessable reference, so the URL carries
 * nothing sensitive, and there is deliberately no self-confirm action (ADR
 * 0003): operations confirm the receipt when the funds clear. The board's
 * deposit or full choice, deadline, proof upload and card and open-banking
 * rails wait for the payment schedule (M4) and their providers (Q10).
 */
export default async function WireCheckoutPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const [t, locale] = await Promise.all([getTranslations('checkout'), getLocale()]);
  const tenant = getTenantConfig();
  const bank = tenant.payments.bankTransfer;

  let intent: PaymentIntentLookupDto | null = null;
  try {
    intent = await apiFetch<PaymentIntentLookupDto>(
      `/payments/intents/${encodeURIComponent(reference)}`,
    );
  } catch {
    // Unknown reference or API unavailable: fall through to the "not found" panel.
  }
  const amount = intent ? formatMoney(intent.amount, intent.currency, locale) : null;

  return (
    <div className="mx-auto flex w-full max-w-container flex-col gap-6 px-6 py-8 md:px-8 lg:px-10">
      {intent && bank ? (
        intent.status === 'PAID' ? (
          <Alert variant="success" title={t('paidTitle')}>
            {t('paidText')}
          </Alert>
        ) : (
          <Alert variant="success" title={t('securedTitle')}>
            {t('securedText')}
          </Alert>
        )
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="flex flex-col gap-6 rounded-lg border bg-surface p-6 md:p-8">
          <header className="flex flex-col gap-2">
            <p className="text-overline uppercase text-primary-600">{t('readyToPay')}</p>
            <h1 className="font-display text-h1-compact text-default md:text-h1">
              {t('wireHeading')}
            </h1>
            <p className="max-w-prose text-body-lg text-secondary">
              {t('wireDescription')}
            </p>
          </header>

          {!bank ? (
            <Alert>{t('wireUnavailable')}</Alert>
          ) : !intent ? (
            <Alert>{t('wireNotFound')}</Alert>
          ) : (
            <>
              <div className="flex items-start gap-3 rounded-lg border-2 border-primary-600 bg-primary-50 p-4">
                <Icon name="check-circle" className="mt-0.5 text-primary-600" />
                <div className="flex flex-1 flex-col gap-0.5">
                  <p className="flex flex-wrap items-center justify-between gap-2 text-body font-semibold text-default">
                    {t('method')}
                    <Badge variant="success">{t('noFee')}</Badge>
                  </p>
                  <p className="text-body-sm text-secondary">{t('methodText')}</p>
                </div>
              </div>

              <section aria-labelledby="transfer-details" className="flex flex-col gap-2">
                <h2 id="transfer-details" className="text-h4 text-default">
                  {t('detailsTitle')}
                </h2>
                <dl className="rounded-lg border px-4">
                  <Detail label={t('wireAccountName')} value={bank.accountName} />
                  <Detail label={t('wireBankName')} value={bank.bankName} />
                  <Detail
                    label={t('wireIban')}
                    value={bank.iban}
                    mono
                    copy={
                      <CopyButton
                        value={bank.iban.replace(/\s/g, '')}
                        label={t('wireIban')}
                      />
                    }
                  />
                  {bank.bic ? (
                    <Detail
                      label={t('wireBic')}
                      value={bank.bic}
                      mono
                      copy={<CopyButton value={bank.bic} label={t('wireBic')} />}
                    />
                  ) : null}
                  <Detail
                    label={t('wireReferenceLabel')}
                    value={intent.reference}
                    mono
                    copy={
                      <CopyButton
                        value={intent.reference}
                        label={t('wireReferenceLabel')}
                      />
                    }
                    note={bank.referenceNote ?? t('wireReferenceNote')}
                  />
                  <Detail label={t('wireAmount')} value={amount ?? ''} mono />
                </dl>
              </section>

              <Alert variant="info">{t('wireNotice')}</Alert>
              <p className="text-body-sm text-secondary">{t('wireNextSteps')}</p>
              <p className="flex items-center gap-2 border-t pt-4 text-caption text-muted">
                <Icon name="shield-check" className="h-4 w-4" />
                {t('licence', { license: tenant.branding.licenseNumber })}
              </p>
            </>
          )}
        </section>

        <aside
          aria-labelledby="summary-title"
          className="flex flex-col gap-4 rounded-lg border bg-surface p-6 shadow-md lg:sticky lg:top-24"
        >
          <h2 id="summary-title" className="text-h4 text-default">
            {t('summaryTitle')}
          </h2>
          {intent ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-body text-default">
                  {t('bookingCode', { code: intent.reference })}
                </span>
                <Badge variant={STATUS_BADGES[intent.status]}>
                  {t(`statuses.${intent.status}`)}
                </Badge>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t pt-4">
                <span className="text-body font-semibold text-default">
                  {t('wireAmount')}
                </span>
                <span className="font-mono text-h2-compact text-default">{amount}</span>
              </div>
            </>
          ) : null}
          <Link
            href="/account?tab=trips"
            className={buttonClassName({ variant: 'secondary' })}
          >
            {t('backToAccount')}
          </Link>
          <p className="text-body-sm text-secondary">
            {t('needHelp')}{' '}
            <Link
              href="/support#contact"
              className="font-semibold text-primary-600 underline underline-offset-[3px]"
            >
              {t('helpLink')}
            </Link>
          </p>
        </aside>
      </div>
    </div>
  );
}
