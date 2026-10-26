import { describe, expect, it } from 'vitest';

import { passkeyChangeForPath, signInMethodForPath } from '../src/sign-in-method';

describe('the sign-in method a session records (docs/schema-m9-passkeys.md P2)', () => {
  it('records a passkey only for a passkey sign-in', () => {
    expect(signInMethodForPath('/passkey/verify-authentication')).toBe('passkey');
  });

  it('does not count a session created while adding a passkey', () => {
    expect(signInMethodForPath('/passkey/verify-registration')).toBe('other');
  });

  it('names the link, password and OAuth sign-ins', () => {
    expect(signInMethodForPath('/magic-link/verify')).toBe('magic_link');
    expect(signInMethodForPath('/sign-in/email')).toBe('password');
    expect(signInMethodForPath('/sign-up/email')).toBe('password');
    expect(signInMethodForPath('/callback/:id')).toBe('oauth');
    expect(signInMethodForPath('/callback/google')).toBe('oauth');
  });

  it('fails closed for any other route, or none', () => {
    for (const path of ['/sign-in/anonymous', '/passkey', '', null, undefined]) {
      expect(signInMethodForPath(path)).toBe('other');
    }
  });
});

describe('the passkey routes the staff rule guards (P4)', () => {
  it('maps the add, rename and delete routes', () => {
    expect(passkeyChangeForPath('/passkey/generate-register-options')).toBe('register');
    expect(passkeyChangeForPath('/passkey/verify-registration')).toBe('register');
    expect(passkeyChangeForPath('/passkey/update-passkey')).toBe('rename');
    expect(passkeyChangeForPath('/passkey/delete-passkey')).toBe('delete');
  });

  it('leaves sign-in and listing alone', () => {
    for (const path of [
      '/passkey/generate-authenticate-options',
      '/passkey/verify-authentication',
      '/passkey/list-user-passkeys',
      undefined,
    ]) {
      expect(passkeyChangeForPath(path)).toBeNull();
    }
  });
});
