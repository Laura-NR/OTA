import 'reflect-metadata';

import { GATEWAY_OPTIONS } from '@nestjs/websockets/constants';
import type { IncomingMessage } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { socketOriginAllowed, trustedOrigins } from '../src/common/trusted-origins';
import { EscalationGateway } from '../src/escalation/escalation.gateway';
import { MessagingGateway } from '../src/messages/messaging.gateway';

interface GatewayOptions {
  cors: {
    origin: (
      origin: string | undefined,
      callback: (e: Error | null, ok?: boolean) => void,
    ) => void;
    credentials: boolean;
  };
  allowRequest: (
    request: IncomingMessage,
    callback: (error: string | null | undefined, success: boolean) => void,
  ) => void;
}

function optionsOf(gateway: object): GatewayOptions {
  return Reflect.getMetadata(GATEWAY_OPTIONS, gateway) as GatewayOptions;
}

function handshake(options: GatewayOptions, origin: string | undefined): boolean {
  let allowed = false;
  options.allowRequest(
    { headers: origin ? { origin } : {} } as IncomingMessage,
    (_e, ok) => {
      allowed = ok;
    },
  );
  return allowed;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('trusted origins (deployment plan F11, B7)', () => {
  it('defaults to the dev storefront and desk', () => {
    vi.stubEnv('TRUSTED_ORIGINS', undefined);
    expect(trustedOrigins()).toEqual(['http://localhost:3000', 'http://localhost:3002']);
  });

  it('admits only a listed origin, compared as an origin', () => {
    vi.stubEnv(
      'TRUSTED_ORIGINS',
      'https://veredaexpeditions.com, https://desk.veredaexpeditions.com/',
    );
    expect(socketOriginAllowed('https://desk.veredaexpeditions.com')).toBe(true);
    expect(socketOriginAllowed('https://veredaexpeditions.com')).toBe(true);
    expect(socketOriginAllowed('https://analytics.veredaexpeditions.com')).toBe(false);
    expect(socketOriginAllowed('http://desk.veredaexpeditions.com')).toBe(false);
    expect(socketOriginAllowed('https://desk.veredaexpeditions.com:8443')).toBe(false);
    expect(socketOriginAllowed('null')).toBe(false);
  });

  it('lets a handshake with no Origin reach the session check', () => {
    expect(socketOriginAllowed(undefined)).toBe(true);
  });

  it('reads the environment when asked, not when the module loaded', () => {
    vi.stubEnv('TRUSTED_ORIGINS', 'https://one.example.test');
    expect(socketOriginAllowed('https://one.example.test')).toBe(true);
    vi.stubEnv('TRUSTED_ORIGINS', 'https://two.example.test');
    expect(socketOriginAllowed('https://one.example.test')).toBe(false);
  });

  it.each([
    ['/ops', EscalationGateway],
    ['/conversations', MessagingGateway],
  ])(
    'the %s gateway refuses an untrusted origin on the handshake and in CORS',
    (_name, gateway) => {
      vi.stubEnv('TRUSTED_ORIGINS', 'http://localhost:3002');
      const options = optionsOf(gateway);

      expect(handshake(options, 'http://localhost:3002')).toBe(true);
      expect(handshake(options, 'http://localhost:4000')).toBe(false);
      expect(handshake(options, undefined)).toBe(true);

      const cors: Array<boolean | undefined> = [];
      options.cors.origin('http://localhost:4000', (_e, ok) => cors.push(ok));
      options.cors.origin('http://localhost:3002', (_e, ok) => cors.push(ok));
      expect(cors).toEqual([false, true]);
      expect(options.cors.credentials).toBe(true);
    },
  );
});
