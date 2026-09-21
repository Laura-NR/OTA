'use client';

import { nextStatuses } from '@ota/domain';
import type { ReservationStatus } from '@ota/domain';
import type { ReservationDto } from '@ota/schemas';
import {
  Alert,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ota/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { apiRequest } from '@/lib/client-api';

import { StatusBadge } from './status-badge';

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString();
}

function formatAmount(amount: string, currency: string): string {
  return `${currency} ${Number(amount).toFixed(2)}`;
}

export interface ReservationsTableProps {
  reservations: ReservationDto[];
  canManage: boolean;
}

export function ReservationsTable({ reservations, canManage }: ReservationsTableProps) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function transition(id: string, to: ReservationStatus) {
    setPendingId(id);
    setError(null);
    try {
      await apiRequest(`/reservations/${id}/transition`, {
        method: 'POST',
        body: JSON.stringify({ to }),
      });
      router.refresh();
    } catch (transitionError) {
      setError(
        transitionError instanceof Error ? transitionError.message : 'Transition failed',
      );
    } finally {
      setPendingId(null);
    }
  }

  if (reservations.length === 0) {
    return (
      <Alert>
        No reservations yet. Run the seed or create a booking to see the pipeline here.
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Booking</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Start</TableHead>
            <TableHead>End</TableHead>
            <TableHead>Total</TableHead>
            {canManage ? <TableHead>Transition to</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {reservations.map((reservation) => {
            const options = nextStatuses(reservation.status);
            return (
              <TableRow key={reservation.id}>
                <TableCell className="font-medium">{reservation.bookingCode}</TableCell>
                <TableCell>
                  <StatusBadge status={reservation.status} />
                </TableCell>
                <TableCell>{formatDate(reservation.startDate)}</TableCell>
                <TableCell>{formatDate(reservation.endDate)}</TableCell>
                <TableCell>
                  {formatAmount(reservation.totalAmount, reservation.totalCurrency)}
                </TableCell>
                {canManage ? (
                  <TableCell>
                    {options.length === 0 ? (
                      <span className="text-xs text-muted-foreground">Terminal</span>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {options.map((to) => (
                          <Button
                            key={to}
                            size="sm"
                            variant="outline"
                            disabled={pendingId === reservation.id}
                            onClick={() => transition(reservation.id, to)}
                          >
                            {to.replaceAll('_', ' ')}
                          </Button>
                        ))}
                      </div>
                    )}
                  </TableCell>
                ) : null}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
