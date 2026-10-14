import { supportContentSchema } from '@ota/schemas';
import {
  AccordionItem,
  buttonClassName,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@ota/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { ContactForm } from '@/components/contact-form';
import { PageIntro } from '@/components/content/page-intro';
import { Link } from '@/i18n/navigation';
import { getPageContent } from '@/lib/content';
import { getTenantConfig } from '@/lib/tenant';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('support') };
}

/** Support (Support board): emergency first, then the channels, the FAQ and the form. */
export default async function SupportPage() {
  const content = await getPageContent('support', supportContentSchema);
  if (!content) {
    notFound();
  }
  const tenant = getTenantConfig();
  const t = await getTranslations('pages.support');
  const { whatsappNumber, supportEmail, supportPhone } = tenant.branding;

  const channels: { key: string; title: string; text: string; action: ReactNode }[] = [
    ...(whatsappNumber
      ? [
          {
            key: 'whatsapp',
            ...content.channels.whatsapp,
            action: (
              <a
                href={`https://wa.me/${whatsappNumber.replace(/\D/g, '')}`}
                className={buttonClassName({ variant: 'secondary', size: 'sm' })}
              >
                {t('openWhatsapp')}
              </a>
            ),
          },
        ]
      : []),
    ...(supportEmail
      ? [
          {
            key: 'email',
            ...content.channels.email,
            action: (
              <a
                href={`mailto:${supportEmail}`}
                className={buttonClassName({ variant: 'secondary', size: 'sm' })}
              >
                {supportEmail}
              </a>
            ),
          },
        ]
      : []),
    ...(supportPhone
      ? [
          {
            key: 'phone',
            ...content.channels.phone,
            action: (
              <a
                href={`tel:${supportPhone.replace(/[^\d+]/g, '')}`}
                className={buttonClassName({ variant: 'secondary', size: 'sm' })}
              >
                {supportPhone}
              </a>
            ),
          },
        ]
      : []),
    {
      key: 'account',
      ...content.channels.account,
      action: (
        <Link
          href="/account"
          className={buttonClassName({ variant: 'secondary', size: 'sm' })}
        >
          {t('openTrips')}
        </Link>
      ),
    },
  ];

  return (
    <div className="mx-auto flex max-w-container flex-col gap-12 px-6 py-12 md:px-8 lg:px-10">
      <PageIntro
        status={content.status}
        eyebrow={content.eyebrow}
        title={content.title}
        lede={content.lede}
        note={content.note}
        agencyName={tenant.branding.agencyName}
      />

      <section
        id="emergency"
        aria-labelledby="emergency-title"
        className="flex scroll-mt-24 flex-col gap-3 rounded-lg border border-error-200 bg-error-100 p-6 text-error-700"
      >
        <h2 id="emergency-title" className="text-h3">
          {content.emergency.title}
        </h2>
        <p className="max-w-prose text-body">{content.emergency.text}</p>
        {tenant.emergencyContacts.length > 0 ? (
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {tenant.emergencyContacts.map((contact) => (
              <div key={contact.label} className="flex flex-wrap gap-x-2">
                <dt className="font-semibold">{contact.label}</dt>
                <dd>
                  <a
                    href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`}
                    className="underline underline-offset-[3px]"
                  >
                    {contact.phone}
                  </a>
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </section>

      <section aria-labelledby="channels-title" className="flex flex-col gap-4">
        <h2 id="channels-title" className="font-display text-h2-compact md:text-h2">
          {t('channelsTitle')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {channels.map((channel) => (
            <Card key={channel.key} className="flex flex-col">
              <CardHeader>
                <CardTitle className="text-body">{channel.title}</CardTitle>
                <CardDescription>{channel.text}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto">{channel.action}</CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section
        id="faq"
        aria-labelledby="faq-title"
        className="flex scroll-mt-24 flex-col gap-4"
      >
        <p className="text-overline uppercase text-secondary-600">{t('faq')}</p>
        <h2 id="faq-title" className="font-display text-h2-compact md:text-h2">
          {content.faq.title}
        </h2>
        <div className="max-w-3xl">
          {content.faq.items.map((item) => (
            <AccordionItem key={item.id} title={item.question} level={3}>
              <div className="flex flex-col gap-2 pb-4">
                <p className="text-body font-medium text-default">{item.answer}</p>
                {item.details ? (
                  <p className="text-body-sm text-secondary">{item.details}</p>
                ) : null}
                {item.reviewed ? (
                  <p className="text-caption text-muted">
                    {t('faqReviewed', { date: item.reviewed })}
                  </p>
                ) : null}
              </div>
            </AccordionItem>
          ))}
        </div>
      </section>

      <section
        id="contact"
        aria-labelledby="contact-title"
        className="flex scroll-mt-24 flex-col gap-4"
      >
        <h2 id="contact-title" className="font-display text-h2-compact md:text-h2">
          {t('contactTitle')}
        </h2>
        <p className="max-w-prose text-body-lg text-secondary">{t('contactLede')}</p>
        <div className="max-w-prose rounded-lg bg-sunken p-4">
          <p className="text-body font-semibold">{t('notEmergencyTitle')}</p>
          <p className="text-body-sm text-secondary">{t('notEmergencyText')}</p>
        </div>
        <ContactForm agencyName={tenant.branding.agencyName} />
      </section>
    </div>
  );
}
