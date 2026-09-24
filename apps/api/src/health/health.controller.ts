import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';

import { Public } from '../auth/public.decorator';
import { ReadinessService, type ReadinessResponse } from './readiness.service';

export interface HealthResponse {
  status: 'ok';
}

@Controller('health')
export class HealthController {
  constructor(private readonly readiness: ReadinessService) {}

  /** Liveness: the process is up. Never depends on downstream services. */
  @Get()
  @Public()
  check(): HealthResponse {
    return { status: 'ok' };
  }

  /** Readiness: the process can serve traffic (Postgres, and Redis if used). */
  @Get('ready')
  @Public()
  async ready(@Res({ passthrough: true }) res: Response): Promise<ReadinessResponse> {
    const result = await this.readiness.check();
    res.status(result.status === 'ok' ? 200 : 503);
    return result;
  }
}
