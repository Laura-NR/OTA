'use client';

import type { PasskeyStatusDto } from '@ota/schemas';
import { Alert, Button, Field, Input, buttonClassName } from '@ota/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';

import { authClient } from '@/lib/auth-client';

export interface PasskeyRow {
  id: string;
  name: string | null;
  /** "26 Oct 2026", formatted on the server. */
  addedOn: string | null;
  synced: boolean;
}

export interface PasskeyManagerProps {
  state: PasskeyStatusDto['state'];
  passkeys: PasskeyRow[];
}

/**
 * The desk's passkey page (`docs/schema-m9-passkeys.md` P3, P4). A staff
 * member with no passkey sets one up and then signs in with it; one who used
 * a link signs in with theirs; anyone else lists, adds, renames and removes
 * them. Better Auth runs the ceremonies, and the API refuses a change the
 * staff rule does not allow, so its message is shown as is.
 */
export function PasskeyManager({ state, passkeys }: PasskeyManagerProps) {
  const t = useTranslations('backoffice.passkeys');
  const router = useRouter();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [added, setAdded] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  async function attempt(work: () => Promise<{ error: { message?: string } | null }>) {
    setBusy(true);
    setError(null);
    try {
      const { error: authError } = await work();
      if (authError) {
        setError(authError.message ?? t('failed'));
        return false;
      }
      return true;
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : t('failed'));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await attempt(async () => {
      const result = await authClient.passkey.addPasskey(
        name.trim() ? { name: name.trim() } : {},
      );
      return { error: result?.error ?? null };
    });
    if (ok) {
      setName('');
      if (state === 'ok') router.refresh();
      else setAdded(true);
    }
  }

  async function signIn() {
    const ok = await attempt(async () => {
      const result = await authClient.signIn.passkey();
      return { error: result.error };
    });
    if (ok) window.location.assign('/dashboard');
  }

  async function rename(event: FormEvent<HTMLFormElement>, passkeyId: string) {
    event.preventDefault();
    const ok = await attempt(() =>
      authClient.passkey.updatePasskey({ id: passkeyId, name: newName.trim() }),
    );
    if (ok) {
      setRenaming(null);
      router.refresh();
    }
  }

  async function remove(passkeyId: string) {
    if (await attempt(() => authClient.passkey.deletePasskey({ id: passkeyId }))) {
      router.refresh();
    }
  }

  const addForm = (
    <form className="flex flex-col gap-3" onSubmit={add}>
      <Field id={`${id}-name`} label={t('name')} hint={t('nameHint')}>
        {(control) => (
          <Input
            {...control}
            maxLength={60}
            autoComplete="off"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        )}
      </Field>
      <div>
        <Button type="submit" disabled={busy}>
          {state === 'ok' && passkeys.length > 0 ? t('addAnother') : t('add')}
        </Button>
      </div>
    </form>
  );

  if (state === 'enroll' || state === 'use_passkey') {
    const ready = state === 'use_passkey' || added;
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-h4">
          {state === 'enroll' ? t('setupTitle') : t('useTitle')}
        </h2>
        <p>{state === 'enroll' ? t('setupDescription') : t('useDescription')}</p>
        {added ? <Alert variant="success">{t('added')}</Alert> : null}
        {error ? <Alert variant="destructive">{error}</Alert> : null}
        {ready ? (
          <div>
            <Button disabled={busy} onClick={() => void signIn()}>
              {t('signIn')}
            </Button>
          </div>
        ) : (
          addForm
        )}
        <p className="text-caption text-muted">{t('twoAdvice')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby={`${id}-list`} className="flex flex-col gap-3">
        <h2 id={`${id}-list`} className="text-h4">
          {t('listTitle')}
        </h2>
        {passkeys.length === 0 ? (
          <p className="text-muted">{t('empty')}</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-md border">
            {passkeys.map((passkey) => {
              const label = passkey.name ?? t('unnamed');
              return (
                <li key={passkey.id} className="flex flex-col gap-2 px-4 py-3">
                  {renaming === passkey.id ? (
                    <form
                      className="flex flex-wrap items-end gap-2"
                      onSubmit={(event) => void rename(event, passkey.id)}
                    >
                      <Field
                        id={`${id}-rename-${passkey.id}`}
                        label={t('renameLabel', { name: label })}
                        className="min-w-0 flex-1"
                      >
                        {(control) => (
                          <Input
                            {...control}
                            maxLength={60}
                            required
                            value={newName}
                            onChange={(event) => setNewName(event.target.value)}
                          />
                        )}
                      </Field>
                      <Button type="submit" size="sm" disabled={busy}>
                        {t('save')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => setRenaming(null)}
                      >
                        {t('cancel')}
                      </Button>
                    </form>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-col">
                        <strong className="truncate">{label}</strong>
                        <span className="text-caption text-secondary">
                          {[
                            passkey.addedOn
                              ? t('addedOn', { date: passkey.addedOn })
                              : null,
                            passkey.synced ? t('synced') : t('thisDevice'),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          aria-label={`${t('rename')}: ${label}`}
                          onClick={() => {
                            setRenaming(passkey.id);
                            setNewName(passkey.name ?? '');
                          }}
                        >
                          {t('rename')}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busy}
                          aria-label={`${t('remove')}: ${label}`}
                          onClick={() => void remove(passkey.id)}
                        >
                          {t('remove')}
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      {addForm}
      <p className="text-caption text-muted">{t('twoAdvice')}</p>
      <p className="text-caption text-muted">{t('changeNote')}</p>
      <div>
        <Link href="/dashboard" className={buttonClassName({ variant: 'secondary' })}>
          {t('back')}
        </Link>
      </div>
    </div>
  );
}
