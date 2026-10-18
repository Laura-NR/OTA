import type { ProviderProgressDto } from '@ota/schemas';
import { getTranslations } from 'next-intl/server';

/**
 * Where the provider requests stand while the desk confirms a trip (the
 * D-Proposal "we send the requests to your hosts" step), read from the
 * dispatch ledger. No provider is named; the counts are all a traveler sees.
 */
export async function ProviderProgress({ progress }: { progress: ProviderProgressDto }) {
  const t = await getTranslations('account.providers');
  const share = progress.services > 0 ? progress.confirmed / progress.services : 0;

  return (
    <section
      aria-labelledby="providers-title"
      className="flex flex-col gap-3 rounded-lg border bg-surface p-6"
    >
      <h2 id="providers-title" className="text-h4 text-default">
        {t('title')}
      </h2>
      <p className="text-body font-medium text-default">
        {t('confirmed', { confirmed: progress.confirmed, services: progress.services })}
      </p>
      <div
        role="progressbar"
        aria-label={t('title')}
        aria-valuemin={0}
        aria-valuemax={progress.services}
        aria-valuenow={progress.confirmed}
        className="h-2 w-full overflow-hidden rounded-full bg-neutral-100"
      >
        <div
          className="h-full rounded-full bg-success-600"
          style={{ width: `${Math.round(share * 100)}%` }}
        />
      </div>
      <p className="text-body-sm text-secondary">
        {progress.requestsSent === 0
          ? t('notStarted')
          : t('status', {
              sent: progress.requestsSent,
              awaiting: progress.awaiting,
              arranging: progress.arranging,
            })}
      </p>
    </section>
  );
}
