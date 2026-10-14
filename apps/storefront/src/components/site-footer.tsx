import type { TenantConfig } from '@ota/config';
import { isFeatureEnabled } from '@ota/config';
import { getTranslations } from 'next-intl/server';
import Image from 'next/image';

import { Link } from '@/i18n/navigation';
import { brand } from '@/lib/brand';

interface FooterLink {
  key: string;
  label: string;
  href: string;
  external?: boolean;
}

const link =
  'text-body-sm text-neutral-200 underline-offset-[3px] hover:text-neutral-0 hover:underline focus-visible:outline-accent-500';

/**
 * The Home footer on primary 700. Columns list only pages that exist; the
 * design's Destinations and Travel info columns, About, FAQ, Contact and the
 * legal links join as those pages are built. Contact lines (WhatsApp, email)
 * come from the tenant manifest and are left out when it has none. Payment
 * marks show only the rails the tenant offers live: the wire transfer (SEPA);
 * the card marks wait for the card gateway.
 */
export async function SiteFooter({ tenant }: { tenant: TenantConfig }) {
  const t = await getTranslations('footer');
  const nav = await getTranslations('nav');
  const { whatsappNumber, supportEmail } = tenant.branding;

  const columns: { key: string; title: string; links: FooterLink[] }[] = [
    {
      key: 'packages',
      title: nav('packages'),
      links: isFeatureEnabled(tenant, 'customItineraryBuilder')
        ? [{ key: 'custom', label: t('customItinerary'), href: '/build' }]
        : [],
    },
    {
      key: 'support',
      title: nav('support'),
      links: [
        ...(whatsappNumber
          ? [
              {
                key: 'whatsapp',
                label: t('whatsapp', { number: whatsappNumber }),
                href: `https://wa.me/${whatsappNumber.replace(/\D/g, '')}`,
                external: true,
              },
            ]
          : []),
        ...(supportEmail
          ? [
              {
                key: 'email',
                label: supportEmail,
                href: `mailto:${supportEmail}`,
                external: true,
              },
            ]
          : []),
        ...(isFeatureEnabled(tenant, 'recruitmentPortal')
          ? [{ key: 'join', label: t('joinNetwork'), href: '/join-our-network' }]
          : []),
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
            <p className="text-body-sm text-primary-200">
              {t('license', { license: tenant.branding.licenseNumber })}
            </p>
          </div>
          {columns
            .filter((column) => column.links.length > 0)
            .map((column) => (
              <div key={column.key} className="flex flex-col gap-2">
                <p className="text-overline uppercase text-accent-500">{column.title}</p>
                {column.links.map((item) =>
                  item.external ? (
                    <a key={item.key} href={item.href} className={link}>
                      {item.label}
                    </a>
                  ) : (
                    <Link key={item.key} href={item.href} className={link}>
                      {item.label}
                    </Link>
                  ),
                )}
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
        <p className="text-label font-normal text-primary-200">
          {t('copyright', {
            year: new Date().getFullYear(),
            name: tenant.branding.agencyName,
          })}
        </p>
      </div>
    </footer>
  );
}
