import { blogContentSchema } from '@ota/schemas';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { PhotoSlot } from '@/components/content/content-blocks';
import { PageIntro } from '@/components/content/page-intro';
import { Link } from '@/i18n/navigation';
import { getPageContent } from '@/lib/content';
import { getTenantConfig } from '@/lib/tenant';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('blog') };
}

/**
 * Blog & guides (Blog board). Lists only the articles the tenant has written;
 * the board's other cards have no article behind them yet.
 */
export default async function BlogPage() {
  const content = await getPageContent('blog', blogContentSchema);
  if (!content) {
    notFound();
  }
  const t = await getTranslations('pages.blog');
  const common = await getTranslations('pages.common');

  return (
    <div className="mx-auto flex max-w-container flex-col gap-10 px-6 py-12 md:px-8 lg:px-10">
      <PageIntro
        status={content.status}
        eyebrow={content.eyebrow}
        title={content.title}
        lede={content.lede}
        agencyName={getTenantConfig().branding.agencyName}
      />
      <p className="text-body-sm text-muted">
        {t('count', { count: content.articles.length })}
      </p>
      <ul className="grid gap-8 md:grid-cols-2">
        {content.articles.map((article) => (
          <li key={article.slug}>
            <article className="flex flex-col gap-3">
              {article.photo ? (
                <PhotoSlot
                  alt={article.photo.alt}
                  label={common('photoToCome')}
                  className="max-w-none"
                />
              ) : null}
              <p className="text-overline uppercase text-secondary-600">
                {article.category} ·{' '}
                {t('readingTime', { minutes: article.readingMinutes })}
              </p>
              <h2 className="font-display text-h2-compact text-default">
                <Link
                  href={`/blog/${article.slug}`}
                  className="underline-offset-4 hover:text-primary-700 hover:underline"
                >
                  {article.title}
                </Link>
              </h2>
              <p className="text-body text-secondary">{article.standfirst}</p>
              <p className="text-caption text-muted">
                {article.author}
                {article.updated ? ` · ${t('updated', { date: article.updated })}` : ''}
              </p>
            </article>
          </li>
        ))}
      </ul>
    </div>
  );
}
