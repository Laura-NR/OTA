import type { IncidentDto, ReviewDto, SupplierReliabilityDto } from '@ota/schemas';
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ota/ui';
import { getTranslations } from 'next-intl/server';

import { IncidentResolveButton } from '@/components/incident-resolve-button';
import { PageHeader } from '@/components/page-header';
import { apiFetch } from '@/lib/api';

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function severityVariant(severity: string): 'secondary' | 'outline' | 'destructive' {
  if (severity === 'CRITICAL' || severity === 'HIGH') {
    return 'destructive';
  }
  return severity === 'MEDIUM' ? 'secondary' : 'outline';
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

export default async function QualityPage() {
  const t = await getTranslations('backoffice.quality');
  const [incidents, reliability, reviews] = await Promise.all([
    apiFetch<IncidentDto[]>('/incidents?limit=100').catch(() => []),
    apiFetch<SupplierReliabilityDto[]>('/quality/supplier-reliability').catch(() => []),
    apiFetch<ReviewDto[]>('/reviews?limit=20').catch(() => []),
  ]);

  const openCount = incidents.filter((incident) => !incident.resolvedAt).length;
  const averageRating =
    reviews.length > 0
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
      : 0;

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={t('openIncidents')} value={String(openCount)} />
        <Kpi label={t('incidentsLogged')} value={String(incidents.length)} />
        <Kpi label={t('suppliersScored')} value={String(reliability.length)} />
        <Kpi label={t('averageRating')} value={`${averageRating.toFixed(2)} / 5`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('incidentLog')}</CardTitle>
          <CardDescription>{t('newestFirst')}</CardDescription>
        </CardHeader>
        <CardContent>
          {incidents.length === 0 ? (
            <Alert>{t('noIncidents')}</Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('booking')}</TableHead>
                  <TableHead>{t('category')}</TableHead>
                  <TableHead>{t('severity')}</TableHead>
                  <TableHead>{t('descriptionCol')}</TableHead>
                  <TableHead>{t('status')}</TableHead>
                  <TableHead className="text-right">{t('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incidents.map((incident) => (
                  <TableRow key={incident.id}>
                    <TableCell className="font-medium">{incident.bookingCode}</TableCell>
                    <TableCell>{incident.category}</TableCell>
                    <TableCell>
                      <Badge variant={severityVariant(incident.severity)}>
                        {incident.severity}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {incident.description}
                    </TableCell>
                    <TableCell>
                      {incident.resolvedAt ? (
                        <Badge variant="success">{t('resolved')}</Badge>
                      ) : (
                        <Badge variant="outline">{t('open')}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {incident.resolvedAt ? null : (
                        <IncidentResolveButton incidentId={incident.id} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('workerReliability')}</CardTitle>
          <CardDescription>{t('reliabilityDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          {reliability.length === 0 ? (
            <Alert>{t('noHistory')}</Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('supplier')}</TableHead>
                  <TableHead>{t('offers')}</TableHead>
                  <TableHead>{t('acceptance')}</TableHead>
                  <TableHead>{t('timeout')}</TableHead>
                  <TableHead>{t('avgResponse')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reliability.map((row) => (
                  <TableRow key={row.supplierId}>
                    <TableCell className="font-medium">
                      {row.supplierName ?? row.supplierId}
                    </TableCell>
                    <TableCell>{row.offers}</TableCell>
                    <TableCell>{percent(row.acceptanceRate)}</TableCell>
                    <TableCell>{percent(row.timeoutRate)}</TableCell>
                    <TableCell>{row.averageResponseMinutes} min</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('recentReviews')}</CardTitle>
          <CardDescription>{t('recentReviewsDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          {reviews.length === 0 ? (
            <Alert>{t('noReviews')}</Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('booking')}</TableHead>
                  <TableHead>{t('rating')}</TableHead>
                  <TableHead>{t('comment')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviews.map((review) => (
                  <TableRow key={review.id}>
                    <TableCell className="font-medium">{review.bookingCode}</TableCell>
                    <TableCell>{review.rating} / 5</TableCell>
                    <TableCell className="max-w-md truncate">
                      {review.comment ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
