'use client';

import { buttonClassName, cn, Icon } from '@ota/ui';
import { useTranslations } from 'next-intl';

import { PricesSetInEur } from '@/components/currency/price';
import { BookingModelPill } from '@/components/package-card';
import { Link } from '@/i18n/navigation';

export interface PackageBookingFormProps {
  slug: string;
  signedIn: boolean;
  /** The package price, formatted for the visitor's locale and display currency. */
  price: string;
  instant: boolean;
  /** The agency's phone line from the manifest, for "Call to book". */
  supportPhone: string | null;
}

/**
 * The Package board's sticky summary: the price and booking model, then the
 * way into the Booking form (`/packages/<slug>/book`, five steps). Booking is
 * sign-in first, so a signed-out visitor signs in by magic link and lands on
 * the form.
 */
export function PackageBookingForm({
  slug,
  signedIn,
  price,
  instant,
  supportPhone,
}: PackageBookingFormProps) {
  const t = useTranslations('packages');
  const bookPath = `/packages/${slug}/book`;

  return (
    <aside
      aria-label={t('detail.bookLabel')}
      className="flex flex-col gap-4 rounded-lg border bg-surface p-6 shadow-md lg:sticky lg:top-24"
    >
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-caption text-muted">{t('fromLabel')}</p>
          <p className="text-h1-compact font-body font-bold text-default">{price}</p>
          <PricesSetInEur />
        </div>
        <BookingModelPill instant={instant} />
      </div>

      {!signedIn ? (
        <div className="flex flex-col gap-3">
          <p className="text-body-sm text-secondary">{t('signInPrompt')}</p>
          <Link
            href={`/login?next=${encodeURIComponent(bookPath)}`}
            className={buttonClassName({ size: 'lg' })}
            data-analytics-event="cta_click"
            data-analytics-cta="sign_in_to_book"
            data-analytics-context-id={slug}
          >
            {t('signIn')}
          </Link>
        </div>
      ) : (
        <Link
          href={bookPath}
          className={buttonClassName({ size: 'lg' })}
          data-analytics-event="cta_click"
          data-analytics-cta="book"
          data-analytics-context-id={slug}
        >
          {t('book')}
        </Link>
      )}

      <p className="flex items-center justify-center gap-1.5 text-caption text-muted">
        <Icon name="lock" className="h-3.5 w-3.5" />
        {t('detail.nothingCharged')}
      </p>
      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Link
          href="/support#contact"
          className={cn(buttonClassName({ variant: 'secondary' }), 'flex-1')}
          data-analytics-event="specialist_contacted"
          data-analytics-channel="form"
          data-analytics-context-id={slug}
        >
          <Icon name="message-circle" />
          {t('detail.ask')}
        </Link>
        {supportPhone ? (
          <a
            href={`tel:${supportPhone.replace(/[^\d+]/g, '')}`}
            className={cn(buttonClassName({ variant: 'tertiary' }), 'flex-1')}
            data-analytics-event="specialist_contacted"
            data-analytics-channel="phone"
            data-analytics-context-id={slug}
          >
            {t('detail.call')}
          </a>
        ) : null}
      </div>
    </aside>
  );
}
