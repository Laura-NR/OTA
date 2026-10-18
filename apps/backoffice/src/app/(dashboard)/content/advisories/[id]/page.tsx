import { UserRole, pickAdvisoryTranslation } from '@ota/domain';
import type { AdvisoryDto } from '@ota/schemas';
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CrisisBanner,
} from '@ota/ui';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AdvisoryActions } from '@/components/advisory-actions';
import { AdvisoryEditor } from '@/components/advisory-editor';
import { PageHeader } from '@/components/page-header';
import { BANNER_SEVERITY, SEVERITY_BADGE, STATUS_BADGE } from '@/lib/advisories';
import {
  advisoryProvinces,
  advisoryRegionGroups,
  regionNames,
} from '@/lib/advisory-regions';
import { apiFetch, getServerSession } from '@/lib/api';
import { ApiError } from '@/lib/errors';
import { opsDate, opsTime } from '@/lib/ops-format';
import { getTenantConfig } from '@/lib/tenant';

const MANAGE_ROLES: readonly string[] = [UserRole.OperationsAdmin, UserRole.SuperAdmin];

/**
 * One advisory (A-Content): the editor while it is a draft or awaiting
 * approval, the approval panel, and once published the banner as travelers
 * see it with its delivery counts, a new version and lifting.
 */
export default async function AdvisoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [t, traveler, disruptionsT, locale, session] = await Promise.all([
    getTranslations('advisoriesDesk'),
    getTranslations('advisories'),
    getTranslations('disruptionsDesk'),
    getLocale(),
    getServerSession(),
  ]);
  const advisory = await apiFetch<AdvisoryDto>(`/advisories/${id}`).catch((error) => {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
      return null;
    }
    throw error;
  });
  if (!advisory) {
    notFound();
  }
  const tenant = getTenantConfig();
  const canManage = session?.user.role ? MANAGE_ROLES.includes(session.user.role) : false;
  const open = advisory.status === 'DRAFT' || advisory.status === 'IN_REVIEW';
  const when = (value: string) => `${opsDate(value, locale)} ${opsTime(value, locale)}`;
  const text = pickAdvisoryTranslation(
    advisory.translations,
    advisory.sourceLocale,
    advisory.sourceLocale,
  );

  const approval = (
    <Card>
      <CardHeader>
        <CardTitle>{t('approval.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-body-sm">
        <p className="text-muted">{t(`approval.rule.${advisory.severity}`)}</p>
        {advisory.approvals.length === 0 ? (
          <p>{t('approval.none')}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {advisory.approvals.map((given) => (
              <li key={`${given.approverId}-${given.createdAt}`}>
                {t('approval.given', {
                  name: given.approverName ?? '—',
                  role: t(
                    `roles.${given.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'OPERATIONS_ADMIN'}`,
                  ),
                  time: when(given.createdAt),
                })}
              </li>
            ))}
          </ul>
        )}
        {open
          ? advisory.missingApprovals.map((need) => (
              <p key={need} className="font-medium">
                {t(`approval.needs.${need}`)}
              </p>
            ))
          : null}
        {open && advisory.missingTranslations.length > 0 ? (
          <Alert variant="warning">
            {t('approval.missingTranslations', {
              locales: advisory.missingTranslations
                .map((value) => value.toUpperCase())
                .join(', '),
            })}
          </Alert>
        ) : null}
        {canManage ? (
          <AdvisoryActions advisory={advisory} actorId={session!.user.id} />
        ) : (
          <p className="text-caption text-muted">{t('approval.readOnly')}</p>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="flex flex-col gap-6">
      <Link href="/content/advisories" className="text-body-sm text-primary-600">
        {t('back')}
      </Link>
      <PageHeader title={text?.headline ?? advisory.reference}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-body-sm text-muted">{advisory.reference}</span>
          <Badge variant={SEVERITY_BADGE[advisory.severity]}>
            {t(`severities.${advisory.severity}`)}
          </Badge>
          <Badge variant={STATUS_BADGE[advisory.displayStatus]}>
            {t(`statuses.${advisory.displayStatus}`)}
          </Badge>
        </div>
      </PageHeader>
      {advisory.disruptionCase ? (
        <p className="text-body-sm">
          <Link
            href={`/disruptions/${advisory.disruptionCase.id}`}
            className="text-primary-600 underline-offset-4 hover:underline"
          >
            {disruptionsT('fromCase', { reference: advisory.disruptionCase.reference })}
          </Link>
        </p>
      ) : null}
      {advisory.supersedesReference ? (
        <p className="text-body-sm text-muted">
          {t('live.supersedes', { reference: advisory.supersedesReference })}
        </p>
      ) : null}

      {open && canManage ? (
        <div className="flex flex-col gap-6 xl:grid xl:grid-cols-[1fr_20rem] xl:items-start">
          <aside className="min-w-0 xl:sticky xl:top-6 xl:order-2">{approval}</aside>
          <div className="min-w-0">
            <AdvisoryEditor
              advisory={advisory}
              locales={tenant.supportedLocales}
              defaultSourceLocale={advisory.sourceLocale}
              provinces={advisoryProvinces()}
              groups={advisoryRegionGroups()}
              serverNow={new Date().toISOString()}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[1fr_20rem] lg:items-start">
          <div className="flex min-w-0 flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('editor.preview')}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="overflow-hidden rounded-md border">
                  <CrisisBanner
                    severity={BANNER_SEVERITY[advisory.severity]}
                    label={t('editor.preview')}
                    title={text?.headline ?? advisory.reference}
                    className="static"
                    action={
                      text?.cta ? (
                        <span className="whitespace-nowrap font-semibold underline underline-offset-[3px]">
                          {text.cta}
                        </span>
                      ) : null
                    }
                    acknowledgeLabel={traveler('acknowledge')}
                  >
                    {text?.body}
                  </CrisisBanner>
                </div>
                <dl className="grid gap-x-6 gap-y-2 text-body-sm sm:grid-cols-[auto_1fr]">
                  <dt className="text-muted">{t('editor.regions')}</dt>
                  <dd>{regionNames(advisory.regions) ?? t('wholeCountry')}</dd>
                  <dt className="text-muted">{t('editor.effectiveFrom')}</dt>
                  <dd>{when(advisory.effectiveFrom)}</dd>
                  <dt className="text-muted">{t('editor.expiresAt')}</dt>
                  <dd>{when(advisory.expiresAt)}</dd>
                  <dt className="text-muted">{t('editor.source')}</dt>
                  <dd>{advisory.source}</dd>
                  <dt className="text-muted">{t('editor.texts')}</dt>
                  <dd>
                    {advisory.translations
                      .map((item) => item.locale.toUpperCase())
                      .join(' · ')}
                  </dd>
                </dl>
              </CardContent>
            </Card>
          </div>
          <aside className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-6">
            {open ? approval : null}
            {!open ? (
              <Card>
                <CardHeader>
                  <CardTitle>{t('live.title')}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 text-body-sm">
                  {advisory.publishedAt ? (
                    <p>
                      {t('live.published', {
                        date: when(advisory.publishedAt),
                        approvals: advisory.approvals.length,
                        delivered: advisory.deliveredCount,
                        acknowledged: advisory.acknowledgementCount,
                      })}
                    </p>
                  ) : null}
                  {advisory.liftedAt ? (
                    <p>{t('live.lifted', { date: when(advisory.liftedAt) })}</p>
                  ) : null}
                  {advisory.supersededById ? (
                    <p className="text-muted">
                      <Link
                        href={`/content/advisories/${advisory.supersededById}`}
                        className="text-primary-600 underline-offset-4 hover:underline"
                      >
                        {t('live.supersededBy')}
                      </Link>
                    </p>
                  ) : null}
                  {canManage ? (
                    <AdvisoryActions advisory={advisory} actorId={session!.user.id} />
                  ) : null}
                </CardContent>
              </Card>
            ) : null}
          </aside>
        </div>
      )}
    </div>
  );
}
