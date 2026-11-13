import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { TenantConfig } from '@ota/config';
import { contactMessageEmail, type Mailer } from '@ota/email';
import type { ContactMessageRequest, ContactTopic } from '@ota/schemas';

import { MAILER } from '../email/email.module';
import { TENANT_CONFIG } from '../tenant/tenant.tokens';

/** The desk reads the topic in English, whatever language the form was in. */
const TOPIC_LABELS: Record<ContactTopic, string> = {
  planning: 'A trip I am planning',
  booking: 'My booking',
  payment: 'Payment or invoice',
  entry: 'Visa, entry, US travelers',
  accessibility: 'Accessibility',
  partners: 'Press, partners, join the network',
  complaint: 'Complaint',
  other: 'Something else',
};

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(TENANT_CONFIG) private readonly tenant: TenantConfig,
  ) {}

  /**
   * Forward a Support-form message to the agency inbox: the tenant's support
   * email, else OPS_NOTIFY_EMAIL. Without either the form cannot be answered,
   * so it is refused rather than silently dropped.
   */
  async send(message: ContactMessageRequest): Promise<void> {
    const to = this.tenant.branding.supportEmail ?? process.env.OPS_NOTIFY_EMAIL;
    if (!to) {
      throw new ServiceUnavailableException('The contact form is not configured');
    }

    await this.mailer.send(
      contactMessageEmail({
        to,
        name: message.name,
        email: message.email,
        topic: TOPIC_LABELS[message.topic],
        bookingCode: message.bookingCode,
        replyLocale: message.replyLocale,
        message: message.message,
        branding: this.tenant.branding,
      }),
    );
    this.logger.log(`Support-form message forwarded (topic ${message.topic})`);
  }
}
