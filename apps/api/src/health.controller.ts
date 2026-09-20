import { Controller, Get } from '@nestjs/common';

import { Public } from './auth/public.decorator';

export interface HealthResponse {
  status: 'ok';
}

@Controller('health')
export class HealthController {
  @Get()
  @Public()
  check(): HealthResponse {
    return { status: 'ok' };
  }
}
