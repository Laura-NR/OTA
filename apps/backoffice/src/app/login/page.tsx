'use client';

import { ipAddressText } from '@ota/domain';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Checkbox,
  Input,
  Label,
} from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { authClient } from '@/lib/auth-client';
import { IDLE_KEYS, ownDeviceChosen, writeStored } from '@/lib/idle-lock';
import { refusedAddress } from '@/lib/ip-allowlist';

type Status = 'idle' | 'sending' | 'sent' | 'error';

export default function LoginPage() {
  const t = useTranslations('backoffice.login');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [passkeyRequired, setPasskeyRequired] = useState(false);
  const [ipRefusedFrom, setIpRefusedFrom] = useState<string | null | undefined>(
    undefined,
  );
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [ownDevice, setOwnDevice] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  // `?passkey=required`: the desk sent back someone who used a link but has a
  // passkey (docs/schema-m9-passkeys.md P3). Read after hydration.
  useEffect(() => {
    setPasskeyRequired(
      new URLSearchParams(window.location.search).get('passkey') === 'required',
    );
  }, []);

  // `?refused=ip`: the desk refused a Super Admin session signed in from
  // outside the IP allowlist (docs/schema-m9-ip-allowlist.md I3). Its cookie
  // would only be refused again, so it is signed out here.
  useEffect(() => {
    const address = refusedAddress(window.location.search);
    setIpRefusedFrom(address);
    if (address !== undefined) void authClient.signOut().catch(() => undefined);
  }, []);

  // "This is my own device" is remembered on this browser only, so the shared
  // desk PC keeps it unticked (docs/schema-m9-idle-lock.md L1); the desk sends
  // it to the new session once signed in.
  useEffect(() => setOwnDevice(ownDeviceChosen()), []);

  function chooseOwnDevice(value: boolean) {
    setOwnDevice(value);
    writeStored(IDLE_KEYS.ownDevice, value ? 'yes' : 'no');
  }

  // `?next=/path` returns the person there after sign-in (an invitation, M9).
  function nextPath(): string {
    const next = new URLSearchParams(window.location.search).get('next');
    return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
  }

  async function signInWithPasskey() {
    setPasskeyBusy(true);
    setError(null);
    const result = await authClient.signIn.passkey();
    if (result.error) {
      setPasskeyBusy(false);
      setError(result.error.message ?? t('passkeyFailed'));
      return;
    }
    window.location.assign(nextPath());
  }

  // A one-time code a Super Admin read out (docs/schema-m9-recovery-codes.md):
  // its session may only set up a passkey, so it always goes to /passkeys.
  async function signInWithRecoveryCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRecoveryBusy(true);
    setRecoveryError(null);
    try {
      const response = await fetch('/api/auth/sign-in/recovery-code', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, code: recoveryCode }),
      });
      if (response.ok) {
        window.location.assign('/passkeys');
        return;
      }
      setRecoveryError(
        response.status === 401 ? t('recoveryInvalid') : t('recoveryFailed'),
      );
    } catch {
      setRecoveryError(t('recoveryFailed'));
    }
    setRecoveryBusy(false);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('sending');
    setError(null);

    const path = nextPath();
    const { error: authError } = await authClient.signIn.magicLink({
      email,
      callbackURL: `${window.location.origin}${path}`,
    });

    if (authError) {
      setStatus('error');
      setError(authError.message ?? t('error'));
      return;
    }
    setStatus('sent');
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h1 className="text-h4 text-default">{t('title')}</h1>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {status === 'sent' ? (
            <Alert variant="success">{t('sent', { email })}</Alert>
          ) : (
            <div className="space-y-4">
              {passkeyRequired ? <Alert>{t('passkeyRequired')}</Alert> : null}
              {ipRefusedFrom !== undefined ? (
                <Alert variant="destructive">
                  {ipRefusedFrom
                    ? t('ipRefused', { address: ipAddressText(ipRefusedFrom) })
                    : t('ipRefusedUnknown')}
                </Alert>
              ) : null}
              <Checkbox
                label={t('ownDevice')}
                description={t('ownDeviceHint')}
                checked={ownDevice}
                onChange={(event) => chooseOwnDevice(event.target.checked)}
              />
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={passkeyBusy}
                onClick={() => void signInWithPasskey()}
              >
                {t('passkey')}
              </Button>
              <p className="text-center text-caption text-muted">{t('or')}</p>
              <form className="space-y-4" onSubmit={onSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="email">{t('email')}</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder={t('emailPlaceholder')}
                  />
                </div>

                {error ? <Alert variant="destructive">{error}</Alert> : null}

                <Button type="submit" className="w-full" disabled={status === 'sending'}>
                  {status === 'sending' ? t('sending') : t('send')}
                </Button>
              </form>
              <div className="space-y-3 border-t pt-4">
                <p className="text-caption text-muted">{t('lostEmail')}</p>
                {recovering ? (
                  <form className="space-y-4" onSubmit={signInWithRecoveryCode}>
                    <div className="space-y-2">
                      <Label htmlFor="recovery-code">{t('recoveryCode')}</Label>
                      <Input
                        id="recovery-code"
                        autoComplete="one-time-code"
                        autoCapitalize="characters"
                        spellCheck={false}
                        required
                        maxLength={64}
                        className="font-mono"
                        aria-describedby="recovery-code-hint"
                        value={recoveryCode}
                        onChange={(event) => setRecoveryCode(event.target.value)}
                      />
                      <p id="recovery-code-hint" className="text-caption text-muted">
                        {t('recoveryHint')}
                      </p>
                    </div>
                    <Button
                      type="submit"
                      variant="secondary"
                      className="w-full"
                      disabled={recoveryBusy}
                      unavailableReason={
                        email.trim() === '' ? t('recoveryEmailFirst') : undefined
                      }
                    >
                      {t('recoverySubmit')}
                    </Button>
                    {recoveryError ? (
                      <Alert variant="destructive">{recoveryError}</Alert>
                    ) : null}
                  </form>
                ) : (
                  <Button
                    type="button"
                    variant="tertiary"
                    size="sm"
                    onClick={() => setRecovering(true)}
                  >
                    {t('recoveryOpen')}
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
