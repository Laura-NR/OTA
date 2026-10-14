import { blogContentSchema } from '@ota/schemas';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { PhotoSlot } from '@/components/content/content-blocks';
import { ContentSection } from '@/components/content/content-section';
import { OnThisPage, PageIntro } from '@/components/content/page-intro';
import { Link } from '@/i18n/navigation';
import { getPageContent } from '@/lib/content';
import { getTenantConfig } from '@/lib/tenant';

async function findArticle(slug: string) {
  const blog = await getPageContent('blog', blogContentSchema);
  const article = blog?.articles.find((candidate) => candidate.slug === slug);
  return blog && article ? { blog, article } : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const found = await findArticle((await params).slug);
  return found
    ? { title: found.article.title, description: found.article.standfirst }
    : {};
}

/** A guide (BlogPost board): byline and dates, "On this page", the sections, then the way back. */
export default async function BlogArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const found = await findArticle((await params).slug);
  if (!found) {
    notFound();
  }
  const { blog, article } = found;
  const t = await getTranslations('pages.blog');
  const common = await getTranslations('pages.common');

  return (
    <article className="mx-auto flex max-w-container flex-col gap-10 px-6 py-12 md:px-8 lg:px-10">
      <PageIntro
        status={blog.status}
        eyebrow={`${article.category} · ${t('readingTime', { minutes: article.readingMinutes })}`}
        title={article.title}
        lede={article.standfirst}
        note={[
          [article.author, article.authorRole].filter(Boolean).join(', '),
          t('published', { date: article.published }),
          article.updated ? t('updated', { date: article.updated }) : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        agencyName={getTenantConfig().branding.agencyName}
      />
      {article.photo ? (
        <PhotoSlot
          alt={article.photo.alt}
          caption={article.photo.caption}
          label={common('photoToCome')}
          className="max-w-4xl"
        />
      ) : null}
      <div className="flex flex-col gap-10 lg:grid lg:grid-cols-[1fr_15rem] lg:items-start">
        <aside className="lg:sticky lg:top-24 lg:order-2">
          <OnThisPage sections={article.sections} />
        </aside>
        <div className="flex min-w-0 flex-col gap-14">
          {article.sections.map((section) => (
            <ContentSection key={section.id} section={section} />
          ))}
          <Link
            href="/blog"
            className="self-start text-body text-primary-600 underline underline-offset-[3px]"
          >
            {t('allGuides')}
          </Link>
        </div>
      </div>
    </article>
  );
}
