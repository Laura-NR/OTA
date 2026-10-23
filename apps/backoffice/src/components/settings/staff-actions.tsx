'use client';

import type { StaffInviteDto, StaffUserDto } from '@ota/schemas';
import { Alert, Button, Field, Input, Select } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';

import { apiRequest } from '@/lib/client-api';

/** Run one staff action, then refresh the page; the error stays beside it. */
function useStaffAction() {
  const t = useTranslations('backoffice.settings.users');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(path: string, method: 'POST' | 'PATCH', body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
      router.refresh();
      return true;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : t('failed'));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { run, busy, error };
}

/**
 * A staff row's actions (M9 D5): move between Operations Admin and
 * Administrative Support, sign out everywhere, deactivate or reactivate.
 * Promotion to Super Admin is an invitation; nobody acts on themselves.
 */
export function StaffActions({ user, isSelf }: { user: StaffUserDto; isSelf: boolean }) {
  const t = useTranslations('backoffice.settings.users');
  const { run, busy, error } = useStaffAction();
  if (isSelf) return <span className="text-caption text-muted">{t('you')}</span>;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {user.role !== 'SUPER_ADMIN' && !user.deactivatedAt ? (
          <Select
            aria-label={t('roleFor', { name: user.fullName ?? user.email })}
            className="w-52"
            value={user.role}
            disabled={busy}
            onChange={(event) =>
              void run(`/staff/${user.id}`, 'PATCH', { role: event.target.value })
            }
          >
            <option value="OPERATIONS_ADMIN">{t('roles.OPERATIONS_ADMIN')}</option>
            <option value="ADMINISTRATIVE_SUPPORT">
              {t('roles.ADMINISTRATIVE_SUPPORT')}
            </option>
          </Select>
        ) : null}
        {!user.deactivatedAt ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void run(`/staff/${user.id}/revoke-sessions`, 'POST')}
          >
            {t('revokeSessions')}
          </Button>
        ) : null}
        {user.deactivatedAt ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void run(`/staff/${user.id}/reactivate`, 'POST')}
          >
            {t('reactivate')}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="destructive"
            disabled={busy}
            onClick={() => void run(`/staff/${user.id}/deactivate`, 'POST')}
          >
            {t('deactivate')}
          </Button>
        )}
      </div>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
    </div>
  );
}

/** An invitation's actions: confirm (a second Super Admin), send again, revoke. */
export function InviteActions({
  invite,
  actorId,
}: {
  invite: StaffInviteDto;
  actorId: string;
}) {
  const t = useTranslations('backoffice.settings.invites');
  const { run, busy, error } = useStaffAction();
  const awaiting = invite.state === 'AWAITING_CONFIRMATION';
  const open = awaiting || invite.state === 'SENT';
  const resendable = invite.state === 'SENT' || invite.state === 'EXPIRED';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {awaiting && invite.invitedById !== actorId ? (
          <Button
            size="sm"
            disabled={busy}
            onClick={() => void run(`/staff/invites/${invite.id}/confirm`, 'POST')}
          >
            {t('confirm')}
          </Button>
        ) : null}
        {resendable ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void run(`/staff/invites/${invite.id}/resend`, 'POST')}
          >
            {t('resend')}
          </Button>
        ) : null}
        {open ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void run(`/staff/invites/${invite.id}/revoke`, 'POST')}
          >
            {t('revoke')}
          </Button>
        ) : null}
      </div>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
    </div>
  );
}

/** "Invite a user" (M9 D4): a work address and a role. */
export function InviteForm({ allowedDomains }: { allowedDomains: readonly string[] }) {
  const t = useTranslations('backoffice.settings.invites');
  const roles = useTranslations('backoffice.settings.users.roles');
  const id = useId();
  const { run, busy, error } = useStaffAction();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('ADMINISTRATIVE_SUPPORT');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await run('/staff/invites', 'POST', { email, role })) {
      setEmail('');
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <div className="grid gap-3">
        <Field
          id={`${id}-email`}
          label={t('email')}
          hint={
            allowedDomains.length > 0
              ? t('domains', {
                  domains: allowedDomains.map((domain) => `@${domain}`).join(', '),
                })
              : t('anyDomain')
          }
          required
        >
          {(control) => (
            <Input
              {...control}
              type="email"
              autoComplete="off"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </Field>
        <Field id={`${id}-role`} label={t('role')}>
          {(control) => (
            <Select
              {...control}
              value={role}
              onChange={(event) => setRole(event.target.value)}
            >
              <option value="ADMINISTRATIVE_SUPPORT">
                {roles('ADMINISTRATIVE_SUPPORT')}
              </option>
              <option value="OPERATIONS_ADMIN">{roles('OPERATIONS_ADMIN')}</option>
              <option value="SUPER_ADMIN">{t('superAdminOption')}</option>
            </Select>
          )}
        </Field>
      </div>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <div>
        <Button type="submit" disabled={busy || email.trim() === ''}>
          {t('send')}
        </Button>
      </div>
      <p className="text-caption text-muted">{t('note')}</p>
    </form>
  );
}
