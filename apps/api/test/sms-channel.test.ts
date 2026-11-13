import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../src/auth/auth.service';
import { setAuthRuntime } from '../src/auth/auth.runtime';
import {
  ConsoleSmsChannel,
  NoSmsChannel,
  createSmsChannel,
} from '../src/sms/sms.channel';

describe('the SMS channel (ADR 0007)', () => {
  it('logs in development and sends nothing in production until a provider exists', () => {
    expect(createSmsChannel({ NODE_ENV: 'development' })).toBeInstanceOf(
      ConsoleSmsChannel,
    );
    expect(createSmsChannel({ NODE_ENV: 'production' })).toBeInstanceOf(NoSmsChannel);
    expect(
      createSmsChannel({ NODE_ENV: 'production', SMS_PROVIDER: 'console' }),
    ).toBeInstanceOf(ConsoleSmsChannel);
    expect(createSmsChannel({ SMS_PROVIDER: 'none' })).toBeInstanceOf(NoSmsChannel);
    expect(() => createSmsChannel({ SMS_PROVIDER: 'twilio' })).toThrow(
      /Unknown SMS_PROVIDER/,
    );
  });

  it('never writes a production message body to the log', async () => {
    const channel = new NoSmsChannel();
    const warn = vi
      .spyOn(
        (channel as unknown as { logger: { warn: (text: string) => void } }).logger,
        'warn',
      )
      .mockImplementation(() => undefined);
    await channel.send({
      to: '+5352410088',
      body: 'Vereda: tu codigo para entrar es 123456.',
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('+53 5 241 •• 88');
    expect(warn.mock.calls[0]![0]).not.toContain('123456');
    expect(warn.mock.calls[0]![0]).not.toContain('52410088');
  });
});

describe('a refused bearer token (docs/worker-app-plan.md W3)', () => {
  afterEach(() => vi.restoreAllMocks());

  function runtime(getSession: () => Promise<unknown>) {
    setAuthRuntime({
      auth: { api: { getSession }, handler: async () => new Response() } as never,
      toWebHeaders: () => new Headers(),
    });
  }

  it('reads as no session, so the route answers 401', async () => {
    runtime(async () => {
      throw Object.assign(new Error('refused'), { body: { code: 'BEARER_NOT_ALLOWED' } });
    });
    expect(
      await new AuthService().getSession({ authorization: 'Bearer x.y' }),
    ).toBeNull();
  });

  it('still raises any other failure', async () => {
    runtime(async () => {
      throw new Error('database down');
    });
    await expect(new AuthService().getSession({})).rejects.toThrow('database down');
  });
});
