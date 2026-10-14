import { isFeatureEnabled } from '@ota/config';
import {
  blogContentSchema,
  conditionsContentSchema,
  homeContentSchema,
  type HomeContent,
} from '@ota/schemas';
import { Alert, Button, buttonClassName, cn, Icon, Input, Label } from '@ota/ui';
import { getLocale, getTranslations } from 'next-intl/server';

import { ConditionsCard } from '@/components/conditions-card';
import { PackageCard } from '@/components/package-card';
import { ArrowLink, SectionHead } from '@/components/section-head';
import { getPathname, Link } from '@/i18n/navigation';
import { getPageContent } from '@/lib/content';
import { getPackages } from '@/lib/packages';
import { getTenantConfig } from '@/lib/tenant';

const wrap = 'mx-auto w-full max-w-container px-6 md:px-8 lg:px-10';

/** How many trips and guides Home features. */
const FEATURED = 3;

const STAT_TONES: Record<HomeContent['why']['stats'][number]['tone'], string> = {
  secondary: 'bg-secondary-100 text-secondary-700',
  primary: 'bg-primary-100 text-primary-700',
  accent: 'bg-accent-100 text-accent-700',
  neutral: 'bg-neutral-100 text-neutral-900',
};

/**
 * Home (Home / M-Home boards). The agency's words are tenant content; the
 * featured trips are the live package catalogue and the guides the tenant's
 * blog. Without Home content the page still offers the search and the trips
 * under the agency's name. The board's reviews are sample testimonials and are
 * left out until real, consented reviews can be shown; its destinations follow
 * with the destination data.
 */
export default async function HomePage() {
  const tenant = getTenantConfig();
  const locale = await getLocale();
  const [t, common, blogT, nav, content, conditions, blog, packages] = await Promise.all([
    getTranslations('home'),
    getTranslations('pages.common'),
    getTranslations('pages.blog'),
    getTranslations('nav'),
    getPageContent('home', homeContentSchema),
    getPageContent('conditions', conditionsContentSchema),
    getPageContent('blog', blogContentSchema),
    getPackages(),
  ]);
  const builder = isFeatureEnabled(tenant, 'customItineraryBuilder');
  const instant = isFeatureEnabled(tenant, 'instantBooking');
  const featured = packages.slice(0, FEATURED);
  const guides = blog?.articles.slice(0, FEATURED) ?? [];

  return (
    <div className="flex flex-col">
      {content?.status === 'placeholder' ? (
        <div className={cn(wrap, 'pt-6')}>
          <Alert variant="info" title={common('placeholderTitle')}>
            {common('placeholderText', { agency: tenant.branding.agencyName })}
          </Alert>
        </div>
      ) : null}

      <section
        className={cn(wrap, 'grid items-center gap-12 py-12 md:py-16 xl:grid-cols-2')}
      >
        <div className="flex min-w-0 flex-col gap-6">
          {content?.hero.eyebrow ? (
            <p className="text-overline uppercase text-secondary-600">
              {content.hero.eyebrow}
            </p>
          ) : null}
          <h1 className="text-h1 text-default md:text-display-1">
            {content?.hero.title ?? tenant.branding.agencyName}
          </h1>
          {content ? (
            <p className="max-w-[56ch] text-body-lg text-secondary">
              {content.hero.lede}
            </p>
          ) : null}
          <form
            action={getPathname({ href: '/packages', locale })}
            aria-label={t('searchLabel')}
            className="grid items-end gap-3 rounded-lg border bg-surface p-4 shadow-md sm:grid-cols-[1fr_auto]"
          >
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="home-search">{t('where')}</Label>
              <Input
                id="home-search"
                name="q"
                type="search"
                placeholder={t('wherePlaceholder')}
                className="h-12"
              />
            </div>
            <Button type="submit" size="lg">
              <Icon name="search" />
              {t('find')}
            </Button>
          </form>
          {content && content.hero.promises.length > 0 ? (
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-body-sm text-secondary">
              {content.hero.promises.map((promise) => (
                <li key={promise} className="flex items-center gap-2">
                  <Icon name="check" className="h-4 w-4 text-success-600" />
                  {promise}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {content ? (
          <div
            role="img"
            aria-label={content.hero.photo.alt}
            className="flex aspect-[4/3] min-w-0 items-center md:aspect-video xl:aspect-[5/4] justify-center gap-2 rounded-lg bg-sunken text-body-sm text-muted"
          >
            <Icon name="image" />
            <span aria-hidden="true">{common('photoToCome')}</span>
          </div>
        ) : null}
      </section>

      {content ? (
        <section aria-labelledby="steps-title" className="border-y bg-surface">
          <div className={cn(wrap, 'flex flex-col gap-8 py-14')}>
            <SectionHead
              id="steps-title"
              eyebrow={content.steps.eyebrow}
              title={content.steps.title}
              action={
                content.steps.link ? (
                  <ArrowLink href="/about">{content.steps.link}</ArrowLink>
                ) : null
              }
            />
            <ol className="grid gap-6 md:grid-cols-3">
              {content.steps.items.map((step, index) => (
                <li key={step.title} className="flex gap-4">
                  <span
                    aria-hidden="true"
                    className="w-10 shrink-0 font-display text-h1 text-secondary-600"
                  >
                    {index + 1}
                  </span>
                  <div className="flex flex-col gap-1.5">
                    <h3 className="text-h4 text-default">{step.title}</h3>
                    <p className="text-body-sm text-secondary">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      ) : null}

      <section
        aria-labelledby="featured-title"
        className={cn(wrap, 'flex flex-col gap-7 py-16')}
      >
        <SectionHead
          id="featured-title"
          eyebrow={content?.featured.eyebrow}
          title={content?.featured.title ?? nav('packages')}
          action={
            packages.length > 0 ? (
              <ArrowLink href="/packages">
                {t('allPackages', { count: packages.length })}
              </ArrowLink>
            ) : null
          }
        />
        {featured.length === 0 ? (
          <p className="text-body-sm text-muted">{t('preparing')}</p>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {featured.map((pkg) => (
              <PackageCard key={pkg.id} pkg={pkg} instant={instant} />
            ))}
          </div>
        )}
        {builder ? (
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/custom" className={buttonClassName({ variant: 'tertiary' })}>
              {t('custom')}
            </Link>
          </div>
        ) : null}
      </section>

      {content || conditions ? (
        <section className={cn(wrap, 'grid items-start gap-8 pb-16 xl:grid-cols-2')}>
          {conditions ? <ConditionsCard content={conditions} /> : null}
          {content ? (
            <section aria-labelledby="why-title" className="flex flex-col gap-6">
              <div className="flex flex-col gap-1.5">
                {content.why.eyebrow ? (
                  <p className="text-overline uppercase text-secondary-600">
                    {content.why.eyebrow}
                  </p>
                ) : null}
                <h2 id="why-title" className="font-display text-h1-compact text-default">
                  {content.why.title}
                </h2>
              </div>
              <dl className="grid gap-4 sm:grid-cols-2">
                {content.why.stats.map((stat) => (
                  <div
                    key={stat.value}
                    className={cn(
                      'flex flex-col-reverse gap-1.5 rounded-lg p-5',
                      STAT_TONES[stat.tone],
                    )}
                  >
                    <dd className="text-body-sm text-secondary">{stat.text}</dd>
                    <dt className="font-display text-h1">{stat.value}</dt>
                  </div>
                ))}
              </dl>
              <ul className="flex flex-col gap-2.5">
                {content.why.points.map((point) => (
                  <li key={point} className="flex gap-2 text-body text-secondary">
                    <Icon name="check" className="mt-1 h-4 w-4 text-success-600" />
                    {point}
                  </li>
                ))}
              </ul>
              {content.why.link ? (
                <ArrowLink href="/about" className="self-start">
                  {content.why.link}
                </ArrowLink>
              ) : null}
            </section>
          ) : null}
        </section>
      ) : null}

      {content && builder ? (
        <section aria-labelledby="custom-title" className={cn(wrap, 'pb-8')}>
          <div className="grid items-center gap-8 rounded-lg bg-primary-700 p-6 text-neutral-0 md:p-12 lg:grid-cols-2">
            <div className="flex flex-col gap-3">
              {content.custom.eyebrow ? (
                <p className="text-overline uppercase text-accent-500">
                  {content.custom.eyebrow}
                </p>
              ) : null}
              <h2
                id="custom-title"
                className="font-display text-h1-compact text-neutral-0 md:text-h1"
              >
                {content.custom.title}
              </h2>
              <p className="max-w-[56ch] text-body text-primary-200">
                {content.custom.text}
              </p>
            </div>
            <div className="flex flex-col items-start gap-3">
              <Link
                href="/custom"
                className={cn(
                  buttonClassName({ size: 'lg' }),
                  'bg-accent-500 text-neutral-900 hover:bg-accent-600 active:bg-accent-600 focus-visible:outline-accent-500',
                )}
              >
                {content.custom.cta}
              </Link>
              {content.custom.note ? (
                <p className="text-caption text-primary-200">{content.custom.note}</p>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {content && guides.length > 0 ? (
        <section
          aria-labelledby="guides-title"
          className={cn(wrap, 'flex flex-col gap-7 pb-20 pt-8')}
        >
          <SectionHead
            id="guides-title"
            eyebrow={content.guides.eyebrow}
            title={content.guides.title}
            action={<ArrowLink href="/blog">{blogT('allGuides')}</ArrowLink>}
          />
          <ul className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {guides.map((article) => (
              <li key={article.slug}>
                <Link
                  href={`/blog/${article.slug}`}
                  className="flex h-full flex-col overflow-hidden rounded-lg border bg-surface shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <span
                    role="img"
                    aria-label={article.photo?.alt ?? article.title}
                    className="flex aspect-video items-center justify-center gap-2 bg-sunken text-body-sm text-muted"
                  >
                    <Icon name="image" />
                    <span aria-hidden="true">{common('photoToCome')}</span>
                  </span>
                  <span className="flex flex-col gap-2 px-5 pb-5 pt-4">
                    <span className="text-overline uppercase text-muted">
                      {t('guideMeta', {
                        category: article.category,
                        minutes: article.readingMinutes,
                      })}
                    </span>
                    <span className="text-h4 text-default">{article.title}</span>
                    <span className="text-caption text-muted">
                      {blogT('updated', {
                        date: article.updated ?? article.published,
                      })}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
