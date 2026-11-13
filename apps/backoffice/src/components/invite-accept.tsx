'use client';

import { Alert, Button, buttonClassName } from '@ota/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';

import { apiRequest } from '@/lib/client-api';

/** The invitee, signed in, accepts; the API checks the address and applies the role. */
export function InviteAccept({ token, email }: { token: string; email: string }) {
  const t = useTranslations('backoffice.invite');
  const roles = useTranslations('backoffice.settings.users.roles');
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [role, setRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setState('busy');
    setError(null);
    try {
      const result = await apiRequest<{ role: string }>('/staff/invites/accept', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
      setRole(result.role);
      setState('done');
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : t('failed'));
      setState('idle');
    }
  }

  if (state === 'done' && role) {
    return (
      <>
        <Alert variant="success">{t('accepted', { role: roles(role) })}</Alert>
        <Link href="/dashboard" className={buttonClassName({ variant: 'primary' })}>
          {t('openDesk')}
        </Link>
      </>
    );
  }

  return (
    <>
      <p>{t('signedInAs', { email })}</p>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <Button onClick={() => void accept()} disabled={state === 'busy'}>
        {t('accept')}
      </Button>
      <p className="text-caption text-muted">{t('wrongAddress')}</p>
    </>
  );
}
