import type { RetentionPendingUserDto } from '@ota/schemas';
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

import { PageHeader } from '@/components/page-header';
import { apiFetch } from '@/lib/api';

function statusVariant(
  status: string,
): 'secondary' | 'outline' | 'destructive' | 'success' {
  if (status === 'PURGE_DUE') {
    return 'destructive';
  }
  if (status === 'GRACE_PERIOD') {
    return 'secondary';
  }
  if (status === 'ANONYMIZED') {
    return 'success';
  }
  return 'outline';
}

function formatDate(value: string | null): string {
  return value ? value.slice(0, 10) : '—';
}

export default async function RetentionPage() {
  const t = await getTranslations('backoffice.retention');
  const pending = await apiFetch<RetentionPendingUserDto[]>(
    '/retention/pending?limit=100',
  ).catch(() => []);

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      <Card>
        <CardHeader>
          <CardTitle>{t('pipeline')}</CardTitle>
          <CardDescription>{t('pipelineDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <Alert>{t('empty')}</Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('traveler')}</TableHead>
                  <TableHead>{t('status')}</TableHead>
                  <TableHead>{t('lastCompleted')}</TableHead>
                  <TableHead>{t('noticeSent')}</TableHead>
                  <TableHead>{t('consent')}</TableHead>
                  <TableHead>{t('anonymizes')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((row) => (
                  <TableRow key={row.userId}>
                    <TableCell className="font-medium">
                      {row.fullName ?? row.email ?? row.userId}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                    </TableCell>
                    <TableCell>{formatDate(row.latestCompletedAt)}</TableCell>
                    <TableCell>{formatDate(row.noticeSentAt)}</TableCell>
                    <TableCell>{formatDate(row.consentGrantedAt)}</TableCell>
                    <TableCell>{formatDate(row.purgeAt)}</TableCell>
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
