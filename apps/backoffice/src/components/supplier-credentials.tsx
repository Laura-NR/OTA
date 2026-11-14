'use client';

import { DESK_RESOURCE_CHANNELS, type CredentialKind } from '@ota/domain';
import type {
  CredentialSlotDto,
  CredentialVersionDto,
  SupplierCredentialsDto,
} from '@ota/schemas';
import {
  Alert,
  Badge,
  Button,
  Field,
  Input,
  Select,
  Textarea,
  type BadgeProps,
} from '@ota/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { apiRequest } from '@/lib/client-api';
import { readBase64 } from '@/lib/files';
import { calendarDate } from '@/lib/ops-format';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

type Channel = (typeof DESK_RESOURCE_CHANNELS)[number];

const STATE_VARIANT: Record<CredentialSlotDto['state'], BadgeProps['variant']> = {
  VALID: 'success',
  EXPIRING: 'warning',
  EXPIRED: 'destructive',
  MISSING: 'outline',
};

export interface SupplierCredentialsProps {
  supplierId: string;
  credentials: SupplierCredentialsDto;
  /** Upload a document received by visit, phone or WhatsApp (support included). */
  canUpload: boolean;
  /** Approve, reject, and record the identity card (Operations and Super Admin). */
  canReview: boolean;
}

/**
 * The credential inspector (A-Suppliers, `docs/schema-w-credentials.md`):
 * each document the supplier's category needs, its current version, the
 * upload waiting for review with approve and reject, and the latest
 * rejection. A file is shown only on request, since every read is audited.
 */
export function SupplierCredentials({
  supplierId,
  credentials,
  canUpload,
  canReview,
}: SupplierCredentialsProps) {
  const t = useTranslations('backoffice.credentials');

  return (
    <div className="space-y-4">
      {credentials.missing.length > 0 ? (
        <Alert variant="warning" title={t('missingTitle')}>
          {t('missing', {
            documents: credentials.missing.map((kind) => t(`kinds.${kind}`)).join(', '),
          })}
        </Alert>
      ) : null}
      <ul className="divide-y">
        {credentials.slots.map((slot) => (
          <li key={slot.kind} className="space-y-3 py-4 first:pt-0 last:pb-0">
            <CredentialSlot
              supplierId={supplierId}
              slot={slot}
              canUpload={canUpload}
              canReview={canReview}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function CredentialSlot({
  supplierId,
  slot,
  canUpload,
  canReview,
}: {
  supplierId: string;
  slot: CredentialSlotDto;
  canUpload: boolean;
  canReview: boolean;
}) {
  const t = useTranslations('backoffice.credentials');
  const locale = useLocale();
  const { current, pending, rejected } = slot;
  const identity = slot.kind === 'IDENTITY_CARD';
  const name = t(`kinds.${slot.kind}`);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-body font-semibold">{name}</h3>
        <Badge variant={STATE_VARIANT[slot.state]}>{t(`state.${slot.state}`)}</Badge>
        {pending ? <Badge variant="attention">{t('pendingBadge')}</Badge> : null}
      </div>

      {current ? (
        identity ? (
          <p className="text-body-sm text-secondary">
            {current.reviewedAt
              ? t('identityChecked', {
                  date: calendarDate(current.reviewedAt, locale),
                  name: current.reviewedByName ?? '—',
                })
              : t('identityNoFile')}
          </p>
        ) : (
          <VersionFacts version={current} pauseFrom={slot.pauseFrom} />
        )
      ) : (
        <p className="text-body-sm text-secondary">
          {identity ? t('identityNone') : t('none')}
        </p>
      )}

      {current?.hasFile ? (
        <FileViewer supplierId={supplierId} version={current} name={name} />
      ) : null}

      {pending ? (
        <div className="space-y-3 rounded-md border border-warning-500 bg-accent-50 p-3">
          <p className="text-body-sm font-medium">
            {t('pending', {
              date: calendarDate(pending.uploadedAt, locale),
              channel: t(`channels.${pending.uploadedVia}`),
            })}
          </p>
          {pending.hasFile ? (
            <FileViewer supplierId={supplierId} version={pending} name={name} />
          ) : null}
          {canReview ? (
            <ReviewForms supplierId={supplierId} version={pending} name={name} />
          ) : null}
        </div>
      ) : null}

      {rejected ? (
        <Alert variant="destructive">
          {t('rejected', {
            date: calendarDate(rejected.reviewedAt ?? rejected.uploadedAt, locale),
            reason: rejected.rejectReason ?? '—',
          })}
        </Alert>
      ) : null}

      {identity ? (
        canReview ? (
          <IdentityCheck supplierId={supplierId} />
        ) : null
      ) : canUpload ? (
        <UploadForm supplierId={supplierId} kind={slot.kind} name={name} />
      ) : null}
    </>
  );
}

function VersionFacts({
  version,
  pauseFrom,
}: {
  version: CredentialVersionDto;
  pauseFrom: string | null;
}) {
  const t = useTranslations('backoffice.credentials');
  const locale = useLocale();
  const facts: [string, string][] = [
    [t('number'), version.number ?? '—'],
    [t('issuer'), version.issuer ?? '—'],
    [t('issued'), version.issuedOn ? calendarDate(version.issuedOn, locale) : '—'],
    [t('expires'), version.expiresOn ? calendarDate(version.expiresOn, locale) : '—'],
    [t('pauseFrom'), pauseFrom ? calendarDate(pauseFrom, locale) : '—'],
    [
      t('uploaded'),
      t('uploadedValue', {
        date: calendarDate(version.uploadedAt, locale),
        channel: t(`channels.${version.uploadedVia}`),
      }),
    ],
    [
      t('checked'),
      version.reviewedAt
        ? t('checkedValue', {
            date: calendarDate(version.reviewedAt, locale),
            name: version.reviewedByName ?? '—',
          })
        : '—',
    ],
  ];
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-body-sm sm:grid-cols-2 lg:grid-cols-4">
      {facts.map(([label, value]) => (
        <div key={label}>
          <dt className="text-caption uppercase text-muted">{label}</dt>
          <dd className="font-mono">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Shows a version's file on request: each load is an audited read. */
function FileViewer({
  supplierId,
  version,
  name,
}: {
  supplierId: string;
  version: CredentialVersionDto;
  name: string;
}) {
  const t = useTranslations('backoffice.credentials');
  const [open, setOpen] = useState(false);
  const url = `/api/ota/suppliers/${supplierId}/credentials/${version.id}/file`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          variant="secondary"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? t('hideFile') : t('showFile')}
        </Button>
        <a
          className="text-body-sm font-medium text-primary-600 underline-offset-4 hover:underline"
          href={url}
          target="_blank"
          rel="noreferrer"
        >
          {t('openFull')}
        </a>
      </div>
      {open ? (
        version.contentType?.startsWith('image/') ? (
          <img
            src={url}
            alt={t('fileAlt', { name })}
            className="max-h-96 rounded-md border"
          />
        ) : (
          <iframe
            src={url}
            title={t('fileAlt', { name })}
            className="h-96 w-full rounded-md border"
          />
        )
      ) : null}
    </div>
  );
}

function ReviewForms({
  supplierId,
  version,
  name,
}: {
  supplierId: string;
  version: CredentialVersionDto;
  name: string;
}) {
  const t = useTranslations('backoffice.credentials');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const base = `/suppliers/${supplierId}/credentials/${version.id}`;
  const id = `credential-${version.id}`;

  async function post(path: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(path, { method: 'POST', body: JSON.stringify(body) });
      router.refresh();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }

  function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? '').trim() || null;
    void post(`${base}/approve`, {
      number: value('number'),
      issuer: value('issuer'),
      issuedOn: value('issuedOn'),
      expiresOn: value('expiresOn'),
    });
  }

  return (
    <div className="space-y-3">
      <form
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        onSubmit={approve}
        aria-label={t('approveForm', { name })}
      >
        <Field id={`${id}-number`} label={t('number')}>
          {(control) => <Input {...control} name="number" maxLength={60} />}
        </Field>
        <Field id={`${id}-issuer`} label={t('issuer')}>
          {(control) => <Input {...control} name="issuer" maxLength={120} />}
        </Field>
        <Field id={`${id}-issued`} label={t('issued')}>
          {(control) => <Input {...control} name="issuedOn" type="date" />}
        </Field>
        <Field id={`${id}-expires`} label={t('expires')} hint={t('expiresHint')} required>
          {(control) => <Input {...control} name="expiresOn" type="date" required />}
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={busy}>
            {t('approve')}
          </Button>
        </div>
      </form>
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          void post(`${base}/reject`, { reason });
        }}
        aria-label={t('rejectForm', { name })}
      >
        <Field id={`${id}-reason`} label={t('reason')} hint={t('reasonHint')} required>
          {(control) => (
            <Textarea
              {...control}
              value={reason}
              required
              maxLength={500}
              rows={2}
              onChange={(event) => setReason(event.target.value)}
            />
          )}
        </Field>
        <Button type="submit" variant="destructive" disabled={busy || !reason.trim()}>
          {t('reject')}
        </Button>
      </form>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
    </div>
  );
}

function ChannelSelect({
  id,
  value,
  disabled,
  onChange,
}: {
  id: string;
  value: Channel;
  disabled: boolean;
  onChange: (channel: Channel) => void;
}) {
  const t = useTranslations('backoffice.credentials');
  return (
    <Field id={id} label={t('via')}>
      {(control) => (
        <Select
          {...control}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value as Channel)}
        >
          {DESK_RESOURCE_CHANNELS.map((channel) => (
            <option key={channel} value={channel}>
              {t(`channels.${channel}`)}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

function UploadForm({
  supplierId,
  kind,
  name,
}: {
  supplierId: string;
  kind: CredentialKind;
  name: string;
}) {
  const t = useTranslations('backoffice.credentials');
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [via, setVia] = useState<Channel>('WHATSAPP');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = `credential-${kind}`;

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError(t('choose'));
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError(t('useFileType'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/suppliers/${supplierId}/credential`, {
        method: 'POST',
        body: JSON.stringify({
          kind,
          filename: file.name,
          contentType: file.type,
          contentBase64: await readBase64(file),
          via,
        }),
      });
      if (fileRef.current) fileRef.current.value = '';
      router.refresh();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={upload}>
      <Field id={`${id}-file`} label={t('uploadLabel', { name })} className="min-w-0">
        {(control) => (
          <Input
            {...control}
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
          />
        )}
      </Field>
      <ChannelSelect id={`${id}-via`} value={via} disabled={busy} onChange={setVia} />
      <Button type="submit" variant="secondary" disabled={busy}>
        {busy ? t('uploading') : t('upload')}
      </Button>
      {error ? (
        <Alert variant="destructive" className="basis-full">
          {error}
        </Alert>
      ) : null}
    </form>
  );
}

function IdentityCheck({ supplierId }: { supplierId: string }) {
  const t = useTranslations('backoffice.credentials');
  const router = useRouter();
  const [via, setVia] = useState<Channel>('VISIT');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function record() {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/suppliers/${supplierId}/credentials/identity-card`, {
        method: 'POST',
        body: JSON.stringify({ via }),
      });
      router.refresh();
    } catch (recordError) {
      setError(recordError instanceof Error ? recordError.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-caption text-muted">{t('identityHint')}</p>
      <div className="flex flex-wrap items-end gap-3">
        <ChannelSelect
          id="credential-identity-via"
          value={via}
          disabled={busy}
          onChange={setVia}
        />
        <Button variant="secondary" disabled={busy} onClick={() => void record()}>
          {t('recordIdentity')}
        </Button>
      </div>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
    </div>
  );
}
