import type { MyReservationDetailDto } from '@ota/schemas';
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
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { apiFetch, getServerSession } from '@/lib/api';

export default async function AccountReservationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSession();
  if (!session) {
    redirect('/login');
  }

  const reservation = await apiFetch<MyReservationDetailDto>(
    `/me/reservations/${id}`,
  ).catch(() => null);
  if (!reservation) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-12">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/account"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← My trips
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          {reservation.bookingCode}
        </h1>
        <Badge variant="secondary">{reservation.status.replaceAll('_', ' ')}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Booking</CardTitle>
          <CardDescription>
            {new Date(reservation.startDate).toLocaleDateString()} →{' '}
            {new Date(reservation.endDate).toLocaleDateString()}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          {reservation.totalCurrency} {Number(reservation.totalAmount).toFixed(2)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Itinerary</CardTitle>
          <CardDescription>{reservation.serviceItems.length} service(s)</CardDescription>
        </CardHeader>
        <CardContent>
          {reservation.serviceItems.length === 0 ? (
            <Alert>Your itinerary is being assembled.</Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Province</TableHead>
                  <TableHead>Starts</TableHead>
                  <TableHead>Ends</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reservation.serviceItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.serviceType.replaceAll('_', ' ')}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {item.status.replaceAll('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>{item.province ?? '—'}</TableCell>
                    <TableCell>
                      {new Date(item.serviceDateStart).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {new Date(item.serviceDateEnd).toLocaleString()}
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
          <CardTitle>Documents</CardTitle>
          <CardDescription>{reservation.documents.length} file(s)</CardDescription>
        </CardHeader>
        <CardContent>
          {reservation.documents.length === 0 ? (
            <Alert>
              Vouchers and invoices appear here once your booking is confirmed.
            </Alert>
          ) : (
            <ul className="space-y-2 text-sm">
              {reservation.documents.map((document) => (
                <li key={document.id} className="flex items-center gap-3">
                  <Badge variant="outline">{document.type.replaceAll('_', ' ')}</Badge>
                  <a
                    className="font-medium text-primary underline-offset-4 hover:underline"
                    href={`/api/ota/documents/${document.id}/download`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Download PDF
                  </a>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
