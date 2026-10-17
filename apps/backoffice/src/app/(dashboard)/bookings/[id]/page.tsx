import {
  BOOKING_PIPELINE,
  UserRole,
  pipelinePosition,
  travelerStatus,
} from '@ota/domain';
import type {
  AuditLogEntryDto,
  DispatchViewDto,
  DocumentDto,
  IncidentDto,
  PackageDto,
  PaymentReceiptDto,
  ReservationDetailDto,
  ReservationOfacDto,
  ReservationPartyDto,
  ReservationPriceLinesDto,
} from '@ota/schemas';
import { Badge, buttonClassName, cn, Icon, Stepper, Tag } from '@ota/ui';
import type { StepperStep } from '@ota/ui';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { BookingServices, type ItemOffer } from '@/components/booking-services';
import { IncidentLogForm } from '@/components/incident-log-form';
import { IncidentResolveButton } from '@/components/incident-resolve-button';
import { KpiCard } from '@/components/kpi-card';
import { OfacPanel } from '@/components/ofac-panel';
import { PaymentPanel } from '@/components/payment-panel';
import { PriceBreakdown } from '@/components/price-breakdown';
import { ReservationActions } from '@/components/reservation-actions';
import { StatusBadge } from '@/components/status-badge';
import { TourismCategoryControl } from '@/components/tourism-category-control';
import { TravelParty } from '@/components/travel-party';
import { apiFetch, getServerSession } from '@/lib/api';
import { ApiError } from '@/lib/errors';
import { bookingDates, money, opsDate, opsTime, percent } from '@/lib/ops-format';

const MANAGE_ROLES: readonly string[] = [UserRole.OperationsAdmin, UserRole.SuperAdmin];
const DAY_MS = 24 * 60 * 60 * 1000;

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="rounded-lg border bg-surface">
      <div className="flex flex-col gap-0.5 px-5 pb-3 pt-4">
        <h2 id={id} className="font-display text-h2-compact">
          {title}
        </h2>
        {description ? <p className="text-caption text-muted">{description}</p> : null}
      </div>
      <div className="pb-5">{children}</div>
    </section>
  );
}

/**
 * One booking on the desk (A-Booking): who, when and how much at the top, its
 * progress through the pipeline, the legal moves, the services with their
 * workers and timers, payments, duty of care, documents and the audit log.
 */
export default async function BookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations('backoffice.reservation');
  const traveler = await getTranslations('status.traveler');
  const locale = await getLocale();
  const session = await getServerSession();
  const canManage = session?.user.role ? MANAGE_ROLES.includes(session.user.role) : false;

  const reservation = await apiFetch<ReservationDetailDto>(`/reservations/${id}`).catch(
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 404) {
        notFound();
      }
      throw error;
    },
  );

  const [audit, documents, payments, incidents, dispatch, party, priceLines, pkg, ofac] =
    await Promise.all([
      apiFetch<AuditLogEntryDto[]>(`/reservations/${id}/audit`).catch(() => []),
      apiFetch<DocumentDto[]>(`/reservations/${id}/documents`).catch(() => []),
      apiFetch<PaymentReceiptDto[]>(`/reservations/${id}/payments`).catch(() => []),
      apiFetch<IncidentDto[]>(`/incidents?reservationId=${id}`).catch(() => []),
      apiFetch<DispatchViewDto>(`/reservations/${id}/dispatch`).catch(() => null),
      apiFetch<ReservationPartyDto>(`/reservations/${id}/travelers`).catch(() => null),
      apiFetch<ReservationPriceLinesDto>(`/reservations/${id}/price-lines`).catch(
        () => null,
      ),
      reservation.packageId
        ? apiFetch<PackageDto>(`/packages/${reservation.packageId}`).catch(() => null)
        : Promise.resolve(null),
      apiFetch<ReservationOfacDto>(`/reservations/${id}/ofac`).catch(() => null),
    ]);

  const now = new Date();
  const currency = reservation.totalCurrency;
  const total = Number(reservation.totalAmount);
  const cost = reservation.serviceItems.reduce(
    (sum, item) => sum + Number(item.payoutRate),
    0,
  );
  const paid = Number(reservation.paidAmount);
  const nights = Math.max(
    0,
    Math.round(
      (new Date(reservation.endDate).getTime() -
        new Date(reservation.startDate).getTime()) /
        DAY_MS,
    ),
  );
  const offers: Record<string, ItemOffer> = Object.fromEntries(
    (dispatch?.serviceItems ?? []).map((item) => [
      item.id,
      {
        offeredAt: item.offeredAt,
        deadline: item.deadline,
        workerPhone: item.workerPhone,
      },
    ]),
  );

  const position = pipelinePosition(reservation.status);
  const steps: StepperStep[] = BOOKING_PIPELINE.map((status, index) => ({
    id: status,
    label: t(`timeline.steps.${status}`),
    state:
      position === null || index > position.index
        ? 'upcoming'
        : index < position.index || position.finished
          ? 'done'
          : position.blocked
            ? 'error'
            : 'current',
  }));
  const progressLabel =
    position === null
      ? t('timeline.cancelled')
      : position.index < 0
        ? t('timeline.draft')
        : t('timeline.progress', {
            step: position.index + 1,
            total: BOOKING_PIPELINE.length,
            label: t(`timeline.steps.${BOOKING_PIPELINE[position.index]!}`),
          });

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label={t('breadcrumbLabel')} className="text-body-sm text-muted">
        <ol className="flex items-center gap-1.5">
          <li>
            <Link href="/bookings" className="hover:text-default">
              {t('breadcrumb')}
            </Link>
          </li>
          <li aria-hidden="true">
            <Icon name="chevron-right" className="h-4 w-4" />
          </li>
          <li aria-current="page" className="font-mono text-default">
            {reservation.bookingCode}
          </li>
        </ol>
      </nav>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-h3">{reservation.bookingCode}</h1>
          <Badge variant="secondary">
            {traveler(travelerStatus(reservation.status))}
          </Badge>
          <StatusBadge status={reservation.status} />
        </div>
        <p className="text-body-sm text-secondary">
          {t('summary', {
            traveler: reservation.travelerName || reservation.travelerEmail,
            dates: bookingDates(reservation.startDate, reservation.endDate, locale),
            nights,
            package: reservation.packageName ?? t('custom'),
          })}
          {' · '}
          {t('created', {
            date: opsDate(reservation.createdAt, locale),
            time: opsTime(reservation.createdAt, locale),
          })}
        </p>
        {reservation.provinces.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {reservation.provinces.map((province) => (
              <Tag key={province}>{province}</Tag>
            ))}
          </div>
        ) : null}
      </div>

      <section
        aria-label={t('kpi.label')}
        className="grid grid-cols-2 gap-4 xl:grid-cols-4"
      >
        <KpiCard overline={t('kpi.total', { currency })}>
          <span className="font-mono text-h1-compact">
            {money(total, currency, locale)}
          </span>
          <span className="text-caption text-muted">
            {t('kpi.services', { count: reservation.serviceItemCount })}
          </span>
        </KpiCard>
        <KpiCard overline={t('kpi.cost')}>
          <span className="font-mono text-h1-compact">
            {money(cost, currency, locale)}
          </span>
          <span className="text-caption text-muted">
            {cost > 0 && total > 0
              ? t('kpi.margin', { rate: percent((total - cost) / total, locale) })
              : t('kpi.noCost')}
          </span>
        </KpiCard>
        <KpiCard overline={t('kpi.dispatch')}>
          <span className="font-display text-h2">
            {t('kpi.dispatchOf', {
              accepted: reservation.serviceItemsAccepted,
              total: reservation.serviceItemCount,
            })}
          </span>
          <span className="text-caption text-muted">{t('kpi.dispatchNote')}</span>
        </KpiCard>
        <KpiCard overline={t('kpi.paid')}>
          <span className="font-mono text-h1-compact">
            {money(paid, currency, locale)}
          </span>
          <span className="text-caption text-muted">
            {t('kpi.paidOf', { total: money(total, currency, locale) })}
          </span>
        </KpiCard>
      </section>

      <Section id="timeline-title" title={t('timeline.title')}>
        <div className="px-5">
          <Stepper steps={steps} progressLabel={progressLabel} />
        </div>
      </Section>

      <Section
        id="actions-title"
        title={t('actions.title')}
        description={t('actions.description')}
      >
        <div className="flex flex-col gap-4 px-5">
          <ReservationActions
            reservationId={reservation.id}
            status={reservation.status}
            canManage={canManage}
          />
          <TourismCategoryControl
            reservationId={reservation.id}
            category={reservation.tourismCategory}
            canManage={canManage}
          />
          <Link
            href={`/bookings/messages?reservation=${reservation.id}`}
            className={cn(
              buttonClassName({ variant: 'secondary', size: 'sm' }),
              'self-start',
            )}
          >
            <Icon name="message-circle" />
            {t('actions.messages')}
          </Link>
        </div>
      </Section>

      <Section id="services-title" title={t('services.title')}>
        <BookingServices
          reservationId={reservation.id}
          bookingCode={reservation.bookingCode}
          status={reservation.status}
          startDate={reservation.startDate}
          endDate={reservation.endDate}
          currency={currency}
          items={reservation.serviceItems}
          offers={offers}
          serverNow={now.getTime()}
          canManage={canManage}
        />
      </Section>

      {party ? (
        <Section
          id="party-title"
          title={t('party.title')}
          description={t('party.description')}
        >
          <div className="px-5">
            <TravelParty
              reservationId={reservation.id}
              party={party}
              options={{
                tiers: pkg?.tiers ?? [],
                departures: pkg?.departures ?? [],
                extras: pkg?.extras ?? [],
              }}
              startDate={reservation.startDate}
              currency={currency}
              canManage={canManage}
            />
          </div>
        </Section>
      ) : null}

      {ofac ? (
        <Section
          id="ofac-title"
          title={t('ofac.title')}
          description={t('ofac.description')}
        >
          <div className="px-5">
            <OfacPanel reservationId={reservation.id} ofac={ofac} canManage={canManage} />
          </div>
        </Section>
      ) : null}

      {priceLines && party ? (
        <Section
          id="price-title"
          title={t('price.title', { currency })}
          description={t('price.description')}
        >
          <div className="px-5">
            <PriceBreakdown lines={priceLines} priced={party.priced} />
          </div>
        </Section>
      ) : null}

      <Section
        id="payments-title"
        title={t('payments')}
        description={t('paymentsDescription')}
      >
        <div className="px-5">
          <PaymentPanel
            reservationId={reservation.id}
            status={reservation.status}
            canManage={canManage}
            receipts={payments}
          />
        </div>
      </Section>

      <Section
        id="care-title"
        title={t('dutyOfCare')}
        description={t('dutyOfCareDescription')}
      >
        <div className="flex flex-col gap-4 px-5">
          {incidents.length === 0 ? (
            <p className="text-body-sm text-muted">{t('noIncidents')}</p>
          ) : (
            <ul className="flex flex-col gap-2 text-body-sm">
              {incidents.map((incident) => (
                <li key={incident.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        incident.severity === 'HIGH' || incident.severity === 'CRITICAL'
                          ? 'destructive'
                          : 'secondary'
                      }
                    >
                      {incident.severity}
                    </Badge>
                    <span className="font-medium">{incident.category}</span>
                    <span className="text-caption text-muted">
                      {incident.resolvedAt ? t('resolved') : t('open')}
                    </span>
                    {incident.resolvedAt ? null : (
                      <span className="ml-auto">
                        <IncidentResolveButton incidentId={incident.id} />
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-muted">{incident.description}</p>
                </li>
              ))}
            </ul>
          )}
          {canManage ? <IncidentLogForm reservationId={reservation.id} /> : null}
        </div>
      </Section>

      <Section
        id="documents-title"
        title={t('documents')}
        description={t('documentsDescription')}
      >
        <div className="px-5">
          {documents.length === 0 ? (
            <p className="text-body-sm text-muted">{t('noDocuments')}</p>
          ) : (
            <ul className="flex flex-col divide-y rounded-md border text-body-sm">
              {documents.map((document) => (
                <li
                  key={document.id}
                  className="flex flex-wrap items-center gap-3 px-3 py-2.5"
                >
                  <Badge variant="outline">{document.type.replaceAll('_', ' ')}</Badge>
                  <a
                    className="ml-auto font-medium text-primary-600 underline-offset-4 hover:underline"
                    href={`/api/ota/documents/${document.id}/download`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t('downloadPdf')}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      <Section
        id="audit-title"
        title={t('auditTrail')}
        description={t('auditEvents', { count: audit.length })}
      >
        <div className="px-5">
          {audit.length === 0 ? (
            <p className="text-body-sm text-muted">{t('noAudit')}</p>
          ) : (
            <ol className="flex flex-col divide-y rounded-md border text-body-sm">
              {audit.map((entry) => (
                <li
                  key={entry.id}
                  className="grid gap-x-4 gap-y-1 px-3 py-2.5 md:grid-cols-[9rem_12rem_minmax(0,1fr)]"
                >
                  <span className="font-mono text-caption text-muted">
                    {opsDate(entry.createdAt, locale)} ·{' '}
                    {opsTime(entry.createdAt, locale)}
                  </span>
                  <span className="truncate">{entry.actorEmail ?? t('system')}</span>
                  <div className="min-w-0">
                    <span className="font-mono">{entry.action}</span>
                    {entry.metadata ? (
                      <p className="break-all text-caption text-muted">
                        {JSON.stringify(entry.metadata)}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </Section>
    </div>
  );
}
