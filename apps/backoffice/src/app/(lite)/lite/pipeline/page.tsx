import type { OpsLitePipelineDto } from '@ota/schemas';
import { Alert } from '@ota/ui';
import { getLocale, getTranslations } from 'next-intl/server';

import { LiteHeader } from '@/components/ops-lite/lite-header';
import { LitePipeline } from '@/components/ops-lite/lite-pipeline';
import { apiFetch } from '@/lib/api';
import { opsTime } from '@/lib/ops-format';

/** AL-Pipeline: the read-only view of the bookings by state, on the ground and moving today. */
export default async function OpsLitePipelinePage() {
  const t = await getTranslations('backoffice.opsLite.pipeline');
  const locale = await getLocale();
  const pipeline = await apiFetch<OpsLitePipelineDto>('/ops-lite/pipeline').catch(
    () => null,
  );

  return (
    <>
      <LiteHeader
        title={t('title')}
        subtitle={
          pipeline
            ? t('subtitle', {
                total: pipeline.total,
                open: pipeline.inPipeline,
                time: opsTime(pipeline.refreshedAt, locale),
              })
            : t('unavailable')
        }
        aside={
          pipeline ? (
            <span className="inline-flex h-6 items-center rounded-full bg-neutral-0/[.16] px-2.5 text-caption font-semibold text-neutral-0">
              {t('live')}
            </span>
          ) : null
        }
      />
      {pipeline ? (
        <LitePipeline pipeline={pipeline} />
      ) : (
        <div className="px-5 pt-3.5">
          <Alert variant="destructive">{t('loadError')}</Alert>
        </div>
      )}
    </>
  );
}
