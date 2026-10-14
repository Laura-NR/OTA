import type { ConditionsContent, ConditionTone, ConditionTopic } from '@ota/schemas';
import { Badge, buttonClassName, Icon } from '@ota/ui';
import type { BadgeVariant, IconName } from '@ota/ui';
import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';

const TOPIC_ICONS: Record<ConditionTopic, IconName> = {
  power: 'zap',
  fuel: 'fuel',
  connectivity: 'wifi',
  advisories: 'shield',
  weather: 'cloud-sun',
  roads: 'route',
};

export const TONE_BADGES: Record<ConditionTone, BadgeVariant> = {
  ok: 'success',
  caution: 'warning',
  info: 'info',
};

/**
 * Home's "Cuba right now" briefing: one row per topic with its pill, the
 * agency's note on how it plans around them, and the way to the full page.
 */
export function ConditionsCard({ content }: { content: ConditionsContent }) {
  const t = useTranslations();

  return (
    <section
      aria-labelledby="conditions-title"
      className="flex flex-col gap-4 rounded-lg border bg-surface p-6 md:p-7"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          {content.eyebrow ? (
            <p className="text-overline uppercase text-primary-600">{content.eyebrow}</p>
          ) : null}
          <h2 id="conditions-title" className="font-display text-h1-compact text-default">
            {content.title}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {content.status === 'placeholder' ? (
            <Badge variant="outline">{t('pages.common.sample')}</Badge>
          ) : null}
          <p className="text-caption text-muted">{content.updated}</p>
        </div>
      </div>
      <ul className="flex flex-col">
        {content.items.map((item) => (
          <li
            key={item.topic}
            className="flex flex-wrap items-center justify-between gap-3 border-b py-3 text-body last:border-b-0"
          >
            <span className="flex items-center gap-2.5">
              <Icon name={TOPIC_ICONS[item.topic]} className="text-secondary" />
              {item.label}
            </span>
            <Badge
              variant={TONE_BADGES[item.tone]}
              className="h-auto min-h-6 whitespace-normal py-0.5"
            >
              {item.value}
            </Badge>
          </li>
        ))}
      </ul>
      {content.note ? (
        <p className="text-body-sm text-secondary">{content.note}</p>
      ) : null}
      <Link
        href="/travel-info"
        className={`${buttonClassName({ variant: 'secondary' })} self-start`}
      >
        {t('home.conditionsLink')}
      </Link>
    </section>
  );
}
