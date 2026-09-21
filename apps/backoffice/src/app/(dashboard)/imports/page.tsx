import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ota/ui';

import { ImportWizard } from '@/components/import-wizard';
import { PageHeader } from '@/components/page-header';

export default function ImportsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Imports"
        description="Stage a CSV or XLSX, map its columns, then commit the batch as inventory."
      />

      <Card>
        <CardHeader>
          <CardTitle>Bulk inventory import</CardTitle>
          <CardDescription>
            Commit validates the whole batch atomically — a single bad row imports
            nothing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ImportWizard />
        </CardContent>
      </Card>
    </div>
  );
}
