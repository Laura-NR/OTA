import type { ContentPage } from '@ota/schemas';
import type { ReactNode } from 'react';

import { ContentSection } from './content-section';
import { OnThisPage, PageIntro } from './page-intro';

/**
 * A long-form tenant content page (Travel info, About, Privacy): the intro, then
 * the sections, with "On this page" beside them from `lg` and above them below.
 * `lead` goes before the sections (live data, such as Travel info's
 * advisories), `children` after them.
 */
export function ContentPageView({
  content,
  agencyName,
  lead,
  children,
}: {
  content: ContentPage;
  agencyName: string;
  lead?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-container flex-col gap-10 px-6 py-12 md:px-8 lg:px-10">
      <PageIntro
        status={content.status}
        eyebrow={content.eyebrow}
        title={content.title}
        lede={content.lede}
        note={content.note}
        agencyName={agencyName}
      />
      <div className="flex flex-col gap-10 lg:grid lg:grid-cols-[1fr_15rem] lg:items-start">
        {content.sections.length > 1 ? (
          <aside className="lg:sticky lg:top-24 lg:order-2">
            <OnThisPage sections={content.sections} />
          </aside>
        ) : null}
        <div className="flex min-w-0 flex-col gap-14">
          {lead}
          {content.sections.map((section) => (
            <ContentSection key={section.id} section={section} />
          ))}
          {children}
        </div>
      </div>
    </div>
  );
}
