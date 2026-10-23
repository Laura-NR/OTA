import { SUPPORTED_LOCALES, loadMessages } from '@ota/i18n';
import { UserRole } from '@ota/domain';
import type {
  OperatingSettingsDto,
  SecurityStatusDto,
  SettingsVersionDto,
  StaffInviteDto,
  StaffUserDto,
  SystemAuditEntryDto,
} from '@ota/schemas';
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ota/ui';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { PageHeader } from '@/components/page-header';
import {
  InviteActions,
  InviteForm,
  StaffActions,
} from '@/components/settings/staff-actions';
import { ThresholdsProposal } from '@/components/settings/thresholds-proposal';
import { apiFetch, getServerSession } from '@/lib/api';
import { opsDate, opsTime } from '@/lib/ops-format';
import { CAPABILITIES, type Access } from '@/lib/permissions';
import { THRESHOLD_GROUPS, thresholdText } from '@/lib/threshold-fields';
import { getTenantConfig } from '@/lib/tenant';

const TABS = [
  'users',
  'permissions',
  'locales',
  'manifest',
  'thresholds',
  'security',
] as const;
type Tab = (typeof TABS)[number];
/** Super Admin only (M9): who works on the desk, what each role may do, and the audit. */
const SUPER_TABS: readonly Tab[] = ['users', 'permissions', 'security'];

const ACCESS_BADGE: Record<Access, 'success' | 'secondary' | 'outline'> = {
  yes: 'success',
  view: 'secondary',
  no: 'outline',
};

const INVITE_BADGE: Record<
  StaffInviteDto['state'],
  'success' | 'warning' | 'outline' | 'secondary'
> = {
  SENT: 'success',
  AWAITING_CONFIRMATION: 'warning',
  ACCEPTED: 'secondary',
  REVOKED: 'outline',
  EXPIRED: 'outline',
};

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[minmax(10rem,auto)_1fr]">
      {rows.map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="text-body-sm font-medium text-secondary">{term}</dt>
          <dd className="text-body-sm text-default">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Leaf strings of a catalog, as `a.b.c` paths. */
function leaves(tree: unknown, prefix = ''): string[] {
  if (typeof tree === 'string') return [prefix];
  if (!tree || typeof tree !== 'object') return [];
  return Object.entries(tree).flatMap(([key, value]) =>
    leaves(value, prefix ? `${prefix}.${key}` : key),
  );
}

/**
 * A-Settings (M9, `docs/schema-m9-settings.md`): users and invitations,
 * the permission matrix, currencies and languages, the manifest and its
 * flags, the operating thresholds with their second-Super-Admin changes,
 * and security with the audit log. Users, permissions and security are for
 * Super Admins; the rest is read by the whole desk.
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const [t, locale, session, params] = await Promise.all([
    getTranslations('backoffice.settings'),
    getLocale(),
    getServerSession(),
    searchParams,
  ]);
  const isSuper = session?.user.role === UserRole.SuperAdmin;
  const visible = TABS.filter((tab) => isSuper || !SUPER_TABS.includes(tab));
  const tab: Tab =
    visible.find((candidate) => candidate === params.tab) ??
    (isSuper ? 'users' : 'thresholds');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />
      <nav aria-label={t('tabsLabel')} className="-mb-2 overflow-x-auto border-b">
        <ul className="flex min-w-max gap-1">
          {visible.map((candidate) => {
            const on = candidate === tab;
            return (
              <li key={candidate}>
                <Link
                  href={`/settings?tab=${candidate}`}
                  aria-current={on ? 'page' : undefined}
                  className={cn(
                    'inline-flex h-11 items-center border-b-2 px-3 text-body-sm font-medium',
                    on
                      ? 'border-primary-600 text-primary-700'
                      : 'border-transparent text-secondary hover:text-default',
                  )}
                >
                  {t(`tabs.${candidate}`)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {tab === 'users' ? <UsersTab actorId={session!.user.id} locale={locale} /> : null}
      {tab === 'permissions' ? <PermissionsTab /> : null}
      {tab === 'locales' ? <LocalesTab /> : null}
      {tab === 'manifest' ? <ManifestTab /> : null}
      {tab === 'thresholds' ? (
        <ThresholdsTab
          isSuper={isSuper}
          actorId={session?.user.id ?? ''}
          locale={locale}
        />
      ) : null}
      {tab === 'security' ? <SecurityTab locale={locale} /> : null}
    </div>
  );
}

async function UsersTab({ actorId, locale }: { actorId: string; locale: string }) {
  const t = await getTranslations('backoffice.settings');
  const [users, invites] = await Promise.all([
    apiFetch<StaffUserDto[]>('/staff').catch(() => null),
    apiFetch<StaffInviteDto[]>('/staff/invites').catch(() => null),
  ]);
  const when = (value: string) => `${opsDate(value, locale)} ${opsTime(value, locale)}`;
  const { staff } = getTenantConfig();

  return (
    <div className="flex flex-col gap-6">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>{t('users.title', { count: users?.length ?? 0 })}</CardTitle>
          <CardDescription>{t('users.description')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {users === null ? (
            <Alert variant="destructive">{t('loadError')}</Alert>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[820px]">
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">{t('users.user')}</TableHead>
                    <TableHead scope="col">{t('users.role')}</TableHead>
                    <TableHead scope="col">{t('users.passkeys')}</TableHead>
                    <TableHead scope="col">{t('users.lastSignIn')}</TableHead>
                    <TableHead scope="col">{t('users.status')}</TableHead>
                    <TableHead scope="col">{t('users.act')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="align-top">
                        <div className="font-medium">{user.fullName ?? user.email}</div>
                        <div className="text-caption text-muted">{user.email}</div>
                      </TableCell>
                      <TableCell className="align-top">
                        {t(`users.roles.${user.role}`)}
                      </TableCell>
                      <TableCell className="align-top font-mono">
                        {user.passkeys}
                      </TableCell>
                      <TableCell className="align-top text-body-sm">
                        {user.lastSignInAt ? when(user.lastSignInAt) : t('users.never')}
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge variant={user.deactivatedAt ? 'outline' : 'success'}>
                          {user.deactivatedAt
                            ? t('users.deactivated')
                            : t('users.active')}
                        </Badge>
                      </TableCell>
                      <TableCell className="align-top">
                        <StaffActions user={user} isSelf={user.id === actorId} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="text-caption text-muted">{t('users.note')}</p>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>{t('invites.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <InviteForm allowedDomains={staff.allowedEmailDomains} />
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>{t('invites.listTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            {invites === null ? (
              <Alert variant="destructive">{t('loadError')}</Alert>
            ) : invites.length === 0 ? (
              <p className="text-body-sm text-muted">{t('invites.empty')}</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {invites.map((invite) => (
                  <li key={invite.id} className="flex flex-col gap-2 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{invite.email}</span>
                      <Badge variant={INVITE_BADGE[invite.state]}>
                        {t(`invites.states.${invite.state}`)}
                      </Badge>
                    </div>
                    <p className="text-caption text-secondary">
                      {t('invites.meta', {
                        role: t(`users.roles.${invite.role}`),
                        inviter: invite.invitedByName ?? '—',
                        expires: opsDate(invite.expiresAt, locale),
                      })}
                    </p>
                    <InviteActions invite={invite} actorId={actorId} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

async function PermissionsTab() {
  const t = await getTranslations('backoffice.settings.permissions');
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="overflow-x-auto">
          <Table className="min-w-[680px]">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{t('capability')}</TableHead>
                <TableHead scope="col">{t('roles.superAdmin')}</TableHead>
                <TableHead scope="col">{t('roles.operations')}</TableHead>
                <TableHead scope="col">{t('roles.support')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {CAPABILITIES.map((capability) => (
                <TableRow key={capability.key}>
                  <TableCell>
                    <div className="font-medium">{t(`rows.${capability.key}.label`)}</div>
                    <div className="text-caption text-muted">
                      {t(`rows.${capability.key}.note`)}
                    </div>
                  </TableCell>
                  {(['superAdmin', 'operations', 'support'] as const).map((role) => (
                    <TableCell key={role}>
                      <Badge variant={ACCESS_BADGE[capability[role]]}>
                        {t(`access.${capability[role]}`)}
                      </Badge>
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-caption text-muted">{t('note')}</p>
      </CardContent>
    </Card>
  );
}

async function LocalesTab() {
  const t = await getTranslations('backoffice.settings.languages');
  const tenant = getTenantConfig();
  const reference = leaves(loadMessages('en'));
  return (
    <div className="flex flex-col gap-6">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>{t('currenciesTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-body-sm">
          <p>{t('currencies')}</p>
          <p className="text-caption text-muted">{t('currenciesNote')}</p>
        </CardContent>
      </Card>
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="overflow-x-auto">
            <Table className="min-w-[520px]">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{t('locale')}</TableHead>
                  <TableHead scope="col">{t('coverage')}</TableHead>
                  <TableHead scope="col">{t('status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {SUPPORTED_LOCALES.map((code) => {
                  const keys = new Set(leaves(loadMessages(code)));
                  const covered = reference.filter((key) => keys.has(key)).length;
                  const share = Math.floor((covered / reference.length) * 100);
                  const live = tenant.supportedLocales.includes(code);
                  return (
                    <TableRow key={code}>
                      <TableCell className="font-mono uppercase">
                        {code}
                        {code === tenant.primaryLocale ? (
                          <span className="ml-2 font-sans normal-case text-caption text-muted">
                            {t('primary')}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="font-mono">{share} %</TableCell>
                      <TableCell>
                        <Badge variant={live ? 'success' : 'outline'}>
                          {live ? t('live') : t('off')}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <p className="text-caption text-muted">{t('note')}</p>
        </CardContent>
      </Card>
    </div>
  );
}

async function ManifestTab() {
  const t = await getTranslations('backoffice.settings');
  const tenant = getTenantConfig();
  const yes = t('yes');
  const no = t('no');
  const preview = {
    tenantId: tenant.tenantId,
    branding: {
      agencyName: tenant.branding.agencyName,
      licenseNumber: tenant.branding.licenseNumber,
    },
    primaryLocale: tenant.primaryLocale,
    supportedLocales: tenant.supportedLocales,
    theme: { palette: tenant.theme.palette, borderRadius: tenant.theme.borderRadius },
    features: tenant.features,
    destinations: tenant.destinations,
    staff: tenant.staff,
  };

  return (
    <div className="flex flex-col gap-6">
      <Alert>{t('manifest.readOnly')}</Alert>
      <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>{t('agency')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Facts
              rows={[
                [t('agencyName'), tenant.branding.agencyName],
                [t('license'), tenant.branding.licenseNumber],
                [
                  t('primaryColor'),
                  <span key="colour" className="inline-flex items-center gap-2 font-mono">
                    <span
                      aria-hidden="true"
                      className="h-4 w-4 rounded-sm border"
                      style={{ background: tenant.branding.primaryColor }}
                    />
                    {tenant.branding.primaryColor}
                  </span>,
                ],
                [t('palette'), `${tenant.theme.palette} · ${tenant.theme.borderRadius}`],
                [
                  t('locales'),
                  `${tenant.supportedLocales.join(', ')} (${t('primaryLocale', { locale: tenant.primaryLocale })})`,
                ],
                [t('supportEmail'), tenant.branding.supportEmail ?? '—'],
                [t('supportPhone'), tenant.branding.supportPhone ?? '—'],
                [t('whatsapp'), tenant.branding.whatsappNumber ?? '—'],
                [
                  t('manifest.staffDomains'),
                  tenant.staff.allowedEmailDomains.length > 0
                    ? tenant.staff.allowedEmailDomains
                        .map((domain) => `@${domain}`)
                        .join(', ')
                    : t('manifest.anyDomain'),
                ],
                [t('bankTransfer'), tenant.payments.bankTransfer ? yes : no],
                [
                  t('cardRail'),
                  tenant.features.creditCardGatewayRail ? t('cardMock') : no,
                ],
              ]}
            />
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>{t('features')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ul className="flex flex-wrap gap-2">
              {Object.entries(tenant.features).map(([flag, enabled]) => (
                <li key={flag}>
                  <Badge variant={enabled ? 'success' : 'outline'}>
                    {flag} · {enabled ? yes : no}
                  </Badge>
                </li>
              ))}
            </ul>
            <p className="text-caption text-muted">{t('manifest.flagsNote')}</p>
          </CardContent>
        </Card>
      </div>
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>{t('manifest.previewTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-md bg-neutral-50 p-4 font-mono text-caption">
            {JSON.stringify(preview, null, 2)}
          </pre>
        </CardContent>
      </Card>
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>{t('emergency')}</CardTitle>
        </CardHeader>
        <CardContent>
          {tenant.emergencyContacts.length === 0 ? (
            <p className="text-body-sm text-muted">—</p>
          ) : (
            <Facts
              rows={tenant.emergencyContacts.map((contact) => [
                contact.label,
                contact.phone,
              ])}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

async function ThresholdsTab({
  isSuper,
  actorId,
  locale,
}: {
  isSuper: boolean;
  actorId: string;
  locale: string;
}) {
  const [t, units, levels] = await Promise.all([
    getTranslations('backoffice.settings.thresholds'),
    getTranslations('backoffice.settings.thresholds.units'),
    getTranslations('advisoriesDesk.severities'),
  ]);
  const [settings, versions] = await Promise.all([
    apiFetch<OperatingSettingsDto>('/settings/operating').catch(() => null),
    isSuper
      ? apiFetch<SettingsVersionDto[]>('/settings/operating/versions').catch(() => [])
      : Promise.resolve([] as SettingsVersionDto[]),
  ]);
  if (!settings) {
    return <Alert variant="destructive">{t('loadError')}</Alert>;
  }
  const when = (value: string) => `${opsDate(value, locale)} ${opsTime(value, locale)}`;

  return (
    <div className="flex flex-col gap-6">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>
            {settings.version === 0
              ? t('defaultsInForce')
              : t('inForce', {
                  version: settings.version,
                  when: settings.appliedAt ? when(settings.appliedAt) : '—',
                  name: settings.appliedByName ?? '—',
                })}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="overflow-x-auto">
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{t('rule')}</TableHead>
                  <TableHead scope="col">{t('value')}</TableHead>
                  <TableHead scope="col">{t('default')}</TableHead>
                  <TableHead scope="col">{t('usedBy')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {THRESHOLD_GROUPS.flatMap((group) =>
                  group.fields.map((field) => {
                    const value = settings.values[field.key];
                    const fallback = settings.defaults[field.key];
                    return (
                      <TableRow key={field.key}>
                        <TableCell className="font-medium">
                          {t(`labels.${field.key}`)}
                        </TableCell>
                        <TableCell className="font-mono">
                          {thresholdText(field, value, locale, units, levels)}
                        </TableCell>
                        <TableCell
                          className={cn('font-mono', value === fallback && 'text-muted')}
                        >
                          {thresholdText(field, fallback, locale, units, levels)}
                        </TableCell>
                        <TableCell className="text-body-sm text-secondary">
                          {t(`used.${field.key}`)}
                        </TableCell>
                      </TableRow>
                    );
                  }),
                )}
              </TableBody>
            </Table>
          </div>
          <p className="text-caption text-muted">{t('notEnforced')}</p>
        </CardContent>
      </Card>

      {isSuper ? (
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>{t('changeTitle')}</CardTitle>
            <CardDescription>{t('changeDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ThresholdsProposal
              key={`${settings.version}-${settings.pending?.id ?? 'none'}`}
              current={settings.values}
              defaults={settings.defaults}
              pending={settings.pending}
              actorId={actorId}
            />
          </CardContent>
        </Card>
      ) : (
        <Alert>{t('superOnly')}</Alert>
      )}

      {isSuper && versions.length > 0 ? (
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>{t('historyTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col divide-y">
              {versions.map((version) => (
                <li
                  key={version.id}
                  className="grid gap-x-4 gap-y-0.5 py-2 text-body-sm sm:grid-cols-[4rem_9rem_minmax(0,1fr)]"
                >
                  <span className="font-mono">v{version.version}</span>
                  <Badge variant="secondary" className="self-start">
                    {t(`statuses.${version.status}`)}
                  </Badge>
                  <span className="min-w-0">
                    {t('historyLine', {
                      name: version.proposedByName ?? '—',
                      when: when(version.createdAt),
                      reason: version.reason,
                    })}
                    {version.decidedByName
                      ? ` · ${t('decidedBy', { name: version.decidedByName })}`
                      : ''}
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

async function SecurityTab({ locale }: { locale: string }) {
  const t = await getTranslations('backoffice.settings.security');
  const [security, audit] = await Promise.all([
    apiFetch<SecurityStatusDto>('/settings/security').catch(() => null),
    apiFetch<SystemAuditEntryDto[]>('/audit-log?limit=50').catch(() => null),
  ]);
  const when = (value: string) => `${opsDate(value, locale)} ${opsTime(value, locale)}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>{t('sessionsTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {security ? (
              <Facts
                rows={[
                  [t('staffSession'), t('hours', { count: security.staffSessionHours })],
                  [t('travelerSession'), t('travelerSessionValue')],
                  [t('signInLink'), t('minutes', { count: security.signInLinkMinutes })],
                  [t('deactivation'), t('deactivationValue')],
                ]}
              />
            ) : (
              <Alert variant="destructive">{t('loadError')}</Alert>
            )}
            <p className="text-caption text-muted">{t('deferred')}</p>
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>{t('integrationsTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {security ? (
              <ul className="flex flex-col gap-2">
                {security.integrations.map((integration) => (
                  <li key={integration.key} className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-body-sm">{integration.key}</span>
                    <Badge variant={integration.configured ? 'success' : 'outline'}>
                      {integration.configured ? t('configured') : t('notConfigured')}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="text-caption text-muted">{t('integrationsNote')}</p>
          </CardContent>
        </Card>
      </div>
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>{t('auditTitle')}</CardTitle>
          <CardDescription>{t('auditDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          {audit === null ? (
            <Alert variant="destructive">{t('loadError')}</Alert>
          ) : (
            <ol className="flex flex-col divide-y">
              {audit.map((entry) => (
                <li
                  key={entry.id}
                  className="grid gap-x-4 gap-y-0.5 py-2 text-body-sm sm:grid-cols-[10rem_10rem_minmax(0,1fr)]"
                >
                  <span className="font-mono text-caption text-muted">
                    {when(entry.createdAt)}
                  </span>
                  <span className="font-medium">{entry.actorName ?? t('system')}</span>
                  <span className="min-w-0 break-words">
                    <span className="font-mono">{entry.action}</span>
                    <span className="text-muted"> · {entry.entityType}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
