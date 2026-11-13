'use client';

import { Alert, Button, Icon, Input, Label } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { FormEvent } from 'react';

import { authClient } from '@/lib/auth-client';

type Status = 'idle' | 'sending' | 'sent' | 'error';

/** Traveler sign-in: request a one-time magic link to the account dashboard. */
export function MagicLinkForm({ callbackPath = '/account' }: { callbackPath?: string }) {
  const t = useTranslations('login');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('sending');
    setError(null);

    const { error: authError } = await authClient.signIn.magicLink({
      email,
      callbackURL: `${window.location.origin}${callbackPath}`,
    });

    if (authError) {
      setStatus('error');
      setError(authError.message ?? t('error'));
      return;
    }
    setStatus('sent');
  }

  if (status === 'sent') {
    return <Alert variant="success">{t('sent', { email })}</Alert>;
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="account-email">{t('email')}</Label>
        <Input
          id="account-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-describedby="account-email-hint"
          className="h-12"
        />
        <p id="account-email-hint" className="text-caption text-muted">
          {t('emailHint')}
        </p>
      </div>

      {error ? <Alert variant="destructive">{error}</Alert> : null}

      <Button type="submit" size="lg" className="w-full" loading={status === 'sending'}>
        {status === 'sending' ? (
          t('sending')
        ) : (
          <>
            <Icon name="mail" />
            {t('send')}
          </>
        )}
      </Button>
    </form>
  );
}
