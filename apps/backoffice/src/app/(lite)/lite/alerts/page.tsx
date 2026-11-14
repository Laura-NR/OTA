import { paymentAlert } from '@ota/domain';
import type { RefundDto, ReservationListItemDto, SupplierDto } from '@ota/schemas';
import { getTranslations } from 'next-intl/server';

import { LiteAlerts, type LitePaymentAlert } from '@/components/ops-lite/lite-alerts';
import { LiteClock } from '@/components/ops-lite/lite-clock';
import { LiteHeader } from '@/components/ops-lite/lite-header';
import { LiteSound } from '@/components/ops-lite/lite-sound';
import { apiFetch, getServerSession } from '@/lib/api';
import { deskClock } from '@/lib/desk-clock';
import { getThresholds } from '@/lib/operating';
import { deskAccess } from '@/lib/overrides';

const ROLE_KEYS: Readonly<Record<string, string>> = {
  SUPER_ADMIN: 'superAdmin',
  OPERATIONS_ADMIN: 'operationsAdmin',
  ADMINISTRATIVE_SUPPORT: 'administrativeSupport',
};

/**
 * AL-Alerts. The red and amber offers come from the desk's live feed; this
 * page reads what else asks for a quick decision: refunds waiting on an
 * approval, first payments and balances past due, and credentials running
 * out within the threshold.
 */
export default async function OpsLiteAlertsPage() {
  const t = await getTranslations('backoffice.opsLite');
  const roles = await getTranslations('backoffice.shell.roles');
  const session = await getServerSession();
  const thresholds = await getThresholds();
  const now = new Date();
  const [refunds, recent, expiring, payAccess] = await Promise.all([
    apiFetch<RefundDto[]>('/refunds').catch(() => []),
    apiFetch<ReservationListItemDto[]>('/reservations?limit=200').catch(() => []),
    apiFetch<SupplierDto[]>(
      `/suppliers/expiring?days=${thresholds.credentialExpiryWindowDays}`,
    ).catch(() => []),
    deskAccess(session?.user.role, 'payments'),
  ]);

  const payments: LitePaymentAlert[] = recent.flatMap((reservation) => {
    const next = reservation.nextInstalment;
    const kind = paymentAlert(
      next ? { kind: next.kind, dueAt: new Date(next.dueAt) } : null,
      reservation.status,
      now,
    );
    return kind && next
      ? [
          {
            reservationId: reservation.id,
            bookingCode: reservation.bookingCode,
            traveler: reservation.travelerName || reservation.travelerEmail,
            kind,
            amount: next.amount,
            currency: reservation.totalCurrency,
            dueAt: next.dueAt,
          },
        ]
      : [];
  });

  const name = session?.user.name?.trim() || session?.user.email || '';
  const roleKey = session?.user.role ? ROLE_KEYS[session.user.role] : undefined;

  return (
    <>
      <LiteHeader
        title={t('alerts.title')}
        subtitle={
          <>
            {[name, roleKey ? roles(roleKey) : null].filter(Boolean).join(' · ')} ·{' '}
            <LiteClock serverNow={now.getTime()} />
          </>
        }
        aside={<LiteSound />}
      />
      <LiteAlerts
        payments={payments}
        refunds={refunds}
        credentials={expiring.map((supplier) => ({
          supplierId: supplier.id,
          name: supplier.fullName ?? supplier.email,
          expiresAt: supplier.credentialExpiresAt,
        }))}
        clock={deskClock(thresholds)}
        canPay={payAccess.canManage}
        canVote={payAccess.byRole}
        you={name}
      />
    </>
  );
}
