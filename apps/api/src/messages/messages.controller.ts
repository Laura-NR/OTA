import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  sendMessageSchema,
  type MessageDto,
  type SendMessageRequest,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { MessagesService } from './messages.service';

/**
 * Traveler↔operations messaging. Any authenticated user may call these routes;
 * the service enforces that the caller owns the reservation or holds an
 * operations role.
 */
@Controller('reservations/:id/messages')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get()
  list(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<MessageDto[]> {
    return this.messages.list(id, actor);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  send(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) body: SendMessageRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<MessageDto> {
    return this.messages.send(id, body.body, actor);
  }
}
