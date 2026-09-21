import { Module } from '@nestjs/common';

import { MESSAGE_PUBLISHER } from './message.publisher';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { MessagingGateway } from './messaging.gateway';

@Module({
  controllers: [MessagesController],
  providers: [
    MessagesService,
    MessagingGateway,
    { provide: MESSAGE_PUBLISHER, useExisting: MessagingGateway },
  ],
})
export class MessagesModule {}
