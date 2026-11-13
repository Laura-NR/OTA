import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { contactMessageSchema, type ContactMessageRequest } from '@ota/schemas';

import { Public } from '../auth/public.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { ContactService } from './contact.service';

/**
 * The public Support form. It only ever mails the agency's own inbox, never the
 * address someone typed, and it shares the strict rate limit of the sign-in
 * routes (`common/rate-limit.ts`).
 */
@Controller('contact')
export class ContactController {
  constructor(private readonly contact: ContactService) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  async send(
    @Body(new ZodValidationPipe(contactMessageSchema)) body: ContactMessageRequest,
  ): Promise<{ accepted: true }> {
    await this.contact.send(body);
    return { accepted: true };
  }
}
