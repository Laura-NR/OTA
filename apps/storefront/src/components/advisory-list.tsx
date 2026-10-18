import { getLocale, getTranslations } from 'next-intl/server';

import { getActiveAdvisories, getAdvisoryHistory } from '@/lib/advisories';

import { AdvisoryNotice } from './advisory-notice';

/**
 * Travel info's Current Conditions advisories (M7): the ones in force, most
 * severe first, then the last year's ended ones as history.
 */
export async function AdvisoryList() {
  const [t, locale] = await Promise.all([getTranslations('advisories'), getLocale()]);
  const [active, history] = await Promise.all([
    getActiveAdvisories(locale),
    getAdvisoryHistory(locale),
  ]);
  const current = active.filter((advisory) => advisory.showOnSite);

  return (
    <section id="advisories" aria-labelledby="advisories-title" className="scroll-mt-24">
      <h2
        id="advisories-title"
        className="font-display text-h2-compact text-default md:text-h2"
      >
        {t('currentTitle')}
      </h2>
      <p className="mt-2 text-body text-secondary">{t('currentLede')}</p>
      <div className="mt-6 flex flex-col gap-3">
        {current.length === 0 ? (
          <p className="text-body-sm text-muted">{t('none')}</p>
        ) : (
          current.map((advisory) => (
            <AdvisoryNotice key={advisory.id} advisory={advisory} />
          ))
        )}
      </div>
      <h3 className="mt-8 text-h4 font-semibold text-default">{t('historyTitle')}</h3>
      <div className="mt-3 flex flex-col gap-3">
        {history.length === 0 ? (
          <p className="text-body-sm text-muted">{t('historyNone')}</p>
        ) : (
          history.map((advisory) => (
            <AdvisoryNotice key={advisory.id} advisory={advisory} />
          ))
        )}
      </div>
    </section>
  );
}
