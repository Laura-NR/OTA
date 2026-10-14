import { UserRole } from '@ota/domain';
import type { DispatchViewDto } from '@ota/schemas';
import { getTranslations } from 'next-intl/server';

import { EscalationBoard } from '@/components/escalation-board';
import { PageHeader } from '@/components/page-header';
import { apiFetch, getServerSession } from '@/lib/api';

const MANAGE_ROLES: readonly string[] = [UserRole.OperationsAdmin, UserRole.SuperAdmin];

export default async function EscalationPage() {
  const t = await getTranslations('backoffice.escalation');
  const session = await getServerSession();
  const canManage = session?.user.role ? MANAGE_ROLES.includes(session.user.role) : false;

  let views: DispatchViewDto[];
  try {
    views = await apiFetch<DispatchViewDto[]>('/dispatch/active');
  } catch {
    views = [];
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />
      <EscalationBoard initialViews={views} canManage={canManage} />
    </div>
  );
}
