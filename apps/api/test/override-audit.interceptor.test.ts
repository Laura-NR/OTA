import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';

import type { AuthUser } from '../src/common/auth/auth-user';
import { OverrideAuditInterceptor } from '../src/overrides/override-audit.interceptor';
import type { PrismaService } from '../src/prisma/prisma.service';

function run(request: Record<string, unknown>) {
  const audits: Record<string, unknown>[] = [];
  const prisma = {
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        audits.push(data);
        return data;
      },
    },
  } as unknown as PrismaService;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  const next: CallHandler = { handle: () => of({ ok: true }) };
  const result = firstValueFrom(
    new OverrideAuditInterceptor(prisma).intercept(context, next),
  );
  return { audits, result };
}

const SUPPORT: AuthUser = {
  id: 'u-ernesto',
  email: 'ernesto@vereda.travel',
  role: 'ADMINISTRATIVE_SUPPORT',
};

describe('the override audit row (docs/schema-m9-permission-overrides.md O7)', () => {
  it('records a change made through an override with its route and record', async () => {
    const { audits, result } = run({
      method: 'POST',
      route: { path: '/reservations/:reservationId/payments' },
      params: { reservationId: 'r-1' },
      user: { ...SUPPORT, override: { id: 'o-1', capability: 'payments' } },
    });
    expect(await result).toEqual({ ok: true });
    expect(audits).toEqual([
      {
        actorUserId: SUPPORT.id,
        action: 'permission.override_used',
        entityType: 'PermissionOverride',
        entityId: 'o-1',
        metadata: {
          capability: 'payments',
          method: 'POST',
          route: '/reservations/:reservationId/payments',
          params: { reservationId: 'r-1' },
        },
      },
    ]);
  });

  it('records nothing for a read, or for a request the role itself allowed', async () => {
    const read = run({
      method: 'GET',
      user: { ...SUPPORT, override: { id: 'o-1', capability: 'payments' } },
    });
    await read.result;
    expect(read.audits).toEqual([]);

    const own = run({ method: 'POST', user: SUPPORT });
    await own.result;
    expect(own.audits).toEqual([]);
  });
});
