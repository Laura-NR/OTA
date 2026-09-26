import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ota/ui';
import { getTranslations } from 'next-intl/server';

import { ImportWizard } from '@/components/import-wizard';
import { PageHeader } from '@/components/page-header';

export default async function ImportsPage() {
  const t = await getTranslations('backoffice.imports');

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      <Card>
        <CardHeader>
          <CardTitle>{t('bulkImport')}</CardTitle>
          <CardDescription>{t('bulkImportDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <ImportWizard />
        </CardContent>
      </Card>
    </div>
  );
}
