import { Module } from '@nestjs/common';

import { EscalationGateway } from './escalation.gateway';
import { ESCALATION_PUBLISHER } from './escalation.publisher';

@Module({
  providers: [
    EscalationGateway,
    { provide: ESCALATION_PUBLISHER, useExisting: EscalationGateway },
  ],
  exports: [ESCALATION_PUBLISHER],
})
export class EscalationModule {}
