import type { WorkerAppLatestDto } from '@ota/schemas';
import { Alert, buttonClassName, Card, CardContent, cn } from '@ota/ui';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';

import { apiBaseUrl } from '@/lib/api';
import { getTenantConfig } from '@/lib/tenant';

const wrap = 'mx-auto w-full max-w-container px-6 md:px-8 lg:px-10';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('workerApp');
  return { title: t('title') };
}

/** The release, or null when the API cannot be reached (the page still explains). */
async function latestRelease(): Promise<WorkerAppLatestDto['release']> {
  try {
    const response = await fetch(`${apiBaseUrl()}/worker-app/latest`, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    return ((await response.json()) as WorkerAppLatestDto).release;
  } catch {
    return null;
  }
}

/**
 * The worker app's download page (ADR 0007 A3;
 * `docs/worker-app-distribution-plan.md` U1a, U7a), where approved workers are
 * sent: what the app is, the version, size and date, the arm64 download and
 * the 32-bit one for older phones, the signing certificate's fingerprint,
 * the install steps and what to do when the install fails, and the desk's
 * phone. An iPhone sees that the app is Android only. The files are served
 * by the API through the same-origin rewrite, with ranges, so a cut download
 * resumes.
 */
export default async function WorkerAppPage() {
  const [release, t, locale, requestHeaders] = await Promise.all([
    latestRelease(),
    getTranslations('workerApp'),
    getLocale(),
    headers(),
  ]);
  const tenant = getTenantConfig();
  const deskPhone =
    tenant.branding.supportPhone ?? tenant.emergencyContacts[0]?.phone ?? null;
  const iphone = /iPhone|iPad|iPod/.test(requestHeaders.get('user-agent') ?? '');
  const size = (bytes: number) =>
    `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(bytes / 1_000_000)} MB`;
  const arm64 = release?.apks.find((apk) => apk.abi === 'arm64-v8a') ?? release?.apks[0];
  const older = release?.apks.find((apk) => apk.abi === 'armeabi-v7a' && apk !== arm64);
  const steps = ['download', 'open', 'allow', 'protect', 'signIn'] as const;
  const failures = ['space', 'corrupt', 'conflict', 'old'] as const;

  return (
    <div className={cn(wrap, 'py-10 md:py-14')}>
      <div className="flex max-w-3xl flex-col gap-8">
        <header className="flex flex-col gap-4">
          <h1 className="text-h1 md:text-display-2">{t('title')}</h1>
          <p className="max-w-[60ch] text-body-lg text-neutral-600">{t('lede')}</p>
        </header>

        {iphone ? (
          <Alert variant="warning" title={t('iphoneTitle')}>
            {t('iphoneText')}
          </Alert>
        ) : null}

        {release && arm64 ? (
          <Card>
            <CardContent className="flex flex-col gap-4 pt-6">
              <div className="flex flex-col gap-1">
                <h2 className="text-h3">
                  {t('version', { version: release.versionName })}
                </h2>
                <p className="text-body-sm tabular-nums text-neutral-600">
                  {t('meta', {
                    size: size(arm64.sizeBytes),
                    date: new Intl.DateTimeFormat(locale, {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    }).format(new Date(release.publishedAt)),
                  })}
                </p>
                {release.notes ? <p className="text-body">{release.notes}</p> : null}
              </div>
              <div className="flex flex-col gap-2">
                <a
                  href={`/api/ota${arm64.path}`}
                  download
                  className={cn(buttonClassName({ size: 'lg' }), 'self-start')}
                >
                  {t('download')}
                </a>
                <p className="text-body-sm text-neutral-600">{t('downloadHint')}</p>
                {older ? (
                  <a
                    href={`/api/ota${older.path}`}
                    download
                    className="self-start font-semibold text-primary-700 underline underline-offset-[3px]"
                  >
                    {t('older', { size: size(older.sizeBytes) })}
                  </a>
                ) : null}
              </div>
              <div className="flex flex-col gap-1 border-t border-neutral-200 pt-4">
                <h3 className="text-body-sm font-semibold">{t('certificateTitle')}</h3>
                <p
                  className="break-all font-mono text-body-sm text-neutral-900"
                  data-testid="certificate"
                >
                  {release.certificateSha256}
                </p>
                <p className="text-body-sm text-neutral-600">{t('certificateText')}</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Alert variant="info">{t('notPublished')}</Alert>
        )}

        <section className="flex flex-col gap-3" aria-labelledby="steps">
          <h2 id="steps" className="text-h3">
            {t('stepsTitle')}
          </h2>
          <ol className="flex list-decimal flex-col gap-2 pl-6 text-body">
            {steps.map((step) => (
              <li key={step}>{t(`steps.${step}`)}</li>
            ))}
          </ol>
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="failures">
          <h2 id="failures" className="text-h3">
            {t('failTitle')}
          </h2>
          <ul className="flex list-disc flex-col gap-2 pl-6 text-body">
            {failures.map((failure) => (
              <li key={failure}>{t(`fail.${failure}`)}</li>
            ))}
          </ul>
        </section>

        {deskPhone ? (
          <p className="text-body">
            <a
              href={`tel:${deskPhone.replace(/[^\d+]/g, '')}`}
              className="font-semibold text-primary-700 underline underline-offset-[3px]"
            >
              {t('desk', { phone: deskPhone })}
            </a>
          </p>
        ) : null}
      </div>
    </div>
  );
}
