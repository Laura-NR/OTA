import type { IncidentDto, SupplierReliabilityDto } from '@ota/schemas';
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
  const [incidents, reliability] = await Promise.all([
    apiFetch<IncidentDto[]>('/incidents?limit=100').catch(() => []),
    apiFetch<SupplierReliabilityDto[]>('/quality/supplier-reliability').catch(() => []),
  ]);

  const openCount = incidents.filter((incident) => !incident.resolvedAt).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quality & duty of care"
        description="Incident log and worker reliability scorecards (spec §4.9.4)."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Open incidents" value={String(openCount)} />
        <Kpi label="Incidents logged" value={String(incidents.length)} />
        <Kpi label="Suppliers scored" value={String(reliability.length)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Incident log</CardTitle>
          <CardDescription>Newest first</CardDescription>
        </CardHeader>
        <CardContent>
          {incidents.length === 0 ? (
            <Alert>No incidents logged.</Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Booking</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
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
                        <Badge variant="success">Resolved</Badge>
                      ) : (
                        <Badge variant="outline">Open</Badge>
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
          <CardTitle>Worker reliability</CardTitle>
          <CardDescription>
            Derived from the dispatch-offer ledger; best acceptance first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reliability.length === 0 ? (
            <Alert>No dispatch history yet.</Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Offers</TableHead>
                  <TableHead>Acceptance</TableHead>
                  <TableHead>Timeout</TableHead>
                  <TableHead>Avg response</TableHead>
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
    </div>
  );
}
