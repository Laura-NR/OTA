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
import { useState } from 'react';
import type { FormEvent } from 'react';

import { authClient } from '@/lib/auth-client';

type Status = 'idle' | 'sending' | 'sent' | 'error';

export default function LoginPage() {
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
      setError(authError.message ?? 'Could not send the sign-in link.');
      return;
    }
    setStatus('sent');
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            Enter your work email and we will send you a one-time sign-in link.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status === 'sent' ? (
            <Alert variant="success">
              Check your inbox — a sign-in link is on its way to {email}. Locally it lands
              in Mailpit at http://localhost:8025.
            </Alert>
          ) : (
            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@agency.test"
                />
              </div>

              {error ? <Alert variant="destructive">{error}</Alert> : null}

              <Button type="submit" className="w-full" disabled={status === 'sending'}>
                {status === 'sending' ? 'Sending…' : 'Send magic link'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
