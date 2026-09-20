import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { loadTenantConfig } from '@ota/config';
import { prisma } from '@ota/db';
import { createMailer, magicLinkEmail } from '@ota/email';
import express from 'express';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { setAuthRuntime } from './auth/auth.runtime';
import { resolveTenantConfigPath } from './tenant/tenant.path';

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
  const trustedOrigins = (
    process.env.TRUSTED_ORIGINS ?? 'http://localhost:3000,http://localhost:3002'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const { createAuth, createAuthMiddleware, toWebHeaders } = await import('@ota/auth');
  const auth = createAuth({
    prisma,
    secret,
    baseURL:
      process.env.BETTER_AUTH_URL ?? `http://localhost:${process.env.PORT ?? 3001}`,
    trustedOrigins,
    sendMagicLink: async ({ email, url }) => {
      await mailer.send(magicLinkEmail({ to: email, url, branding: tenant.branding }));
    },
  });
  setAuthRuntime({ auth, toWebHeaders });
  const authHandler = createAuthMiddleware(auth);

  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    bufferLogs: true,
  });

  // Mount Better Auth before the JSON body parser so it receives the raw request.
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.use(
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (!req.url.startsWith('/api/auth')) {
        next();
        return;
      }
      void Promise.resolve()
        .then(() => authHandler(req, res, next))
        .catch(next);
    },
  );
  expressApp.use(express.json());

  await app.init();
  app.useLogger(app.get(Logger));

  await app.listen(Number(process.env.PORT ?? 3001));
}

void bootstrap();
