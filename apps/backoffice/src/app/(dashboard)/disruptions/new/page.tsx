import { Alert, Card, CardContent } from '@ota/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { DisruptionCreateForm } from '@/components/disruption-create-form';
import { PageHeader } from '@/components/page-header';
import { advisoryProvinces } from '@/lib/advisory-regions';
import { getTenantConfig } from '@/lib/tenant';

/** Opening a disruption case from one of the tenant's scenarios (M8 D1). */
export default async function NewDisruptionPage() {
  const t = await getTranslations('disruptionsDesk');
  const { disruptions } = getTenantConfig();

  return (
    <div className="flex flex-col gap-6">
      <Link href="/disruptions" className="text-body-sm text-primary-600">
        {t('back')}
      </Link>
      <PageHeader title={t('newTitle')} description={t('description')} />
      {disruptions.status === 'placeholder' && disruptions.scenarios.length > 0 ? (
        <Alert variant="info">{t('sampleNotice')}</Alert>
      ) : null}
      <Card>
        <CardContent className="pt-6">
          {disruptions.scenarios.length === 0 ? (
            <p className="text-body-sm text-muted">{t('noScenarios')}</p>
          ) : (
            <DisruptionCreateForm
              scenarios={disruptions.scenarios.map((scenario) => ({
                key: scenario.key,
                label: scenario.label,
                trigger: scenario.trigger,
              }))}
              provinces={advisoryProvinces()}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
