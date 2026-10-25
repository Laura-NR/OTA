import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import {
  telemetryBatchSchema,
  type TelemetryBatchRequest,
  type TelemetryReceiptDto,
} from '@ota/schemas';
import type { IncomingHttpHeaders } from 'node:http';

import { sessionRefusal } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { Public } from '../auth/public.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { TelemetryService } from './telemetry.service';

/**
 * T-Events intake for the storefront and desk shells. Public, because
 * signed-out visitors browse too; the global rate limit covers it. A session
 * is read only to hash the user id onto analytics events, or for a desk event
 * to take the operator's role from it; a desk event without a live staff
 * session is refused, never the batch.
 */
@Controller('telemetry')
export class TelemetryController {
  constructor(
    private readonly telemetry: TelemetryService,
    private readonly auth: AuthService,
  ) {}

  @Post('events')
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  async record(
    @Body(new ZodValidationPipe(telemetryBatchSchema)) body: TelemetryBatchRequest,
    @Req() request: { headers: IncomingHttpHeaders },
  ): Promise<TelemetryReceiptDto> {
    const wantsIdentity = body.events.some(
      (event) =>
        event.context.consent !== undefined && event.context.consent !== 'essential',
    );
    const fromDesk = body.events.some((event) => event.context.app === 'admin');
    const session =
      wantsIdentity || fromDesk ? await this.auth.getSession(request.headers) : null;
    const role = session && !sessionRefusal(session) ? (session.user.role ?? null) : null;
    return this.telemetry.ingest(body, session?.user.id ?? null, role);
  }
}
