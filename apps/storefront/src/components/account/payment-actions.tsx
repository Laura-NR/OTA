'use client';

import { Alert, Button, Icon, cn } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useRef, useState, type ChangeEvent } from 'react';

/** Up to 10 MB, as the API accepts. */
const MAX_PROOF_BYTES = 10 * 1024 * 1024;

type Plan = 'DEPOSIT' | 'FULL';

async function startTransfer(reservationId: string, plan?: Plan): Promise<string> {
  const response = await fetch(`/api/ota/me/reservations/${reservationId}/payments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ rail: 'OPEN_BANKING_SEPA', ...(plan ? { plan } : {}) }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: unknown;
    } | null;
    throw new Error(typeof body?.message === 'string' ? body.message : '');
  }
  return ((await response.json()) as { checkoutUrl: string }).checkoutUrl;
}

export interface PlanOption {
  plan: Plan;
  /** Already formatted on the server ("Deposit · 20 %", "€620 now, …"). */
  label: string;
  text: string;
}

/**
 * The Payment board's "Amount" choice before the first payment: a deposit
 * (when the package's plan allows it) or the full amount. The choice is fixed
 * by the link it creates; card payments wait for the card gateway.
 */
export function PlanChooser({
  reservationId,
  options,
}: {
  reservationId: string;
  options: PlanOption[];
}) {
  const t = useTranslations('account.payment');
  const [plan, setPlan] = useState<Plan>(options[0]!.plan);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      window.location.href = await startTransfer(reservationId, plan);
    } catch (startError) {
      setError((startError as Error).message || t('failed'));
      setBusy(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div
        role="radiogroup"
        aria-label={t('choose')}
        className="grid gap-3 sm:grid-cols-2"
      >
        {options.map((option) => (
          <label
            key={option.plan}
            className={cn(
              'flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border bg-surface p-4 transition-colors hover:border-primary-600',
              plan === option.plan && 'border-2 border-primary-600 bg-primary-50',
            )}
          >
            <input
              type="radio"
              name="plan"
              value={option.plan}
              checked={plan === option.plan}
              onChange={() => setPlan(option.plan)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-primary-600"
            />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-body font-semibold text-default">{option.label}</span>
              <span className="text-body-sm text-secondary">{option.text}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="text-body-sm text-secondary">
        {t('method')} · {t('cardSoon')}
      </p>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <Button className="self-start" loading={busy} onClick={go}>
        {busy ? t('working') : t('continue')}
      </Button>
    </div>
  );
}

/** Start the transfer for the instalment still due (the balance, after a deposit). */
export function PayInstalmentButton({
  reservationId,
  label,
}: {
  reservationId: string;
  label: string;
}) {
  const t = useTranslations('account.payment');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      window.location.href = await startTransfer(reservationId);
    } catch (startError) {
      setError((startError as Error).message || t('failed'));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <Button loading={busy} onClick={go}>
        {busy ? t('working') : label}
      </Button>
    </div>
  );
}

/**
 * "Proof of transfer · optional, speeds things up" (Payment board): a PDF or a
 * photo of the bank receipt for a pending transfer. The desk checks it by hand.
 */
export function ProofUpload({
  reservationId,
  paymentId,
}: {
  reservationId: string;
  paymentId: string;
}) {
  const t = useTranslations('account.payment');
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const field = event.currentTarget;
    if (!file) return;
    setError(null);
    if (file.size > MAX_PROOF_BYTES) {
      setError(t('proofTooLarge'));
      field.value = '';
      return;
    }
    setBusy(true);
    try {
      const contentBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const response = await fetch(
        `/api/ota/me/reservations/${reservationId}/payments/${paymentId}/proof`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ contentType: file.type, contentBase64 }),
        },
      );
      if (!response.ok) {
        throw new Error(t('proofFailed'));
      }
      router.refresh();
    } catch (uploadError) {
      setError((uploadError as Error).message || t('proofFailed'));
    } finally {
      setBusy(false);
      field.value = '';
    }
  }

  const id = `proof-${paymentId}`;
  return (
    <div className="flex flex-col items-start gap-2">
      <label
        htmlFor={id}
        className={cn(
          'inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-input bg-surface px-4 text-body-sm font-semibold text-primary-600 hover:bg-sunken',
          busy && 'pointer-events-none opacity-60',
        )}
      >
        <Icon name="upload" className="h-4 w-4" />
        {busy ? t('uploading') : t('proofChoose')}
      </label>
      <input
        ref={input}
        id={id}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        className="sr-only"
        disabled={busy}
        onChange={onFile}
      />
      <p className="text-caption text-muted">{t('proofHint')}</p>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
    </div>
  );
}
