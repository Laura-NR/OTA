import type { OpsLiteInboxDto } from '@ota/schemas';
import { Alert } from '@ota/ui';
import { getTranslations } from 'next-intl/server';

import { LiteHeader } from '@/components/ops-lite/lite-header';
import { LiteInbox } from '@/components/ops-lite/lite-inbox';
import { apiFetch } from '@/lib/api';

/** AL-Inbox: the travelers' threads, urgent first, with replies from the phone. */
export default async function OpsLiteInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string }>;
}) {
  const { thread } = await searchParams;
  const t = await getTranslations('backoffice.opsLite.inbox');
  const inbox = await apiFetch<OpsLiteInboxDto>('/ops-lite/inbox').catch(() => null);

  return (
    <>
      <LiteHeader title={t('title')} subtitle={t('subtitle')} />
      {inbox ? (
        <LiteInbox inbox={inbox} initialThread={thread ?? null} />
      ) : (
        <div className="px-5 pt-3.5">
          <Alert variant="destructive">{t('loadError')}</Alert>
        </div>
      )}
    </>
  );
}
