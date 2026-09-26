import { UserRole } from '@ota/domain';
import type { DispatchViewDto, ReservationDto } from '@ota/schemas';
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

import { CandidatesList } from '@/components/candidates-list';
import { StartDispatchButton } from '@/components/dispatch-controls';
import { PageHeader } from '@/components/page-header';
import { ReservationPicker } from '@/components/reservation-picker';
import { apiFetch, getServerSession } from '@/lib/api';

const MANAGE_ROLES: readonly string[] = [UserRole.OperationsAdmin, UserRole.SuperAdmin];

function escalationVariant(
  escalation: DispatchViewDto['serviceItems'][number]['escalation'],
) {
  if (escalation === 'RED') return 'destructive' as const;
  if (escalation === 'AMBER') return 'timeout' as const;
  return 'outline' as const;
}

export default async function DispatchPage({
  searchParams,
}: {
  searchParams: Promise<{ reservation?: string }>;
}) {
  const { reservation } = await searchParams;
  const t = await getTranslations('backoffice.dispatch');
  const session = await getServerSession();
  const canManage = session?.user.role ? MANAGE_ROLES.includes(session.user.role) : false;

  let reservations: ReservationDto[] = [];
  let view: DispatchViewDto | null = null;
  let loadError: string | null = null;

  try {
    reservations = await apiFetch<ReservationDto[]>('/reservations');
    if (reservation) {
      view = await apiFetch<DispatchViewDto>(`/reservations/${reservation}/dispatch`);
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : t('loadError');
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      <ReservationPicker
        id="dispatch-reservation"
        action="/dispatch"
        reservations={reservations}
        selectedId={reservation}
      />

      {loadError ? <Alert variant="destructive">{loadError}</Alert> : null}

      {view ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {t('reservationStatus', { status: view.status.replaceAll('_', ' ') })}
            </CardTitle>
            <CardDescription>
              {t('serviceItems', { count: view.serviceItems.length })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <StartDispatchButton
              reservationId={view.reservationId}
              canManage={canManage}
            />

            {view.serviceItems.length === 0 ? (
              <Alert>{t('noServiceItems')}</Alert>
            ) : (
              view.serviceItems.map((item) => (
                <Card key={item.id}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      {item.serviceType.replaceAll('_', ' ')} —{' '}
                      {item.status.replaceAll('_', ' ')}
                    </CardTitle>
                    <CardDescription>
                      {item.province ?? t('anyProvince')} · {t('deadline')}{' '}
                      {item.deadline ? new Date(item.deadline).toLocaleString() : '—'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">{t('escalation')}</span>
                      <Badge variant={escalationVariant(item.escalation)}>
                        {item.escalation}
                      </Badge>
                      <span className="text-muted-foreground">{t('supplier')}</span>
                      <span>{item.supplierId ?? t('unassigned')}</span>
                    </div>
                    {item.status === 'UNASSIGNED' || item.status === 'DECLINED' ? (
                      <CandidatesList serviceItemId={item.id} />
                    ) : null}
                  </CardContent>
                </Card>
              ))
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
