import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { HealthController } from '../src/health/health.controller';
import { ReadinessService } from '../src/health/readiness.service';
import type { RedisHealth } from '../src/health/redis-health';
import type { PrismaService } from '../src/prisma/prisma.service';

describe('GET /health', () => {
  let app: INestApplication;
  const readiness = { check: vi.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: ReadinessService, useValue: readiness }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns liveness without touching downstream services', async () => {
    const response = await request(app.getHttpServer()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(readiness.check).not.toHaveBeenCalled();
  });

  it('returns 200 from readiness when the checks pass', async () => {
    readiness.check.mockResolvedValueOnce({
      status: 'ok',
      checks: { database: { status: 'up' }, redis: { status: 'up' } },
    });

    const response = await request(app.getHttpServer()).get('/health/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      checks: { database: { status: 'up' }, redis: { status: 'up' } },
    });
  });

  it('returns 503 from readiness when a check fails', async () => {
    readiness.check.mockResolvedValueOnce({
      status: 'unavailable',
      checks: { database: { status: 'down' }, redis: { status: 'skipped' } },
    });

    const response = await request(app.getHttpServer()).get('/health/ready');

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('unavailable');
  });
});

describe('ReadinessService', () => {
  function build(
    options: {
      database?: () => Promise<unknown>;
      redis?: Partial<RedisHealth>;
    } = {},
  ) {
    const prisma = {
      $queryRaw: options.database ?? (async () => []),
    } as unknown as PrismaService;
    const redis = {
      enabled: true,
      ping: async () => undefined,
      close: async () => undefined,
      ...options.redis,
    } as RedisHealth;
    return { service: new ReadinessService(prisma, redis), redis };
  }

  it('reports both dependencies up', async () => {
    const { service } = build();

    await expect(service.check()).resolves.toEqual({
      status: 'ok',
      checks: { database: { status: 'up' }, redis: { status: 'up' } },
    });
  });

  it('is unavailable when the database is down', async () => {
    const { service } = build({
      database: async () => {
        throw new Error('connection refused');
      },
    });

    const result = await service.check();
    expect(result.status).toBe('unavailable');
    expect(result.checks.database.status).toBe('down');
  });

  it('is unavailable when Redis is configured but down', async () => {
    const { service } = build({
      redis: {
        enabled: true,
        ping: async () => {
          throw new Error('ECONNREFUSED');
        },
      },
    });

    const result = await service.check();
    expect(result.status).toBe('unavailable');
    expect(result.checks.redis.status).toBe('down');
  });

  it('skips Redis when no queue backend is configured', async () => {
    const { service } = build({ redis: { enabled: false } });

    const result = await service.check();
    expect(result.status).toBe('ok');
    expect(result.checks.redis.status).toBe('skipped');
  });

  it('closes the Redis client on shutdown', async () => {
    const close = vi.fn(async () => undefined);
    const { service } = build({ redis: { close } });

    await service.onModuleDestroy();
    expect(close).toHaveBeenCalledOnce();
  });
});
