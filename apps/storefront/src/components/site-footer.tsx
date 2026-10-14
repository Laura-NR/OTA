import type { TenantConfig } from '@ota/config';
import { isFeatureEnabled } from '@ota/config';
import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import type { ComponentProps } from 'react';

import { Link } from '@/i18n/navigation';
import { brand } from '@/lib/brand';

type Href = ComponentProps<typeof Link>['href'];

type FooterLink =
  | { key: string; label: string; href: Href; external?: false }
  | { key: string; label: string; href: string; external: true };

const link =
  'text-body-sm text-neutral-200 underline-offset-[3px] hover:text-neutral-0 hover:underline focus-visible:outline-accent-500';

function FooterAnchor({ item, className }: { item: FooterLink; className?: string }) {
  return item.external ? (
    <a href={item.href} className={className ?? link}>
      {item.label}
    </a>
  ) : (
    <Link href={item.href} className={className ?? link}>
      {item.label}
    </Link>
  );
}

/**
 * The Home footer on primary 700. Columns list only pages that exist: the
 * design's Destinations column and the legal links other than Privacy join as
 * those pages are built. Contact lines (WhatsApp, email) come from the tenant
 * manifest and are left out when it has none; the tagline is tenant content.
 * Payment marks show only the rails the tenant offers live: the wire transfer
 * (SEPA); the card marks wait for the card gateway.
 */
export async function SiteFooter({ tenant }: { tenant: TenantConfig }) {
  const t = await getTranslations('footer');
  const nav = await getTranslations('nav');
  const content = await getTranslations('content');
  const tagline = content.has('footer.tagline') ? content('footer.tagline') : null;
  const { whatsappNumber, supportEmail } = tenant.branding;

  const columns: { key: string; title: string; links: FooterLink[] }[] = [
    {
      key: 'packages',
      title: nav('packages'),
      links: isFeatureEnabled(tenant, 'customItineraryBuilder')
        ? [{ key: 'custom', label: t('customItinerary'), href: '/custom' }]
        : [],
    },
    {
      key: 'travelInfo',
      title: nav('travelInfo'),
      links: [
        {
          key: 'entry',
          label: t('entry'),
          href: { pathname: '/travel-info', hash: 'entry' },
        },
        {
          key: 'money',
          label: t('money'),
          href: { pathname: '/travel-info', hash: 'money' },
        },
        {
          key: 'health',
          label: t('health'),
          href: { pathname: '/travel-info', hash: 'health' },
        },
        {
          key: 'us',
          label: t('usTravelers'),
          href: { pathname: '/travel-info', hash: 'us-travelers' },
        },
      ],
    },
    {
      key: 'support',
      title: nav('support'),
      links: [
        { key: 'faq', label: t('faq'), href: { pathname: '/support', hash: 'faq' } },
        ...(whatsappNumber
          ? [
              {
                key: 'whatsapp',
                label: t('whatsapp', { number: whatsappNumber }),
                href: `https://wa.me/${whatsappNumber.replace(/\D/g, '')}`,
                external: true as const,
              },
            ]
          : []),
        ...(supportEmail
          ? [
              {
                key: 'email',
                label: supportEmail,
                href: `mailto:${supportEmail}`,
                external: true as const,
              },
            ]
          : []),
        {
          key: 'emergency',
          label: t('emergency'),
          href: { pathname: '/support', hash: 'emergency' },
        },
        {
          key: 'contact',
          label: t('contact'),
          href: { pathname: '/support', hash: 'contact' },
        },
        ...(isFeatureEnabled(tenant, 'recruitmentPortal')
          ? [{ key: 'join', label: t('joinNetwork'), href: '/join' }]
          : []),
        { key: 'about', label: t('about'), href: '/about' },
      ],
    },
  ];

  return (
    <footer className="bg-primary-700 text-neutral-200">
      <div className="mx-auto flex max-w-container flex-col gap-8 px-6 pb-6 pt-12 md:px-8 lg:px-10">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(180px,100%),1fr))] gap-6">
          <div className="flex flex-col gap-3">
            <Image
              src={brand.wordmarkWhite}
              alt={tenant.branding.agencyName}
              className="h-7 w-auto self-start"
              unoptimized
            />
            {tagline ? (
              <p className="max-w-[28ch] text-body-sm text-primary-200">{tagline}</p>
            ) : null}
            <p className="text-body-sm text-primary-200">
              {t('license', { license: tenant.branding.licenseNumber })}
            </p>
          </div>
          {columns
            .filter((column) => column.links.length > 0)
            .map((column) => (
              <div key={column.key} className="flex flex-col gap-2">
                <p className="text-overline uppercase text-accent-500">{column.title}</p>
                {column.links.map((item) => (
                  <FooterAnchor key={item.key} item={item} />
                ))}
              </div>
            ))}
        </div>
        {isFeatureEnabled(tenant, 'directBankTransferRail') ? (
          <ul
            aria-label={t('paymentMethods')}
            className="flex flex-wrap gap-2 border-t border-neutral-0/15 pt-6"
          >
            <li className="inline-flex h-6 items-center rounded-full bg-neutral-0/10 px-2.5 text-label text-neutral-0">
              {t('sepa')}
            </li>
          </ul>
        ) : null}
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-label font-normal text-primary-200">
          <span>
            {t('copyright', {
              year: new Date().getFullYear(),
              name: tenant.branding.agencyName,
            })}
          </span>
          <FooterAnchor
            item={{ key: 'privacy', label: t('privacy'), href: '/legal/privacy' }}
            className="text-label font-normal text-primary-200 underline-offset-[3px] hover:text-neutral-0 hover:underline focus-visible:outline-accent-500"
          />
        </div>
      </div>
    </footer>
  );
}
