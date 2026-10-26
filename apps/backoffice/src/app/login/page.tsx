'use client';

import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { authClient } from '@/lib/auth-client';

type Status = 'idle' | 'sending' | 'sent' | 'error';

export default function LoginPage() {
  const t = useTranslations('backoffice.login');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [passkeyRequired, setPasskeyRequired] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);

  // `?passkey=required`: the desk sent back someone who used a link but has a
  // passkey (docs/schema-m9-passkeys.md P3). Read after hydration.
  useEffect(() => {
    setPasskeyRequired(
      new URLSearchParams(window.location.search).get('passkey') === 'required',
    );
  }, []);

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
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {status === 'sent' ? (
            <Alert variant="success">{t('sent', { email })}</Alert>
          ) : (
            <div className="space-y-4">
              {passkeyRequired ? <Alert>{t('passkeyRequired')}</Alert> : null}
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
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
