import type { FeatureFlag } from '@ota/domain';
import { Alert } from '@ota/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

/** The flags whose queue has a desk page: what stops while one is off. */
export type DeskQueueFeature = Extract<
  FeatureFlag,
  'recruitmentPortal' | 'customItineraryBuilder'
>;

/**
 * A desk queue's note while the flag that feeds it is switched off (M9 D8b):
 * nothing new arrives, what is already here can still be worked, and where
 * two Super Admins switch it back on. Every staff role reads the thresholds.
 */
export async function FeatureOffNotice({ feature }: { feature: DeskQueueFeature }) {
  const t = await getTranslations('backoffice.featureOff');
  return (
    <Alert variant="info" title={t(`${feature}.title`)}>
      <p>{t(`${feature}.text`)}</p>
      <p>
        {t.rich('switchOn', {
          link: (chunks) => (
            <Link
              href="/settings?tab=thresholds"
              className="font-medium underline underline-offset-4"
            >
              {chunks}
            </Link>
          ),
        })}
      </p>
    </Alert>
  );
}
