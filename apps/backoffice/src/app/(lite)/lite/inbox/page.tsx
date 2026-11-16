import { UserRole } from '@ota/domain';
import type { OpsLiteInboxDto } from '@ota/schemas';
import { Alert } from '@ota/ui';
import { getTranslations } from 'next-intl/server';

import { LiteHeader } from '@/components/ops-lite/lite-header';
import { LiteInbox } from '@/components/ops-lite/lite-inbox';
import { apiFetch, getServerSession } from '@/lib/api';

/** AL-Inbox: travelers' and workers' threads, urgent first, with replies from the phone. */
export default async function OpsLiteInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string }>;
}) {
  const { thread } = await searchParams;
  const t = await getTranslations('backoffice.opsLite.inbox');
  const inbox = await apiFetch<OpsLiteInboxDto>('/ops-lite/inbox').catch(() => null);
  const session = await getServerSession();
  const role = session?.user.role;

  return (
    <>
      <LiteHeader title={t('title')} subtitle={t('subtitle')} />
      {inbox ? (
        <LiteInbox
          inbox={inbox}
          initialThread={thread ?? null}
          canWriteWorkers={
            role === UserRole.OperationsAdmin || role === UserRole.SuperAdmin
          }
        />
      ) : (
        <div className="px-5 pt-3.5">
          <Alert variant="destructive">{t('loadError')}</Alert>
        </div>
      )}
    </>
  );
}
