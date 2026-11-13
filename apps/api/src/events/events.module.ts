import { Module } from '@nestjs/common';

import { DocumentsModule } from '../documents/documents.module';
import { EventRequestsController } from './event-requests.controller';
import { EventRequestsService } from './event-requests.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { MeEventRequestsController } from './me-event-requests.controller';
import { PublicEventsController } from './public-events.controller';

/** M10 events and the ticket concierge: the desk, the storefront and travelers' requests. */
@Module({
  imports: [DocumentsModule],
  controllers: [
    EventsController,
    PublicEventsController,
    EventRequestsController,
    MeEventRequestsController,
  ],
  providers: [EventsService, EventRequestsService],
  exports: [EventsService, EventRequestsService],
})
export class EventsModule {}
