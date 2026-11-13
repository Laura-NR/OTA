'use client';

import { OFAC_CATEGORIES } from '@ota/domain';
import type {
  AffidavitRecordDto,
  ReservationOfacDto,
  TravelerOfacDto,
} from '@ota/schemas';
import { Alert, Badge, Button, Input, Label, Select } from '@ota/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { apiRequest } from '@/lib/client-api';
import { readBase64 } from '@/lib/files';
import { calendarDate, opsDate, opsTime } from '@/lib/ops-format';

const SCAN_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_SCAN_BYTES = 10 * 1024 * 1024;

/**
 * The booking's OFAC position (M3; A-Booking "OFAC", A-Customers): each US
 * traveler with their current certification or "Not certified", the hold it
 * puts on payment and vouchers, the paper-affidavit form and the audited
 * record. Lists never carry the signature or the IP; "View record" fetches
 * them for one affidavit and the API logs the read.
 */
export function OfacPanel({
  reservationId,
  ofac,
  canManage,
}: {
  reservationId: string;
  ofac: ReservationOfacDto;
  canManage: boolean;
}) {
  const t = useTranslations('backoffice.reservation.ofac');
  const categories = useTranslations('ofac.categories');
  const locale = useLocale();
  const required = ofac.travelers.filter((traveler) => traveler.required);
  const [records, setRecords] = useState<Record<string, AffidavitRecordDto>>({});
  const [opening, setOpening] = useState<string | null>(null);
  const [paperFor, setPaperFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (required.length === 0) {
    return <p className="text-body-sm text-muted">{t('none')}</p>;
  }

  async function view(affidavitId: string) {
    setOpening(affidavitId);
    setError(null);
    try {
      const record = await apiRequest<AffidavitRecordDto>(`/affidavits/${affidavitId}`);
      setRecords((current) => ({ ...current, [affidavitId]: record }));
    } catch (viewError) {
      setError(viewError instanceof Error ? viewError.message : t('recordFailed'));
    } finally {
      setOpening(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {ofac.missing > 0 ? (
        <Alert variant="warning">{t('missingAlert', { count: ofac.missing })}</Alert>
      ) : null}
      <ul className="flex flex-col divide-y rounded-md border text-body-sm">
        {required.map((traveler) => {
          const affidavit = traveler.affidavit;
          const record = affidavit ? records[affidavit.id] : undefined;
          return (
            <li key={traveler.travelerId} className="flex flex-col gap-1.5 px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{traveler.fullName}</span>
                {affidavit ? (
                  <Badge variant="success">
                    {t('certified', { category: categories(affidavit.category) })}
                  </Badge>
                ) : (
                  <Badge variant="warning">{t('missing')}</Badge>
                )}
              </div>
              {affidavit ? (
                <span className="text-caption text-muted">
                  {t('signedMeta', {
                    source: t(`sources.${affidavit.source}`),
                    date: `${opsDate(affidavit.signedAt, locale)} ${opsTime(affidavit.signedAt, locale)}`,
                  })}
                </span>
              ) : (
                <span className="text-caption text-muted">{t('signOnline')}</span>
              )}
              {record ? (
                <AffidavitRecord record={record} />
              ) : affidavit && canManage ? (
                <Button
                  type="button"
                  size="sm"
                  variant="tertiary"
                  className="self-start"
                  disabled={opening !== null}
                  onClick={() => view(affidavit.id)}
                >
                  {opening === affidavit.id ? t('viewing') : t('viewRecord')}
                </Button>
              ) : null}
              {canManage && paperFor === traveler.travelerId ? (
                <PaperAffidavitForm
                  reservationId={reservationId}
                  traveler={traveler}
                  onDone={() => setPaperFor(null)}
                />
              ) : canManage ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="self-start"
                  onClick={() => setPaperFor(traveler.travelerId)}
                >
                  {t('paper.open')}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      {ofac.statement ? (
        <p className="text-caption text-muted">
          {t('record.statement')} · {ofac.statement.version}
        </p>
      ) : null}
    </div>
  );
}

function AffidavitRecord({ record }: { record: AffidavitRecordDto }) {
  const t = useTranslations('backoffice.reservation.ofac');
  const locale = useLocale();
  const rows: Array<[string, string | null]> = [
    [t('record.signature'), record.signature],
    [t('record.ip'), record.ipAddress],
    [t('record.userAgent'), record.userAgent],
    [
      t('record.statement'),
      `${record.statementVersion} · ${record.statementHash.slice(0, 12)}…`,
    ],
    [t('record.recordedBy'), record.recordedByEmail],
    [t('record.retainUntil'), calendarDate(record.retainUntil, locale)],
  ];
  return (
    <div className="flex flex-col gap-1.5 rounded-md bg-sunken px-3 py-2">
      <dl className="grid gap-x-4 gap-y-1 text-caption sm:grid-cols-[auto_minmax(0,1fr)]">
        {rows
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted">{label}</dt>
              <dd className="min-w-0 break-words">{value}</dd>
            </div>
          ))}
      </dl>
      {record.hasDocument ? (
        <a
          className="self-start text-caption font-medium text-primary-600 underline-offset-4 hover:underline"
          href={`/api/ota/affidavits/${record.id}/document`}
          target="_blank"
          rel="noreferrer"
        >
          {t('record.scan')}
        </a>
      ) : null}
      <span className="text-caption text-muted">{t('viewed')}</span>
    </div>
  );
}

function PaperAffidavitForm({
  reservationId,
  traveler,
  onDone,
}: {
  reservationId: string;
  traveler: TravelerOfacDto;
  onDone: () => void;
}) {
  const t = useTranslations('backoffice.reservation.ofac');
  const categories = useTranslations('ofac.categories');
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = (field: string) => `paper-${traveler.travelerId}-${field}`;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = fileRef.current?.files?.[0];
    if (!file || !SCAN_TYPES.includes(file.type)) {
      setError(t('paper.chooseFile'));
      return;
    }
    if (file.size > MAX_SCAN_BYTES) {
      setError(t('paper.tooLarge'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiRequest(
        `/reservations/${reservationId}/travelers/${traveler.travelerId}/affidavit`,
        {
          method: 'POST',
          body: JSON.stringify({
            category: form.get('category'),
            signerName: form.get('signerName'),
            signedAt: form.get('signedAt'),
            contentType: file.type,
            contentBase64: await readBase64(file),
          }),
        },
      );
      router.refresh();
      onDone();
    } catch (recordError) {
      setError(recordError instanceof Error ? recordError.message : t('paper.failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-3 rounded-md border p-3" onSubmit={onSubmit}>
      <span className="text-body-sm font-semibold">
        {t('paper.title', { name: traveler.fullName })}
      </span>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor={id('category')}>{t('paper.category')}</Label>
          <Select
            id={id('category')}
            name="category"
            defaultValue="SUPPORT_FOR_THE_CUBAN_PEOPLE"
          >
            {OFAC_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {categories(category)}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={id('signerName')}>{t('paper.signerName')}</Label>
          <Input
            id={id('signerName')}
            name="signerName"
            required
            maxLength={200}
            defaultValue={traveler.fullName}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={id('signedAt')}>{t('paper.signedAt')}</Label>
          <Input id={id('signedAt')} name="signedAt" type="date" required />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor={id('file')}>{t('paper.file')}</Label>
          <Input
            id={id('file')}
            ref={fileRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
          />
        </div>
      </div>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? t('paper.submitting') : t('paper.submit')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={onDone}
        >
          {t('paper.cancel')}
        </Button>
      </div>
    </form>
  );
}
