import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { parseTenantConfig } from '@ota/config';
import type { EmailMessage } from '@ota/email';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { MAILER } from '../src/email/email.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TENANT_CONFIG } from '../src/tenant/tenant.tokens';

function tenant(supportEmail: string | null) {
  return parseTenantConfig({
    tenantId: 'test-agency',
    branding: { agencyName: 'Test Agency', licenseNumber: 'MINTUR-TEST', supportEmail },
  });
}

const MESSAGE = {
  name: 'Jane Traveler',
  email: 'jane@example.test',
  topic: 'booking',
  bookingCode: 'e2e0001',
  message: 'Can we add a night in Viñales before the trip?',
  replyLocale: 'en',
  consent: true,
};

describe('Support form (POST /contact)', () => {
  let app: INestApplication;
  let sent: EmailMessage[];
  const previousRecipient = process.env.OPS_NOTIFY_EMAIL;

  /** Boot the app with a tenant of our choosing; a second boot replaces the first. */
  async function boot(supportEmail: string | null = null) {
    if (app) {
      await app.close();
    }
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(TENANT_CONFIG)
      .useValue(tenant(supportEmail))
      .overrideProvider(MAILER)
      .useValue({ send: async (message: EmailMessage) => void sent.push(message) })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  }

  beforeEach(async () => {
    sent = [];
    process.env.OPS_NOTIFY_EMAIL = 'desk@example.test';
    await boot();
  });

  afterEach(async () => {
    await app.close();
    if (previousRecipient === undefined) {
      delete process.env.OPS_NOTIFY_EMAIL;
    } else {
      process.env.OPS_NOTIFY_EMAIL = previousRecipient;
    }
  });

  it('forwards a message to the agency inbox without a session, replying to the writer', async () => {
    const response = await request(app.getHttpServer()).post('/contact').send(MESSAGE);

    expect(response.status).toBe(202);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: 'desk@example.test',
      replyTo: 'jane@example.test',
    });
    expect(sent[0]!.subject).toContain('My booking');
    expect(sent[0]!.text).toContain('Booking: E2E0001');
  });

  it('refuses a message without consent and sends nothing', async () => {
    const response = await request(app.getHttpServer())
      .post('/contact')
      .send({ ...MESSAGE, consent: false });

    expect(response.status).toBe(400);
    expect(sent).toHaveLength(0);
  });

  it("prefers the tenant's support inbox over OPS_NOTIFY_EMAIL", async () => {
    await boot('hola@agency.test');

    const response = await request(app.getHttpServer()).post('/contact').send(MESSAGE);

    expect(response.status).toBe(202);
    expect(sent[0]?.to).toBe('hola@agency.test');
  });

  it('refuses rather than drops a message when no inbox is configured', async () => {
    delete process.env.OPS_NOTIFY_EMAIL;

    const response = await request(app.getHttpServer()).post('/contact').send(MESSAGE);

    expect(response.status).toBe(503);
    expect(sent).toHaveLength(0);
  });
});
