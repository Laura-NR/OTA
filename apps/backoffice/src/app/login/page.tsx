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
import { useState } from 'react';
import type { FormEvent } from 'react';

import { authClient } from '@/lib/auth-client';

type Status = 'idle' | 'sending' | 'sent' | 'error';

export default function LoginPage() {
  const t = useTranslations('backoffice.login');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('sending');
    setError(null);

    const { error: authError } = await authClient.signIn.magicLink({
      email,
      callbackURL: `${window.location.origin}/`,
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
          )}
        </CardContent>
      </Card>
    </main>
  );
}
