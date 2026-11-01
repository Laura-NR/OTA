'use client';

import type { RecoveryCodeIssuedDto, StaffInviteDto, StaffUserDto } from '@ota/schemas';
import { Alert, Button, Dialog, Field, Input, Select } from '@ota/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';

import { apiRequest } from '@/lib/client-api';
import { opsTime } from '@/lib/ops-format';

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
 * Administrative Support, sign out everywhere, reset a lost device's passkeys
 * with a reason (`docs/schema-m9-passkeys.md` P5), issue or withdraw a
 * recovery code (`docs/schema-m9-recovery-codes.md`), deactivate or
 * reactivate. Promotion to Super Admin is an invitation; nobody acts on
 * themselves.
 */
export function StaffActions({ user, isSelf }: { user: StaffUserDto; isSelf: boolean }) {
  const t = useTranslations('backoffice.settings.users');
  const why = useTranslations('backoffice.unavailable');
  const id = useId();
  const locale = useLocale();
  const { run, busy, error } = useStaffAction();
  const [resetting, setResetting] = useState(false);
  const [reason, setReason] = useState('');
  if (isSelf) return <span className="text-caption text-muted">{t('you')}</span>;
  const name = user.fullName ?? user.email;

  async function reset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await run(`/staff/${user.id}/reset-passkeys`, 'POST', { reason })) {
      setResetting(false);
      setReason('');
    }
  }

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
        {!user.deactivatedAt && user.passkeys > 0 && !resetting ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => setResetting(true)}
          >
            {t('resetPasskeys')}
          </Button>
        ) : null}
        {!user.deactivatedAt ? <RecoveryCodeAction user={user} /> : null}
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
      {resetting ? (
        <form className="flex flex-col gap-2" onSubmit={reset}>
          <Field
            id={`${id}-reset`}
            label={t('resetReason')}
            hint={t('resetHint', { name })}
            required
          >
            {(control) => (
              <Input
                {...control}
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            )}
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              size="sm"
              variant="destructive"
              disabled={busy}
              unavailableReason={
                reason.trim().length < 3
                  ? why('minLength', { min: 3, field: t('resetReason') })
                  : undefined
              }
            >
              {t('resetConfirm')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setResetting(false)}
            >
              {t('resetCancel')}
            </Button>
          </div>
        </form>
      ) : null}
      {user.recoveryCodeOpenUntil && !user.deactivatedAt ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-caption text-secondary">
            {t('recoveryOpen', { time: opsTime(user.recoveryCodeOpenUntil, locale) })}
          </span>
          <Button
            size="sm"
            variant="tertiary"
            disabled={busy}
            aria-label={t('recoveryWithdrawFor', { name })}
            onClick={() => void run(`/staff/${user.id}/recovery-code/withdraw`, 'POST')}
          >
            {t('recoveryWithdraw')}
          </Button>
        </div>
      ) : null}
      {error ? <Alert variant="destructive">{error}</Alert> : null}
    </div>
  );
}

/**
 * "Issue recovery code…" (A-Settings): a reason, a warning that the person's
 * passkeys and sessions go, then the code, shown once, to read out by phone
 * or in person. Closing the dialog forgets it.
 */
function RecoveryCodeAction({ user }: { user: StaffUserDto }) {
  const t = useTranslations('backoffice.settings.users');
  const why = useTranslations('backoffice.unavailable');
  const locale = useLocale();
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<RecoveryCodeIssuedDto | null>(null);
  const name = user.fullName ?? user.email;

  function close() {
    setOpen(false);
    setReason('');
    setError(null);
    setIssued(null);
  }

  async function issue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setIssued(
        await apiRequest<RecoveryCodeIssuedDto>(`/staff/${user.id}/recovery-code`, {
          method: 'POST',
          body: JSON.stringify({ reason }),
        }),
      );
      router.refresh();
    } catch (issueError) {
      setError(issueError instanceof Error ? issueError.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        {t('issueRecovery')}
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title={t('recoveryTitle', { name })}
        description={issued ? undefined : t('recoveryDescription')}
        closeLabel={t('recoveryClose')}
      >
        {issued ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1 rounded-md border bg-page p-4">
              <span className="text-caption text-secondary">
                {t('recoveryCodeLabel')}
              </span>
              <code className="font-mono text-h3 tracking-wider text-default">
                {issued.code}
              </code>
            </div>
            <p>{t('recoveryRead', { name, time: opsTime(issued.expiresAt, locale) })}</p>
            <div className="flex justify-end">
              <Button onClick={close}>{t('recoveryDone')}</Button>
            </div>
          </div>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={issue}>
            <Alert variant="warning">
              {t('recoveryWarning', { name, count: user.passkeys })}
            </Alert>
            <Field id={`${id}-recovery`} label={t('resetReason')} required>
              {(control) => (
                <Input
                  {...control}
                  maxLength={500}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              )}
            </Field>
            {error ? <Alert variant="destructive">{error}</Alert> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={close}>
                {t('resetCancel')}
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={busy}
                unavailableReason={
                  reason.trim().length < 3
                    ? why('minLength', { min: 3, field: t('resetReason') })
                    : undefined
                }
              >
                {t('recoveryIssue')}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
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
  const why = useTranslations('backoffice.unavailable');
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
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          disabled={busy}
          unavailableReason={
            email.trim() === '' ? why('fillIn', { field: t('email') }) : undefined
          }
        >
          {t('send')}
        </Button>
      </div>
      <p className="text-caption text-muted">{t('note')}</p>
    </form>
  );
}
