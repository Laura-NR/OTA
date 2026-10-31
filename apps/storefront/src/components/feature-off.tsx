import { buttonClassName } from '@ota/ui';
import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';

/**
 * A page whose feature is switched off in the settings (M9 D8b): what is
 * closed and the ways on, laid out like the 404. The API refuses the same
 * action, so an open tab cannot send it either.
 */
export async function FeatureOff({
  feature,
}: {
  feature: 'recruitmentPortal' | 'customItineraryBuilder';
}) {
  const t = await getTranslations('featureOff');

  return (
    <div className="mx-auto flex max-w-container flex-col gap-6 px-6 py-16 md:px-8 lg:px-10">
      <h1 className="text-h1-compact text-default md:text-h1">{t(`${feature}.title`)}</h1>
      <p className="max-w-prose text-body-lg text-secondary">{t(`${feature}.text`)}</p>
      <div className="flex flex-wrap gap-3">
        <Link href="/" className={buttonClassName()}>
          {t('home')}
        </Link>
        <Link
          href={feature === 'customItineraryBuilder' ? '/packages' : '/about'}
          className={buttonClassName({ variant: 'secondary' })}
        >
          {t(feature === 'customItineraryBuilder' ? 'packages' : 'about')}
        </Link>
        <Link
          href={{ pathname: '/support', hash: 'contact' }}
          className={buttonClassName({ variant: 'tertiary' })}
        >
          {t('contact')}
        </Link>
      </div>
    </div>
  );
}
