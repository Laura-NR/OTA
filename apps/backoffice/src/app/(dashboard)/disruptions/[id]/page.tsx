import { CUBA_PROVINCE_NAMES, UserRole, zonedWallClock } from '@ota/domain';
import type { DisruptionCaseDto, DisruptionLogEntryDto } from '@ota/schemas';
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
} from '@ota/ui';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  AttachForm,
  CaseHeaderActions,
  DeskChoiceForm,
  DraftBannerButton,
  OptionsEditor,
  SafetyForm,
  SendOptionsForm,
  SeverityControl,
  StepDoneButton,
} from '@/components/disruption-actions';
import { PageHeader } from '@/components/page-header';
import { SEVERITY_BADGE, STATUS_BADGE } from '@/lib/advisories';
import { apiFetch, getServerSession } from '@/lib/api';
import { DISRUPTION_SEVERITY_BADGE, SAFETY_BADGE } from '@/lib/disruptions';
import { ApiError } from '@/lib/errors';
import {
  bookingDates,
  calendarDate,
  hoursMinutes,
  opsDate,
  opsTime,
} from '@/lib/ops-format';
import { getTenantConfig } from '@/lib/tenant';

const MANAGE_ROLES: readonly string[] = [UserRole.OperationsAdmin, UserRole.SuperAdmin];
const HOUR_MS = 3_600_000;

/**
 * One disruption case (A-Disruption): the header and counts, severity and its
 * escalation path, the copied playbook, the traveler options and sending
 * them, the status board, attaching bookings, the linked site banner (M7)
 * and the case log read from the audit trail.
 */
export default async function DisruptionCasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [t, advisoriesT, locale, session] = await Promise.all([
    getTranslations('disruptionsDesk'),
    getTranslations('advisoriesDesk'),
    getLocale(),
    getServerSession(),
  ]);
  const item = await apiFetch<DisruptionCaseDto>(`/disruptions/${id}`).catch((error) => {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
      return null;
    }
    throw error;
  });
  if (!item) {
    notFound();
  }
  const { disruptions } = getTenantConfig();
  const scenario = disruptions.scenarios.find((entry) => entry.key === item.scenario);
  const now = new Date();
  const open = item.status === 'OPEN';
  const canManage =
    open && (session?.user.role ? MANAGE_ROLES.includes(session.user.role) : false);
  const when = (value: string) => `${opsDate(value, locale)} ${opsTime(value, locale)}`;
  const scenarioLabel = item.scenarioLabel ?? item.scenario;
  const provinceName = item.province
    ? (CUBA_PROVINCE_NAMES[item.province] ?? item.province)
    : null;
  const openedFor = hoursMinutes(now.getTime() - new Date(item.openedAt).getTime());
  // The log is newest first, so the opening is its last line.
  const opener = [...item.log]
    .reverse()
    .find((entry) => entry.action === 'disruption.opened');
  const doneSteps = item.steps.filter((step) => step.doneAt !== null).length;
  const optionKeys = item.options.map((option) => option.key);
  const defaultKey =
    scenario && optionKeys.includes(scenario.defaultOption)
      ? scenario.defaultOption
      : (optionKeys[0] ?? 'A');
  const emailed = item.log.filter(
    (entry) => entry.action === 'disruption.options_delivered',
  ).length;
  const banner = item.advisories[0] ?? null;
  const pendingBanner = item.advisories.some(
    (advisory) =>
      advisory.displayStatus === 'DRAFT' || advisory.displayStatus === 'IN_REVIEW',
  );

  const severityName = (value: unknown) =>
    typeof value === 'string' && ['MINOR', 'MAJOR', 'EMERGENCY'].includes(value)
      ? t(`severities.${value as 'MINOR'}`)
      : String(value ?? '');
  const logText = (entry: DisruptionLogEntryDto): string => {
    const meta = entry.metadata ?? {};
    const code = String(meta.bookingCode ?? '');
    switch (entry.action) {
      case 'disruption.opened':
        return t('log.actions.opened', { severity: severityName(meta.severity) });
      case 'disruption.booking_attached':
        return t('log.actions.booking_attached', { code });
      case 'disruption.severity_changed':
        return t('log.actions.severity_changed', {
          from: severityName(meta.from),
          to: severityName(meta.to),
        });
      case 'disruption.owner_changed':
        return t('log.actions.owner_changed');
      case 'disruption.updated':
        return t('log.actions.updated');
      case 'disruption.step_done':
        return t('log.actions.step_done', { text: String(meta.text ?? '') });
      case 'disruption.options_updated':
        return t('log.actions.options_updated');
      case 'disruption.options_sent':
        return t('log.actions.options_sent', {
          codes: Array.isArray(meta.bookingCodes) ? meta.bookingCodes.join(', ') : '',
          time: typeof meta.deadline === 'string' ? when(meta.deadline) : '',
        });
      case 'disruption.options_delivered':
        return t('log.actions.options_delivered', { code });
      case 'disruption.safety_marked': {
        const safety = String(meta.safety ?? 'UNKNOWN') as 'SAFE';
        const text = t('log.actions.safety_marked', {
          code,
          safety: t(`board.safety.${safety}`),
        });
        return typeof meta.note === 'string' && meta.note
          ? `${text} · ${meta.note}`
          : text;
      }
      case 'disruption.choice_recorded':
        return t('log.actions.choice_recorded', {
          key: String(meta.key ?? ''),
          code,
          source: t(`board.sources.${String(meta.source ?? 'DESK') as 'DESK'}`),
        });
      case 'disruption.advisory_drafted':
        return t('log.actions.advisory_drafted', {
          reference: String(meta.advisoryReference ?? ''),
        });
      case 'disruption.closed':
        return t('log.actions.closed');
      default:
        return entry.action;
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Link href="/disruptions" className="text-body-sm text-primary-600">
        {t('back')}
      </Link>
      <PageHeader title={item.title}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-body-sm text-muted">{item.reference}</span>
          <Badge variant={DISRUPTION_SEVERITY_BADGE[item.severity]}>
            {t(`severities.${item.severity}`)}
          </Badge>
          <Badge variant={open ? 'attention' : 'secondary'}>
            {open
              ? t('header.openFor', openedFor)
              : t('header.closedOn', { when: when(item.closedAt ?? item.openedAt) })}
          </Badge>
        </div>
      </PageHeader>

      <div className="flex flex-col gap-3">
        <p className="text-body-sm text-secondary">
          {t('header.opened', {
            when: when(item.openedAt),
            name: opener?.actorName ?? t('log.system'),
          })}
          {' · '}
          {item.ownerName ? t('owner', { name: item.ownerName }) : t('noOwner')}
          {' · '}
          {provinceName ? t('header.province', { name: provinceName }) : t('notRegional')}
        </p>
        <p className="max-w-prose text-body">{item.summary}</p>
        <ul className="flex flex-wrap gap-2" aria-label={t('affected')}>
          <li>
            <Tag>{t('counts.affected', { count: item.counts.affected })}</Tag>
          </li>
          <li>
            <Tag>{t('counts.onTheGround', { count: item.counts.onTheGround })}</Tag>
          </li>
          <li>
            <Tag>{t('counts.arriving', { count: item.counts.arriving })}</Tag>
          </li>
          <li>
            <Tag>
              {t('counts.banner', {
                state: banner
                  ? advisoriesT(`statuses.${banner.displayStatus}`)
                  : t('comms.none'),
              })}
            </Tag>
          </li>
        </ul>
        {canManage ? (
          <CaseHeaderActions
            caseId={item.id}
            actorId={session!.user.id}
            ownerId={item.ownerId}
          />
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>{t('severityCard.title')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-body-sm">
            <p className="text-muted">{t('severityCard.hint')}</p>
            {canManage ? (
              <SeverityControl caseId={item.id} severity={item.severity} />
            ) : (
              <p>{t(`severityRules.${item.severity}`)}</p>
            )}
            <div className="rounded-md bg-sunken p-3">
              <p className="font-semibold">
                {t('severityCard.path', { severity: t(`severities.${item.severity}`) })}
              </p>
              <p className="text-secondary">{t(`paths.${item.severity}`)}</p>
            </div>
            {item.trigger ? (
              <p className="text-muted">{t('form.trigger', { trigger: item.trigger })}</p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>{t('playbook.title', { scenario: scenarioLabel })}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-body-sm">
            <p className="text-muted">
              {t('playbook.progress', { done: doneSteps, total: item.steps.length })}
            </p>
            {item.steps.length === 0 ? (
              <p>{t('playbook.empty')}</p>
            ) : (
              <ol className="flex flex-col divide-y">
                {item.steps.map((step) => (
                  <li key={step.id} className="flex flex-wrap items-start gap-3 py-2">
                    <span
                      aria-hidden
                      className={
                        step.doneAt
                          ? 'mt-0.5 font-semibold text-success-700'
                          : 'mt-0.5 text-muted'
                      }
                    >
                      {step.doneAt ? '✓' : '○'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={
                          step.doneAt ? 'text-secondary line-through' : 'font-medium'
                        }
                      >
                        {step.text}
                      </p>
                      <p className="text-caption text-muted">
                        {step.owner} · {step.due}
                      </p>
                      {step.doneAt ? (
                        <p className="text-caption text-muted">
                          {t('playbook.doneBy', {
                            when: when(step.doneAt),
                            name: step.doneByName ?? '—',
                          })}
                        </p>
                      ) : null}
                    </div>
                    {canManage && !step.doneAt ? (
                      <StepDoneButton caseId={item.id} stepId={step.id} />
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>{t('options.title')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-body-sm">
          <p className="text-muted">{t('options.hint')}</p>
          {canManage && !item.optionsLocked ? (
            <OptionsEditor caseId={item.id} options={item.options} />
          ) : item.options.length === 0 ? (
            <p>{t('options.empty')}</p>
          ) : (
            <>
              {item.optionsLocked ? (
                <p className="text-muted">{t('options.locked')}</p>
              ) : null}
              <ul className="grid gap-3 md:grid-cols-2">
                {item.options.map((option) => {
                  const picked = item.bookings.filter(
                    (booking) => booking.effectiveChoice?.key === option.key,
                  );
                  return (
                    <li
                      key={option.key}
                      className="flex min-w-0 gap-3 rounded-md border p-3"
                    >
                      <span className="font-mono text-h3 font-semibold text-primary-600">
                        {option.key}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold">{option.title}</p>
                        <p className="text-secondary">{option.detail}</p>
                        <p className="mt-1 text-caption text-muted">
                          {picked.length > 0
                            ? picked.map((booking) => booking.bookingCode).join(' · ')
                            : t('options.picked', { count: 0 })}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          <div className="rounded-md bg-sunken p-3">
            <p className="font-semibold">
              {t('policy.title', { scenario: scenarioLabel })}
            </p>
            <p className="text-secondary">{item.policy}</p>
            <p className="mt-1 text-caption text-muted">{t('policy.note')}</p>
          </div>
          {canManage && item.options.length > 0 ? (
            <section
              aria-labelledby="send-title"
              className="flex flex-col gap-3 border-t pt-4"
            >
              <h3 id="send-title" className="font-semibold">
                {t('send.title')}
              </h3>
              <SendOptionsForm
                // Its selection is seeded once; remount it when the bookings change.
                key={item.bookings
                  .map(
                    (booking) =>
                      `${booking.reservationId}:${booking.chosenOptionKey ?? ''}`,
                  )
                  .join()}
                caseId={item.id}
                optionKeys={optionKeys}
                defaultKey={defaultKey}
                defaultDeadline={zonedWallClock(
                  new Date(now.getTime() + disruptions.deadlineHours * HOUR_MS),
                )}
                targets={item.bookings.map((booking) => ({
                  reservationId: booking.reservationId,
                  label: `${booking.bookingCode} · ${booking.travelerName ?? t('board.anonymized')}`,
                  answered: booking.chosenOptionKey !== null,
                }))}
              />
            </section>
          ) : null}
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>{t('board.title')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-body-sm">
          <p className="font-medium">
            {t('board.legend', {
              safe: item.counts.safe,
              help: item.counts.needsHelp,
              unknown: item.counts.unknown,
            })}
          </p>
          {item.bookings.length === 0 ? (
            <p className="text-muted">{t('board.empty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('board.traveler')}</TableHead>
                    <TableHead>{t('board.trip')}</TableHead>
                    <TableHead>{t('board.status')}</TableHead>
                    <TableHead>{t('board.lastContact')}</TableHead>
                    <TableHead>{t('board.answer')}</TableHead>
                    {canManage ? <TableHead>{t('board.act')}</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {item.bookings.map((booking) => {
                    const dates = bookingDates(
                      booking.startDate,
                      booking.endDate,
                      locale,
                    );
                    const tone =
                      booking.overdueUnknown || booking.safety === 'NEEDS_HELP'
                        ? 'destructive'
                        : booking.needsCall
                          ? 'attention'
                          : undefined;
                    return (
                      <TableRow key={booking.id} tone={tone}>
                        <TableCell className="min-w-[12rem]">
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {booking.travelerName ?? t('board.anonymized')}
                            </span>
                            <span className="text-caption text-muted">
                              {t('board.party', {
                                nationality: booking.nationality ?? '—',
                                count: booking.partySize,
                              })}
                            </span>
                            <span className="flex flex-wrap gap-3 text-caption">
                              {booking.travelerPhone ? (
                                <a
                                  href={`tel:${booking.travelerPhone.replace(/\s+/g, '')}`}
                                  className="text-primary-600 underline-offset-4 hover:underline"
                                >
                                  {t('board.call')}
                                </a>
                              ) : null}
                              {booking.travelerEmail ? (
                                <a
                                  href={`mailto:${booking.travelerEmail}`}
                                  className="text-primary-600 underline-offset-4 hover:underline"
                                >
                                  {t('board.email')}
                                </a>
                              ) : null}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="min-w-[11rem]">
                          <div className="flex flex-col">
                            <Link
                              href={`/bookings/${booking.reservationId}`}
                              className="font-mono text-primary-600 underline-offset-4 hover:underline"
                            >
                              {booking.bookingCode}
                            </Link>
                            <span className="text-caption text-muted">
                              {booking.underWay
                                ? t('board.underWay', { dates })
                                : booking.arriving
                                  ? t('board.arriving', {
                                      date: calendarDate(booking.startDate, locale),
                                    })
                                  : t('board.later', { dates })}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col items-start gap-1">
                            <Badge
                              variant={
                                booking.overdueUnknown
                                  ? 'timeout'
                                  : SAFETY_BADGE[booking.safety]
                              }
                            >
                              {t(`board.safety.${booking.safety}`)}
                            </Badge>
                            {booking.overdueUnknown ? (
                              <span className="text-caption font-medium text-error-700">
                                {t('board.overdue')}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="min-w-[12rem]">
                          {booking.lastContactAt ? (
                            <div className="flex flex-col">
                              <span>{when(booking.lastContactAt)}</span>
                              {booking.safetyNote ? (
                                <span className="text-secondary">
                                  {booking.safetyNote}
                                </span>
                              ) : null}
                              {booking.safetyConfirmedByName ? (
                                <span className="text-caption text-muted">
                                  {t('board.confirmedBy', {
                                    name: booking.safetyConfirmedByName,
                                  })}
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-muted">{t('board.noContact')}</span>
                          )}
                        </TableCell>
                        <TableCell className="min-w-[11rem]">
                          <span
                            className={
                              booking.needsCall
                                ? 'font-medium text-warning-700'
                                : undefined
                            }
                          >
                            {booking.offerState === 'AWAITING'
                              ? t('board.offer.AWAITING', {
                                  time: when(booking.offerDeadline!),
                                })
                              : booking.offerState === 'CHOSEN'
                                ? t('board.offer.CHOSEN', {
                                    key: booking.chosenOptionKey ?? '',
                                    source: t(
                                      `board.sources.${booking.choiceSource ?? 'DESK'}`,
                                    ),
                                  })
                                : booking.offerState === 'DEFAULTED'
                                  ? t('board.offer.DEFAULTED', {
                                      key: booking.defaultOptionKey ?? '',
                                    })
                                  : t('board.offer.NOT_SENT')}
                          </span>
                        </TableCell>
                        {canManage ? (
                          <TableCell className="min-w-[14rem]">
                            <div className="flex flex-col gap-3">
                              <SafetyForm
                                caseId={item.id}
                                reservationId={booking.reservationId}
                                bookingCode={booking.bookingCode}
                                safety={booking.safety}
                              />
                              {booking.offerState !== 'NOT_SENT' ? (
                                <DeskChoiceForm
                                  caseId={item.id}
                                  reservationId={booking.reservationId}
                                  bookingCode={booking.bookingCode}
                                  optionKeys={optionKeys}
                                  defaultKey={booking.defaultOptionKey}
                                  canConfirmDefault={booking.needsCall}
                                />
                              ) : null}
                            </div>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="text-caption text-muted">{t('board.rule')}</p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        {canManage ? (
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>{t('attach.title')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-body-sm">
              <p className="text-muted">
                {provinceName
                  ? item.suggestions.length > 0
                    ? t('attach.hint', { province: provinceName })
                    : t('attach.none')
                  : t('attach.noProvince')}
              </p>
              <AttachForm
                key={item.suggestions
                  .map((suggestion) => suggestion.reservationId)
                  .join()}
                caseId={item.id}
                suggestions={item.suggestions.map((suggestion) => ({
                  reservationId: suggestion.reservationId,
                  label: `${suggestion.bookingCode} · ${
                    suggestion.travelerName ?? t('board.anonymized')
                  } · ${bookingDates(suggestion.startDate, suggestion.endDate, locale)}`,
                }))}
              />
            </CardContent>
          </Card>
        ) : null}

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>{t('comms.title')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-body-sm">
            <p className="text-muted">{t('comms.hint')}</p>
            {item.advisories.length === 0 ? (
              <p>{t('comms.none')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {item.advisories.map((advisory) => (
                  <li key={advisory.id} className="flex flex-col">
                    <Link
                      href={`/content/advisories/${advisory.id}`}
                      className="font-medium text-primary-600 underline-offset-4 hover:underline"
                    >
                      {advisory.headline}
                    </Link>
                    <span className="flex flex-wrap items-center gap-2 text-caption text-muted">
                      <span className="font-mono">{advisory.reference}</span>
                      <Badge variant={SEVERITY_BADGE[advisory.severity]}>
                        {advisoriesT(`severities.${advisory.severity}`)}
                      </Badge>
                      <Badge variant={STATUS_BADGE[advisory.displayStatus]}>
                        {advisoriesT(`statuses.${advisory.displayStatus}`)}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {canManage && !pendingBanner ? <DraftBannerButton caseId={item.id} /> : null}
            <p>{t('comms.emailed', { count: emailed })}</p>
            <Alert variant="info">{t('comms.deferred')}</Alert>
          </CardContent>
        </Card>
      </div>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>{t('log.title')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-body-sm">
          <p className="text-muted">{t('log.hint')}</p>
          {item.log.length === 0 ? (
            <p>{t('log.empty')}</p>
          ) : (
            <ol className="flex flex-col divide-y">
              {item.log.map((entry) => (
                <li
                  key={entry.id}
                  className="grid gap-x-4 gap-y-0.5 py-2 sm:grid-cols-[9rem_8rem_1fr]"
                >
                  <span className="font-mono text-caption text-muted">
                    {when(entry.createdAt)}
                  </span>
                  <span className="font-medium">
                    {entry.actorName ?? t('log.system')}
                  </span>
                  <span className="min-w-0">{logText(entry)}</span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
