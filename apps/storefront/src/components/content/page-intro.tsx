import type { ContentStatus } from '@ota/schemas';
import { Alert, cn } from '@ota/ui';
import { getTranslations } from 'next-intl/server';

/**
 * A content page's opening: overline, the display title, lede and note, and
 * while the tenant's content is still a placeholder, the notice that says so.
 */
export async function PageIntro({
  status,
  eyebrow,
  title,
  lede,
  note,
  agencyName,
  large = false,
}: {
  status: ContentStatus;
  eyebrow?: string;
  title: string;
  lede?: string;
  note?: string;
  agencyName: string;
  /** The trip pages' 48/56 title (display-2) from `md`, instead of 40/48. */
  large?: boolean;
}) {
  const t = await getTranslations('pages.common');

  return (
    <header className="flex flex-col gap-4">
      {status === 'placeholder' ? (
        <Alert variant="info" title={t('placeholderTitle')}>
          {t('placeholderText', { agency: agencyName })}
        </Alert>
      ) : null}
      {eyebrow ? (
        <p className="text-overline uppercase text-secondary-600">{eyebrow}</p>
      ) : null}
      <h1
        className={cn(
          'text-h1-compact text-default',
          large ? 'md:text-display-2' : 'md:text-h1',
        )}
      >
        {title}
      </h1>
      {lede ? <p className="max-w-prose text-body-lg text-secondary">{lede}</p> : null}
      {note ? <p className="text-caption text-muted">{note}</p> : null}
    </header>
  );
}

/** "On this page": anchor links to a page's sections. */
export async function OnThisPage({
  sections,
}: {
  sections: readonly { id: string; title: string }[];
}) {
  const t = await getTranslations('pages.common');

  return (
    <nav aria-label={t('onThisPage')} className="flex flex-col gap-2">
      <p className="text-overline uppercase text-muted">{t('onThisPage')}</p>
      <ul className="flex flex-col gap-1.5">
        {sections.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              className="text-body-sm text-primary-600 underline-offset-[3px] hover:underline"
            >
              {section.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
