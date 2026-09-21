import type { Message } from '@ota/db';
import type { TenantConfig } from '@ota/config';
import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';

import type { AuthUser } from '../src/common/auth/auth-user';
import type { Mailer } from '@ota/email';
import type { MessagePublisher } from '../src/messages/message.publisher';
import { MessagesService } from '../src/messages/messages.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const RESERVATION_ID = 'res-1';
const OWNER_ID = 'user-traveler';

const OPERATOR: AuthUser = {
  id: 'user-ops',
  email: 'ops@example.test',
  role: 'OPERATIONS_ADMIN',
};
const OWNER: AuthUser = {
  id: OWNER_ID,
  email: 'jane@example.test',
  role: 'TRAVELER',
};
const STRANGER: AuthUser = {
  id: 'user-other',
  email: 'other@example.test',
  role: 'TRAVELER',
};

const tenantConfig: TenantConfig = {
  tenantId: 'cuba-eco-travel',
  branding: {
    agencyName: 'Authentic Cuba Expeditions',
    licenseNumber: 'MINTUR-TEST-1234',
    primaryColor: '#0f766e',
    supportEmail: null,
    supportPhone: null,
  },
  primaryLocale: 'es',
  supportedLocales: ['es', 'en', 'fr'],
  theme: { palette: 'ecoGreen', borderRadius: 'md' },
  features: {
    interactiveSvgMap: true,
    culturalEventsBanner: true,
    recruitmentPortal: true,
    customItineraryBuilder: true,
    instantBooking: false,
    directBankTransferRail: true,
    creditCardGatewayRail: true,
  },
  destinations: { geographyType: 'cuba_provinces' },
};

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: `msg-${Math.random().toString(16).slice(2)}`,
    reservationId: RESERVATION_ID,
    sender: 'OPERATIONS',
    body: 'Hello',
    readAt: null,
    createdAt: new Date('2026-09-20T10:00:00Z'),
    ...overrides,
  };
}

describe('MessagesService', () => {
  let messages: Message[];
  let published: string[];
  const sent: { to: string }[] = [];
  let publisher: MessagePublisher;
  let mailer: Mailer;

  const fakePrisma = () =>
    ({
      reservation: {
        findUnique: async () => ({
          id: RESERVATION_ID,
          bookingCode: 'ABC12345',
          userId: OWNER_ID,
          user: { email: 'jane@example.test' },
        }),
      },
      message: {
        findMany: async () => messages,
        create: async (args: { data: Partial<Message> }) => {
          const message = makeMessage(args.data);
          messages.push(message);
          return message;
        },
      },
    }) as unknown as PrismaService;

  beforeEach(() => {
    messages = [];
    published = [];
    sent.length = 0;
    publisher = { publish: (event) => published.push(event.message.sender) };
    mailer = {
      send: async (message) => {
        sent.push({ to: message.to });
      },
    };
  });

  it('an operations admin sends a message, broadcasts it, and emails the traveler', async () => {
    const service = new MessagesService(fakePrisma(), publisher, mailer, tenantConfig);

    const dto = await service.send(RESERVATION_ID, 'Your guide is confirmed', OPERATOR);

    expect(dto.sender).toBe('OPERATIONS');
    expect(published).toEqual(['OPERATIONS']);
    expect(sent).toEqual([{ to: 'jane@example.test' }]);
  });

  it('a traveler owner sends a message without notifying operations by default', async () => {
    delete process.env.OPS_NOTIFY_EMAIL;
    const service = new MessagesService(fakePrisma(), publisher, mailer, tenantConfig);

    const dto = await service.send(RESERVATION_ID, 'Thanks!', OWNER);

    expect(dto.sender).toBe('TRAVELER');
    expect(sent).toHaveLength(0);
  });

  it('rejects a traveler who does not own the reservation', async () => {
    const service = new MessagesService(fakePrisma(), publisher, mailer, tenantConfig);

    await expect(service.send(RESERVATION_ID, 'hi', STRANGER)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('lists messages in order', async () => {
    messages = [makeMessage({ body: 'first' }), makeMessage({ body: 'second' })];
    const service = new MessagesService(fakePrisma(), publisher, mailer, tenantConfig);

    const list = await service.list(RESERVATION_ID, OPERATOR);

    expect(list.map((message) => message.body)).toEqual(['first', 'second']);
  });
});
