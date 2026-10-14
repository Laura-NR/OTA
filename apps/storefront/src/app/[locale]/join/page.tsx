import { joinContentSchema } from '@ota/schemas';
import { AccordionItem, Alert, buttonClassName, cn, Icon } from '@ota/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { ApplicationForm } from '@/components/application-form';
import { getPageContent } from '@/lib/content';
import { CUBA_PROVINCES } from '@/lib/cuba-provinces';
import { getGeography, provinceName } from '@/lib/geography';
import { getTenantConfig } from '@/lib/tenant';

const wrap = 'mx-auto w-full max-w-container px-6 md:px-8 lg:px-10';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('join');
  return { title: t('title') };
}

/**
 * Join (Join / M-Join boards, written in Spanish for Cuban guides, drivers and
 * hosts): the agency's offer on primary 700 with its figures, how joining
 * works, and the four-step application beside what the agency asks and gives.
 * The board's sample testimonial is left out.
 */
export default async function JoinPage() {
  const tenant = getTenantConfig();
  const [content, t, common] = await Promise.all([
    getPageContent('join', joinContentSchema),
    getTranslations('join'),
    getTranslations('pages.common'),
  ]);
  if (!content) {
    notFound();
  }
  // Provinces west to east as the agency lists them, else in the map's order.
  const geography = getGeography();
  const provinces = geography
    ? geography.provinces.map((province) => provinceName(province.code))
    : CUBA_PROVINCES.map((province) => province.name);

  return (
    <div className="flex flex-col">
      {content.status === 'placeholder' ? (
        <div className={cn(wrap, 'pt-6')}>
          <Alert variant="info" title={common('placeholderTitle')}>
            {common('placeholderText', { agency: tenant.branding.agencyName })}
          </Alert>
        </div>
      ) : null}

      <section className="mt-6 bg-primary-700 text-neutral-0">
        <div className={cn(wrap, 'grid items-center gap-10 py-14 lg:grid-cols-2')}>
          <div className="flex flex-col gap-6">
            {content.eyebrow ? (
              <p className="text-overline uppercase text-accent-500">{content.eyebrow}</p>
            ) : null}
            <h1 className="text-h1 text-neutral-0 md:text-display-1">{content.title}</h1>
            <p className="max-w-[60ch] text-body-lg text-primary-200">{content.lede}</p>
            <div className="flex flex-wrap items-center gap-4">
              <a
                href="#apply"
                className={cn(
                  buttonClassName({ size: 'lg' }),
                  'bg-accent-500 text-neutral-900 hover:bg-accent-600 focus-visible:outline-accent-500',
                )}
              >
                {content.cta}
              </a>
              <a
                href="#how"
                className="font-semibold text-neutral-0 underline-offset-[3px] hover:underline focus-visible:outline-accent-500"
              >
                {content.steps.eyebrow ?? content.steps.title}
              </a>
            </div>
            {content.promises.length > 0 ? (
              <ul className="flex flex-col gap-2 text-body-sm text-primary-200">
                {content.promises.map((promise) => (
                  <li key={promise} className="flex gap-2">
                    <Icon
                      name="check"
                      className="mt-0.5 h-4 w-4 shrink-0 text-accent-500"
                    />
                    {promise}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {content.stats.length > 0 ? (
            <dl className="grid gap-3 sm:grid-cols-2">
              {content.stats.map((stat) => (
                <div
                  key={stat.value}
                  className="flex flex-col-reverse gap-1 rounded-lg bg-neutral-0/10 p-5"
                >
                  <dd className="text-body-sm text-primary-200">{stat.text}</dd>
                  <dt className="font-mono text-h1-compact text-neutral-0">
                    {stat.value}
                  </dt>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </section>

      <section
        id="how"
        aria-labelledby="how-title"
        className={cn(wrap, 'flex scroll-mt-24 flex-col gap-6 py-14')}
      >
        <div className="flex flex-col gap-1.5">
          {content.steps.eyebrow ? (
            <p className="text-overline uppercase text-primary-600">
              {content.steps.eyebrow}
            </p>
          ) : null}
          <h2
            id="how-title"
            className="font-display text-h1-compact text-default md:text-h2"
          >
            {content.steps.title}
          </h2>
        </div>
        <ol className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {content.steps.items.map((item, index) => (
            <li
              key={item.title}
              className="flex flex-col gap-2 rounded-lg border bg-surface p-5"
            >
              <span aria-hidden="true" className="font-mono text-body text-primary-600">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="text-h4 text-default">{item.title}</h3>
              <p className="text-body-sm text-secondary">{item.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section
        id="apply"
        aria-labelledby="apply-title"
        className={cn(
          wrap,
          'grid scroll-mt-24 items-start gap-6 pb-20 lg:grid-cols-[minmax(0,1fr)_400px]',
        )}
      >
        <div className="flex flex-col gap-5 rounded-lg border bg-surface p-6 md:p-8">
          <div className="flex flex-col gap-1.5">
            <p className="text-overline uppercase text-primary-600">{t('formEyebrow')}</p>
            <h2 id="apply-title" className="font-display text-h1-compact text-default">
              {t('formTitle')}
            </h2>
          </div>
          <ApplicationForm
            provinces={provinces}
            agencyName={tenant.branding.agencyName}
          />
        </div>
        <div className="flex flex-col gap-4">
          {[content.asks, content.gets].map((block) => (
            <section
              key={block.title}
              className="flex flex-col gap-3 rounded-lg border bg-surface p-5"
            >
              <h2 className="text-overline uppercase text-primary-600">{block.title}</h2>
              <ul className="flex list-disc flex-col gap-2 pl-5 text-body-sm text-secondary">
                {block.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
          {content.faq ? (
            <section className="flex flex-col gap-1 rounded-lg border bg-surface p-5">
              <h2 className="text-overline uppercase text-primary-600">
                {content.faq.title}
              </h2>
              {content.faq.items.map((item) => (
                <AccordionItem key={item.id} title={item.question} level={3}>
                  <p className="pb-3 text-body-sm text-secondary">{item.answer}</p>
                </AccordionItem>
              ))}
            </section>
          ) : null}
        </div>
      </section>
    </div>
  );
}
