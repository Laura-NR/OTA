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
import { UserRole } from '@ota/domain';
import {
  deskWorkerMessageSchema,
  sendWorkerMessageSchema,
  type BookingWorkerThreadDto,
  type DeskWorkerMessageRequest,
  type DeskWorkerThreadDto,
  type SendWorkerMessageRequest,
  type WorkerMessageDto,
  type WorkerMessagesReadDto,
  type WorkerThreadDto,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { WorkerMessagesService } from './worker-messages.service';

const READ_ROLES = [
  UserRole.OperationsAdmin,
  UserRole.AdministrativeSupport,
  UserRole.SuperAdmin,
] as const;

const WRITE_ROLES = [UserRole.OperationsAdmin, UserRole.SuperAdmin] as const;

/** The worker app's side: the worker's own thread with the desk (M2–M5). */
@Controller('worker/messages')
export class WorkerMessagesController {
  constructor(private readonly messages: WorkerMessagesService) {}

  @Get()
  @Roles(UserRole.ServiceWorker)
  thread(@CurrentUser() actor: AuthUser): Promise<WorkerThreadDto> {
    return this.messages.workerThread(actor);
  }

  /** A message from the phone's queue; a resend returns the first. */
  @Post()
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ServiceWorker)
  send(
    @Body(new ZodValidationPipe(sendWorkerMessageSchema)) body: SendWorkerMessageRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<WorkerMessageDto> {
    return this.messages.workerSend(actor, body);
  }

  @Post('read')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ServiceWorker)
  markRead(@CurrentUser() actor: AuthUser): Promise<WorkerMessagesReadDto> {
    return this.messages.workerMarkRead(actor);
  }
}

/**
 * The desk's side of a worker's thread (the supplier page, the booking, Ops
 * Lite). Not tied to a capability, as the travelers' threads are not; the
 * support role reads, operations and Super Admin write (M6).
 */
@Controller('suppliers/:id/messages')
export class SupplierMessagesController {
  constructor(private readonly messages: WorkerMessagesService) {}

  @Get()
  @Roles(...READ_ROLES)
  thread(@Param('id', ParseUUIDPipe) id: string): Promise<DeskWorkerThreadDto> {
    return this.messages.deskThread(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(...WRITE_ROLES)
  send(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(deskWorkerMessageSchema)) body: DeskWorkerMessageRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<WorkerMessageDto> {
    return this.messages.deskSend(actor, id, body);
  }

  @Post('read')
  @HttpCode(HttpStatus.OK)
  @Roles(...READ_ROLES)
  markRead(@Param('id', ParseUUIDPipe) id: string): Promise<WorkerMessagesReadDto> {
    return this.messages.deskMarkRead(id);
  }
}

/** A-Booking's "Worker threads": the booking's workers and their latest message about it. */
@Controller('reservations/:id/worker-threads')
export class BookingWorkerThreadsController {
  constructor(private readonly messages: WorkerMessagesService) {}

  @Get()
  @Roles(...READ_ROLES)
  list(@Param('id', ParseUUIDPipe) id: string): Promise<BookingWorkerThreadDto[]> {
    return this.messages.bookingThreads(id);
  }
}
