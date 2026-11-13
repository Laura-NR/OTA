import 'reflect-metadata';

import { Logger as NestLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { loadTenantConfig } from '@ota/config';
import { prisma } from '@ota/db';
import { createMailer, magicLinkEmail } from '@ota/email';
import express from 'express';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { setAuthRuntime } from './auth/auth.runtime';
import { RecoveryCodesService } from './auth/recovery-codes.service';
import { SessionPolicy } from './auth/session-policy';
import { SignInDevicesService } from './auth/sign-in-devices.service';
import {
  DEFAULT_SHUTDOWN_TIMEOUT_MS,
  enableGracefulShutdown,
} from './common/graceful-shutdown';
import { writeClientIp } from './common/client-ip';
import { registerJsonParsers } from './common/json-body';
import { createRateLimiter } from './common/rate-limit';
import { trustedOrigins } from './common/trusted-origins';
import { resolveTenantConfigPath } from './tenant/tenant.path';
import { WorkerCodesService } from './worker/worker-codes.service';

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

async function bootstrap(): Promise<void> {
  try {
    process.loadEnvFile('.env');
  } catch {
    // No local .env file; rely on the ambient process environment.
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET is required to start the API');
  }

  const tenant = loadTenantConfig(resolveTenantConfigPath());
  const mailer = createMailer();
  const origins = trustedOrigins();

  // Better Auth's session, passkey, recovery-code and worker-code routes ask
  // the Nest session policy (idle lock L5, passkeys P4), recovery codes and
  // worker codes, and every new session reports its device; requests arrive
  // only after `listen`, by which time all four are resolved below.
  const resolved: {
    sessionPolicy?: SessionPolicy;
    recoveryCodes?: RecoveryCodesService;
    signInDevices?: SignInDevicesService;
    workerCodes?: WorkerCodesService;
  } = {};
  const policy = (): SessionPolicy => {
    if (!resolved.sessionPolicy) throw new Error('The session policy is not ready');
    return resolved.sessionPolicy;
  };
  const recoveryCodes = (): RecoveryCodesService => {
    if (!resolved.recoveryCodes) throw new Error('Recovery codes are not ready');
    return resolved.recoveryCodes;
  };
  const signInDevices = (): SignInDevicesService => {
    if (!resolved.signInDevices) throw new Error('Sign-in devices are not ready');
    return resolved.signInDevices;
  };
  const workerCodes = (): WorkerCodesService => {
    if (!resolved.workerCodes) throw new Error('Worker codes are not ready');
    return resolved.workerCodes;
  };

  const { CLIENT_IP_HEADER, createAuth, createAuthMiddleware, toWebHeaders } =
    await import('@ota/auth');
  const auth = createAuth({
    prisma,
    secret,
    baseURL:
      process.env.BETTER_AUTH_URL ?? `http://localhost:${process.env.PORT ?? 3001}`,
    allowedHosts: (process.env.AUTH_ALLOWED_HOSTS ?? '').split(','),
    trustedOrigins: origins,
    magicLinkExpiresInSeconds:
      60 * positiveInt(process.env.MAGIC_LINK_EXPIRES_MINUTES, 10),
    sendMagicLink: async ({ email, url }) => {
      await mailer.send(magicLinkEmail({ to: email, url, branding: tenant.branding }));
    },
    passkey: {
      rpID: process.env.PASSKEY_RP_ID?.trim() || undefined,
      rpName: tenant.branding.agencyName,
      origins,
      policy: {
        changeRefusal: (input) => policy().changeRefusal(input),
        changed: (input) => policy().passkeyChanged(input),
      },
    },
    sessionGate: { refusal: (session) => policy().gateRefusal(session) },
    recoveryCode: { redeem: (input) => recoveryCodes().redeem(input) },
    signInDevice: { signedIn: (input) => signInDevices().signedIn(input) },
    workerCode: {
      send: (input) => workerCodes().send(input),
      redeem: (input) => workerCodes().redeem(input),
    },
  });
  setAuthRuntime({ auth, toWebHeaders });
  const authHandler = createAuthMiddleware(auth);

  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    bufferLogs: true,
  });
  resolved.sessionPolicy = app.get(SessionPolicy);
  resolved.recoveryCodes = app.get(RecoveryCodesService);
  resolved.signInDevices = app.get(SignInDevicesService);
  resolved.workerCodes = app.get(WorkerCodesService);
  if (process.env.STAFF_PASSKEYS_OVERRIDE?.trim().toLowerCase() === 'off') {
    new NestLogger('Bootstrap').warn(
      'STAFF_PASSKEYS_OVERRIDE=off: the staff passkey rule is suspended (break-glass)',
    );
  }
  if (process.env.SUPER_ADMIN_IP_ALLOWLIST_OVERRIDE?.trim().toLowerCase() === 'off') {
    new NestLogger('Bootstrap').warn(
      'SUPER_ADMIN_IP_ALLOWLIST_OVERRIDE=off: the Super Admin IP allowlist is suspended (break-glass)',
    );
  }
  enableGracefulShutdown(
    app,
    positiveInt(process.env.SHUTDOWN_TIMEOUT_MS, DEFAULT_SHUTDOWN_TIMEOUT_MS),
  );

  // Trust the proxy when deployed behind one, so rate limiting and sign-in
  // addresses (the Super Admin IP allowlist) use the real client IP rather
  // than the proxy's.
  const expressApp = app.getHttpAdapter().getInstance();
  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy) {
    expressApp.set('trust proxy', trustProxy === 'true' ? true : Number(trustProxy));
  }

  // Rate limiting runs as Express middleware (not a Nest guard) so it also
  // covers the Better Auth routes mounted below. Limits are per process.
  const limiter = createRateLimiter({
    windowMs: positiveInt(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
    max: positiveInt(process.env.RATE_LIMIT_MAX, 600),
    authMax: positiveInt(process.env.RATE_LIMIT_AUTH_MAX, 30),
    skip: (path) => path === '/health' || path.startsWith('/health/'),
  });
  expressApp.use(limiter.middleware);

  // Mount Better Auth before the JSON body parser so it receives the raw request.
  // It records a session's address from the header written here, never from
  // one the client sent (docs/schema-m9-ip-allowlist.md I2).
  expressApp.use(
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (!req.url.startsWith('/api/auth')) {
        next();
        return;
      }
      writeClientIp(req.headers, CLIENT_IP_HEADER, req.ip);
      void Promise.resolve()
        .then(() => authHandler(req, res, next))
        .catch(next);
    },
  );
  registerJsonParsers(expressApp);

  await app.init();
  app.useLogger(app.get(Logger));

  await app.listen(Number(process.env.PORT ?? 3001));
}

void bootstrap();
