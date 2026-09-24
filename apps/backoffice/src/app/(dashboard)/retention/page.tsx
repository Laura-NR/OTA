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
  const pending = await apiFetch<RetentionPendingUserDto[]>(
    '/retention/pending?limit=100',
  ).catch(() => []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data retention"
        description="GDPR lifecycle for travelers: a keep-alive notice 6 months after the last completed booking, a 30-day grace period, then anonymization."
      />

      <Card>
        <CardHeader>
          <CardTitle>Retention pipeline</CardTitle>
          <CardDescription>
            Travelers with a notice due, inside the grace period, or due for
            anonymization. Anonymized records keep their reservations and fiscal totals.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <Alert>No travelers are in the retention lifecycle.</Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Traveler</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last completed</TableHead>
                  <TableHead>Notice sent</TableHead>
                  <TableHead>Consent</TableHead>
                  <TableHead>Anonymizes</TableHead>
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
