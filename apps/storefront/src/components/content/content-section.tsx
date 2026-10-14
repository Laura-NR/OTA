import type { ContentSection as Section } from '@ota/schemas';
import type { ReactNode } from 'react';

import { ContentBlocks } from './content-blocks';

/** One tenant content section: overline, display heading, lede, provenance note, blocks. */
export function ContentSection({
  section,
  children,
}: {
  section: Section;
  children?: ReactNode;
}) {
  return (
    <section
      id={section.id}
      aria-labelledby={`${section.id}-title`}
      className="flex scroll-mt-24 flex-col gap-4"
    >
      {section.eyebrow ? (
        <p className="text-overline uppercase text-secondary-600">{section.eyebrow}</p>
      ) : null}
      <h2
        id={`${section.id}-title`}
        className="font-display text-h2-compact text-default md:text-h2"
      >
        {section.title}
      </h2>
      {section.lede ? (
        <p className="max-w-prose text-body-lg text-secondary">{section.lede}</p>
      ) : null}
      {section.note ? <p className="text-caption text-muted">{section.note}</p> : null}
      <ContentBlocks blocks={section.blocks} />
      {children}
    </section>
  );
}
