import {
  AMBER_THRESHOLD,
  CREDENTIAL_EXPIRY_WINDOW_DAYS,
  DEFAULT_DISPATCH_TIMEOUT_MS,
  RETENTION_EXTENSION_MONTHS,
  RETENTION_GRACE_DAYS,
  RETENTION_TRIGGER_MONTHS,
  SHORT_NOTICE_DISPATCH_TIMEOUT_MS,
  SHORT_NOTICE_WINDOW_MS,
} from '@ota/domain';
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@ota/ui';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { PageHeader } from '@/components/page-header';
import { getTenantConfig } from '@/lib/tenant';

const HOUR_MS = 60 * 60 * 1000;

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[minmax(10rem,auto)_1fr]">
      {rows.map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="text-body-sm font-medium text-secondary">{term}</dt>
          <dd className="text-body-sm text-default">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * A-Settings, read-only: the tenant manifest the desk runs on and the operating
 * thresholds. Changing them is a deploy for now; runtime thresholds with a
 * second approval arrive with M9 (design plan Q12, Q13).
 */
export default async function SettingsPage() {
  const t = await getTranslations('backoffice.settings');
  const tenant = getTenantConfig();
  const yes = t('yes');
  const no = t('no');

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />
      <Alert>{t('readOnly')}</Alert>

      <Card>
        <CardHeader>
          <CardTitle>{t('agency')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Facts
            rows={[
              [t('agencyName'), tenant.branding.agencyName],
              [t('license'), tenant.branding.licenseNumber],
              [
                t('primaryColor'),
                <span key="colour" className="inline-flex items-center gap-2 font-mono">
                  <span
                    aria-hidden="true"
                    className="h-4 w-4 rounded-sm border"
                    style={{ background: tenant.branding.primaryColor }}
                  />
                  {tenant.branding.primaryColor}
                </span>,
              ],
              [t('palette'), `${tenant.theme.palette} · ${tenant.theme.borderRadius}`],
              [
                t('locales'),
                `${tenant.supportedLocales.join(', ')} (${t('primaryLocale', { locale: tenant.primaryLocale })})`,
              ],
              [t('supportEmail'), tenant.branding.supportEmail ?? '—'],
              [t('supportPhone'), tenant.branding.supportPhone ?? '—'],
              [t('whatsapp'), tenant.branding.whatsappNumber ?? '—'],
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('features')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {Object.entries(tenant.features).map(([flag, enabled]) => (
            <Badge key={flag} variant={enabled ? 'success' : 'outline'}>
              {flag} · {enabled ? yes : no}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('thresholds')}</CardTitle>
          <CardDescription>{t('thresholdsDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Facts
            rows={[
              [
                t('dispatchTimeout'),
                t('hours', { count: DEFAULT_DISPATCH_TIMEOUT_MS / HOUR_MS }),
              ],
              [
                t('shortNoticeTimeout'),
                t('shortNotice', {
                  minutes: SHORT_NOTICE_DISPATCH_TIMEOUT_MS / 60_000,
                  hours: SHORT_NOTICE_WINDOW_MS / HOUR_MS,
                }),
              ],
              [t('amber'), `${Math.round(AMBER_THRESHOLD * 100)} %`],
              [
                t('credentialWindow'),
                t('days', { count: CREDENTIAL_EXPIRY_WINDOW_DAYS }),
              ],
              [
                t('retention'),
                t('retentionRule', {
                  months: RETENTION_TRIGGER_MONTHS,
                  days: RETENTION_GRACE_DAYS,
                  extension: RETENTION_EXTENSION_MONTHS,
                }),
              ],
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('payments')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Facts
            rows={[
              [t('bankTransfer'), tenant.payments.bankTransfer ? yes : no],
              [t('cardRail'), tenant.features.creditCardGatewayRail ? t('cardMock') : no],
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('emergency')}</CardTitle>
        </CardHeader>
        <CardContent>
          {tenant.emergencyContacts.length === 0 ? (
            <p className="text-body-sm text-muted">—</p>
          ) : (
            <Facts
              rows={tenant.emergencyContacts.map((contact) => [
                contact.label,
                contact.phone,
              ])}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
