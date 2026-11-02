'use client';

import {
  IP_ALLOWLIST_LABEL_MAX,
  IP_ALLOWLIST_MAX_ENTRIES,
  ipInRanges,
  ipRangeIssue,
  type IpAllowlistEntry,
} from '@ota/domain';
import { Alert, Button, Field, Input } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useId } from 'react';

/**
 * The entry that admits the person's own sign-in address: the address
 * itself, or for IPv6 its /64, which is all Better Auth keeps of it.
 */
function ownRange(address: string): string {
  return address.includes(':') ? `${address}/64` : address;
}

export interface IpAllowlistEditorProps {
  entries: IpAllowlistEntry[];
  onChange: (entries: IpAllowlistEntry[]) => void;
  /** Whether the proposal switches the allowlist on. */
  on: boolean;
  /** The address the signed-in Super Admin's session came from; null when unknown. */
  signInAddress: string | null;
}

/**
 * The Super Admin IP allowlist in the thresholds proposal
 * (`docs/schema-m9-ip-allowlist.md` I4, I8): a labelled address or range per
 * row, the person's own sign-in address with "Add it to the list", and a
 * warning when the list, switched on, would refuse that address. The API
 * refuses an apply that would refuse the applying Super Admin.
 */
export function IpAllowlistEditor({
  entries,
  onChange,
  on,
  signInAddress,
}: IpAllowlistEditorProps) {
  const t = useTranslations('backoffice.settings.thresholds');
  const id = useId();
  const cidrs = entries.map((entry) => entry.cidr);
  const yoursListed = signInAddress !== null && ipInRanges(signInAddress, cidrs);
  const full = entries.length >= IP_ALLOWLIST_MAX_ENTRIES;

  const update = (index: number, patch: Partial<IpAllowlistEntry>) =>
    onChange(entries.map((entry, at) => (at === index ? { ...entry, ...patch } : entry)));

  const cidrError = (cidr: string) => {
    if (cidr.trim() === '') return undefined;
    const issue = ipRangeIssue(cidr);
    if (issue === 'INVALID') return t('ipAllowlist.invalid');
    if (issue === 'IPV6_TOO_NARROW') return t('ipAllowlist.ipv6TooNarrow');
    return undefined;
  };

  return (
    <fieldset className="flex flex-col gap-3 sm:col-span-2 xl:col-span-4">
      <legend className="pb-1 text-body-sm font-medium">
        {t('labels.superAdminIpAllowlist')}
      </legend>
      {entries.length === 0 ? (
        <p className="text-body-sm text-secondary">{t('ipAllowlist.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {entries.map((entry, index) => (
            <li
              key={index}
              className="grid items-start gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
            >
              <Field id={`${id}-label-${index}`} label={t('ipAllowlist.label')}>
                {(control) => (
                  <Input
                    {...control}
                    maxLength={IP_ALLOWLIST_LABEL_MAX}
                    value={entry.label}
                    onChange={(event) => update(index, { label: event.target.value })}
                  />
                )}
              </Field>
              <Field
                id={`${id}-cidr-${index}`}
                label={t('ipAllowlist.cidr')}
                error={cidrError(entry.cidr)}
              >
                {(control) => (
                  <Input
                    {...control}
                    className="font-mono"
                    spellCheck={false}
                    autoCapitalize="none"
                    maxLength={64}
                    value={entry.cidr}
                    onChange={(event) => update(index, { cidr: event.target.value })}
                  />
                )}
              </Field>
              <Button
                type="button"
                variant="tertiary"
                className="sm:mt-6"
                aria-label={t('ipAllowlist.remove', {
                  label: entry.label || entry.cidr || String(index + 1),
                })}
                onClick={() => onChange(entries.filter((_, at) => at !== index))}
              >
                {t('ipAllowlist.removeShort')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-caption text-muted">
        {t('ipAllowlist.hint', { max: IP_ALLOWLIST_MAX_ENTRIES })}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => onChange([...entries, { label: '', cidr: '' }])}
          unavailableReason={
            full ? t('ipAllowlist.full', { max: IP_ALLOWLIST_MAX_ENTRIES }) : undefined
          }
        >
          {t('ipAllowlist.add')}
        </Button>
        {signInAddress !== null ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              onChange([
                ...entries,
                { label: t('ipAllowlist.yourLabel'), cidr: ownRange(signInAddress) },
              ])
            }
            unavailableReason={
              yoursListed
                ? t('ipAllowlist.yoursListed')
                : full
                  ? t('ipAllowlist.full', { max: IP_ALLOWLIST_MAX_ENTRIES })
                  : undefined
            }
          >
            {t('ipAllowlist.addYours')}
          </Button>
        ) : null}
      </div>
      <p className="text-body-sm">
        {signInAddress !== null ? (
          <>
            {t('ipAllowlist.yours')} <span className="font-mono">{signInAddress}</span>
          </>
        ) : (
          t('ipAllowlist.yoursUnknown')
        )}
      </p>
      {on && !yoursListed ? (
        <Alert variant="warning">
          {signInAddress !== null
            ? t('ipAllowlist.excludesYou', { address: signInAddress })
            : t('ipAllowlist.excludesUnknown')}
        </Alert>
      ) : null}
    </fieldset>
  );
}
