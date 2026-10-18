import { DEFAULT_LOCALE } from '@ota/i18n';
import { BOOKING_OPTIONAL_CONSENTS, BOOKING_REQUIRED_CONSENTS } from '@ota/schemas';
import { legalContentSchema } from '@ota/schemas';
import { packageProvinces } from '@ota/domain';
import { cn } from '@ota/ui';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';

import { AdvisoryNotice } from '@/components/advisory-notice';
import { Breadcrumb } from '@/components/breadcrumb';
import { BookingFlow, type BookingLegal } from '@/components/booking/booking-flow';
import { advisoriesForProvinces, getActiveAdvisories } from '@/lib/advisories';
import { getServerSession } from '@/lib/api';
import { getPageContent } from '@/lib/content';
import { countryOptions } from '@/lib/countries';
import { formatDay, formatMoney, plainSpaces } from '@/lib/format';
import { getPackage } from '@/lib/packages';
import { getTenantConfig } from '@/lib/tenant';

const wrap = 'mx-auto w-full max-w-container px-6 md:px-8 lg:px-10';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const [pkg, t] = await Promise.all([
    getPackage((await params).slug),
    getTranslations('booking'),
  ]);
  return { title: pkg ? t('metaTitle', { name: pkg.name }) : undefined };
}

/**
 * The Booking board's five steps for a curated package (M2 party, M3
 * certification and consents). Booking is sign-in first: a visitor without a
 * session signs in by magic link and comes back here. The form prices the
 * choices as the traveler goes; the API prices them again, re-checks the
 * departure and freezes the lines.
 */
export default async function BookPackagePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [session, locale] = await Promise.all([getServerSession(), getLocale()]);
  const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`;
  if (!session) {
    redirect(
      `${prefix}/login?next=${encodeURIComponent(`${prefix}/packages/${slug}/book`)}`,
    );
  }

  const [pkg, legal, t, nav] = await Promise.all([
    getPackage(slug),
    getPageContent('legal', legalContentSchema),
    getTranslations('packages'),
    getTranslations('nav'),
  ]);
  if (!pkg) {
    notFound();
  }
  if (pkg.slug !== slug) {
    redirect(`${prefix}/packages/${pkg.slug}/book`);
  }

  const tenant = getTenantConfig();
  const advisories = advisoriesForProvinces(
    await getActiveAdvisories(locale),
    packageProvinces(pkg),
  );
  const now = new Date();
  const earliest = new Date(now);
  earliest.setUTCDate(earliest.getUTCDate() + pkg.leadTimeDays);
  // Departures inside the package's lead time are not offered; the API
  // re-checks that the chosen one is open and has the places.
  const departures = pkg.departures
    .filter(
      (departure) =>
        departure.status === 'OPEN' && new Date(departure.startDate) >= earliest,
    )
    .map((departure) => ({
      id: departure.id,
      startDate: departure.startDate,
      capacity: departure.capacity,
      price: departure.price,
      label: plainSpaces(formatDay(departure.startDate, locale)),
      priceLabel: plainSpaces(
        formatMoney(departure.price ?? pkg.basePrice, pkg.currency, locale),
      ),
    }));

  const purposes = [...BOOKING_REQUIRED_CONSENTS, ...BOOKING_OPTIONAL_CONSENTS];
  const bookingLegal: BookingLegal = {
    statement: legal?.ofacStatement ?? null,
    consents: Object.fromEntries(
      purposes.flatMap((purpose) => {
        const text = legal?.consents[purpose];
        return text ? [[purpose, text]] : [];
      }),
    ),
  };

  const nights = pkg.durationDays - 1;
  const length =
    nights > 0
      ? `${t('days', { count: pkg.durationDays })} · ${t('nights', { count: nights })}`
      : t('days', { count: pkg.durationDays });

  return (
    <div className={cn(wrap, 'flex flex-col gap-6 pb-20 pt-6')}>
      <Breadcrumb
        label={t('breadcrumb')}
        items={[
          { label: nav('home'), href: '/' },
          { label: nav('packages'), href: '/packages' },
          { label: pkg.name, href: `/packages/${pkg.slug}` },
        ]}
      />
      <BookingFlow
        pkg={pkg}
        length={length}
        departures={departures}
        pricing={tenant.pricing}
        legal={bookingLegal}
        countries={countryOptions(locale)}
        email={session.user.email}
        leadName={session.user.name ?? ''}
        today={now.toISOString().slice(0, 10)}
        notices={
          advisories.length > 0
            ? advisories.map((advisory) => (
                <AdvisoryNotice key={advisory.id} advisory={advisory} link />
              ))
            : null
        }
      />
    </div>
  );
}
