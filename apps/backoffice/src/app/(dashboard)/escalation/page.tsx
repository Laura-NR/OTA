import { UserRole } from '@ota/domain';
import type { DispatchViewDto } from '@ota/schemas';

import { EscalationBoard } from '@/components/escalation-board';
import { PageHeader } from '@/components/page-header';
import { apiFetch, getServerSession } from '@/lib/api';

const MANAGE_ROLES: readonly string[] = [UserRole.OperationsAdmin, UserRole.SuperAdmin];

export default async function EscalationPage() {
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
      <PageHeader
        title="Escalation"
        description="Live dispatch and timeout monitoring for the operations desk. Amber at 75%, red at 100% or on decline."
      />
      <EscalationBoard initialViews={views} canManage={canManage} />
    </div>
  );
}
