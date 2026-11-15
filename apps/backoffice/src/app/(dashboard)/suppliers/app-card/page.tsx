import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { WorkerAppLatestDto } from '@ota/schemas';
import { Alert, Card, CardContent } from '@ota/ui';
import { getLocale, getTranslations } from 'next-intl/server';

import { PageHeader } from '@/components/page-header';
import { PrintButton } from '@/components/print-button';
import { apiFetch } from '@/lib/api';
import { getTenantConfig, resolveTenantConfigPath } from '@/lib/tenant';

/**
 * The QR made once for the download link (U6a). The link never changes, so
 * the tenant keeps the image beside its manifest; an <img> never runs what
 * an SVG holds.
 */
async function qrDataUri(): Promise<string | null> {
  try {
    const svg = await readFile(
      join(dirname(resolveTenantConfigPath()), 'assets', 'worker-app', 'qr.svg'),
    );
    return `data:image/svg+xml;base64,${svg.toString('base64')}`;
  } catch {
    return null;
  }
}

/**
 * The worker app card (ADR 0007 A3; `docs/worker-app-distribution-plan.md`
 * U6a): the download link and its QR, printed for the desk, with the current
 * version and the signing certificate workers can compare.
 */
export default async function WorkerAppCardPage() {
  const [t, locale, qr, latest] = await Promise.all([
    getTranslations('backoffice.appCard'),
    getLocale(),
    qrDataUri(),
    apiFetch<WorkerAppLatestDto>('/worker-app/latest').catch(() => null),
  ]);
  const tenant = getTenantConfig();
  const release = latest?.release ?? null;

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')}>
        <PrintButton label={t('print')} />
      </PageHeader>

      {latest ? (
        <Card className="max-w-md">
          <CardContent className="flex flex-col items-center gap-4 pt-6 text-center">
            <p className="text-overline uppercase text-muted">
              {tenant.branding.agencyName}
            </p>
            <h2 className="text-h3 font-semibold">{t('heading')}</h2>
            {qr ? (
              <img
                src={qr}
                alt={t('qrAlt', { url: latest.downloadUrl })}
                className="size-48"
              />
            ) : null}
            <p className="text-body-sm">{t('scan')}</p>
            <p className="break-all font-mono text-body font-semibold">
              {latest.downloadUrl}
            </p>
            {release ? (
              <>
                <p className="text-body-sm text-muted">
                  {t('version', {
                    version: release.versionName,
                    date: new Intl.DateTimeFormat(locale, {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    }).format(new Date(release.publishedAt)),
                  })}
                </p>
                <div className="flex flex-col gap-1">
                  <p className="text-caption text-muted">{t('fingerprint')}</p>
                  <p className="break-all font-mono text-caption">
                    {release.certificateSha256}
                  </p>
                </div>
              </>
            ) : (
              <p className="text-body-sm text-muted">{t('notPublished')}</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {latest && !qr ? (
        <Alert variant="info" className="max-w-md print:hidden">
          {t('noQr')}
        </Alert>
      ) : null}
    </div>
  );
}
