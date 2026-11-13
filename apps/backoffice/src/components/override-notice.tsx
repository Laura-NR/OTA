import type { PermissionCapability } from '@ota/domain';
import type { MyOverridesDto } from '@ota/schemas';
import { Alert } from '@ota/ui';
import { getLocale, getTranslations } from 'next-intl/server';

import { OverrideEnd, OverrideRequest } from '@/components/override-request';
import { opsDate, opsTime } from '@/lib/ops-format';
import { latestOverride } from '@/lib/overrides';

/**
 * A-States' "Read-only view · Request an override"
 * (`docs/schema-m9-permission-overrides.md`): on a page whose row the person's
 * role can only view, say so and offer the request; while one waits or runs,
 * say that instead. Nothing for a role that holds the row.
 */
export async function OverrideNotice({
  capability,
  overrides,
}: {
  capability: PermissionCapability;
  overrides: MyOverridesDto | null;
}) {
  if (!overrides?.overridable.includes(capability)) return null;
  const [t, rows, locale] = await Promise.all([
    getTranslations('backoffice.overrides'),
    getTranslations('backoffice.settings.permissions.rows'),
    getLocale(),
  ]);
  const row = rows(`${capability}.label`);
  const at = (iso: string) => `${opsDate(iso, locale)} ${opsTime(iso, locale)}`;
  const latest = latestOverride(overrides, capability);

  if (latest?.status === 'ACTIVE') {
    return (
      <Alert variant="success" data-override={capability}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p>{t('active', { row, time: at(latest.expiresAt!) })}</p>
          <OverrideEnd id={latest.id} label={t('giveBack')} />
        </div>
      </Alert>
    );
  }
  if (latest?.status === 'REQUESTED') {
    return (
      <Alert variant="info" data-override={capability}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p>{t('pending', { row, time: at(latest.requestedAt) })}</p>
          <OverrideEnd id={latest.id} label={t('withdraw')} />
        </div>
      </Alert>
    );
  }
  const closed =
    latest?.status === 'DECLINED'
      ? latest.decisionNote
        ? t('declinedNote', {
            name: latest.decidedByName ?? '—',
            note: latest.decisionNote,
          })
        : t('declined', { name: latest.decidedByName ?? '—' })
      : latest?.status === 'ENDED' || latest?.status === 'EXPIRED'
        ? t('ended', { row })
        : latest?.status === 'LAPSED'
          ? t('lapsed')
          : null;
  return (
    <Alert data-override={capability}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p>{t('notice', { row })}</p>
          {closed ? <p className="text-caption">{closed}</p> : null}
        </div>
        <OverrideRequest
          capability={capability}
          row={row}
          hours={overrides.expiryHours}
        />
      </div>
    </Alert>
  );
}
