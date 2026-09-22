'use client';

import { escalationAlert } from '@ota/domain';
import type { DispatchServiceItemDto, DispatchViewDto } from '@ota/schemas';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@ota/ui';
import { useEffect, useState } from 'react';

import { apiRequest } from '@/lib/client-api';
import {
  connectEscalation,
  type EscalationAlert,
  type EscalationSocketEvent,
} from '@/lib/socket';

function alertVariant(alert: EscalationAlert) {
  if (alert === 'RED') return 'destructive' as const;
  if (alert === 'AMBER') return 'secondary' as const;
  return 'outline' as const;
}

function remainingLabel(deadline: string | null, now: number): string {
  if (!deadline) return '—';
  const ms = new Date(deadline).getTime() - now;
  if (ms <= 0) return 'overdue';
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}

function liveAlert(item: DispatchServiceItemDto, now: number): EscalationAlert {
  if (item.status === 'DECLINED' || item.status === 'TIMEOUT') {
    return 'RED';
  }
  if (item.status === 'OFFERED' && item.offeredAt && item.deadline) {
    return escalationAlert({
      offeredAt: new Date(item.offeredAt),
      deadline: new Date(item.deadline),
      now: new Date(now),
    });
  }
  return 'NONE';
}

export interface EscalationBoardProps {
  initialViews: DispatchViewDto[];
  canManage: boolean;
}

/**
 * Live operations escalation desk (spec §4.3). Seeds from the API, then follows
 * the `/ops` socket; each item's amber/red state is recomputed client-side from
 * the deadline so the countdown keeps ticking between events.
 */
export function EscalationBoard({ initialViews, canManage }: EscalationBoardProps) {
  const [views, setViews] = useState(initialViews);
  const [events, setEvents] = useState<EscalationSocketEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setViews(await apiRequest<DispatchViewDto[]>('/dispatch/active'));
    } catch {
      // Keep the last known board rather than blanking it on a transient error.
    }
  }

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const socket = connectEscalation();
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('escalation', (event: EscalationSocketEvent) => {
      setEvents((current) => [event, ...current].slice(0, 20));
      void refresh();
    });
    return () => {
      socket.close();
    };
  }, []);

  async function redispatch(serviceItemId: string) {
    setBusyItemId(serviceItemId);
    setError(null);
    try {
      await apiRequest(`/service-items/${serviceItemId}/reassign`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await refresh();
    } catch (redispatchError) {
      setError(
        redispatchError instanceof Error ? redispatchError.message : 'Re-dispatch failed',
      );
    } finally {
      setBusyItemId(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Live dispatch
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                connected ? 'bg-success' : 'bg-destructive'
              }`}
              aria-hidden
            />
            <span className="text-xs font-normal text-muted-foreground">
              {connected ? 'socket connected' : 'socket offline'}
            </span>
          </CardTitle>
          <CardDescription>
            Amber at 75% of the deadline, red at 100% or on decline/timeout.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button size="sm" variant="outline" onClick={() => void refresh()}>
            Refresh
          </Button>
          {error ? <Alert variant="destructive">{error}</Alert> : null}
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No live events yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {events.map((event) => (
                <li
                  key={`${event.serviceItemId}-${event.occurredAt}`}
                  className="flex items-center gap-2"
                >
                  <Badge variant={alertVariant(event.alert)}>{event.alert}</Badge>
                  <span className="font-medium">{event.type}</span>
                  <span className="text-xs text-muted-foreground">
                    {event.province ?? 'any province'} ·{' '}
                    {new Date(event.occurredAt).toLocaleTimeString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {views.length === 0 ? (
        <Alert>Nothing is in the dispatch or escalation flow right now.</Alert>
      ) : (
        views.map((view) => (
          <Card key={view.reservationId}>
            <CardHeader>
              <CardTitle>{view.bookingCode}</CardTitle>
              <CardDescription>{view.status.replaceAll('_', ' ')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {view.serviceItems.map((item) => {
                const alert = liveAlert(item, now);
                return (
                  <div
                    key={item.id}
                    className={`flex flex-wrap items-center gap-3 rounded-md border p-3 text-sm ${
                      alert === 'RED' ? 'border-destructive bg-destructive/5' : ''
                    }`}
                  >
                    <span className="font-medium">
                      {item.serviceType.replaceAll('_', ' ')}
                    </span>
                    <Badge variant="outline">{item.status.replaceAll('_', ' ')}</Badge>
                    <Badge variant={alertVariant(alert)}>{alert}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {item.province ?? 'any province'} · deadline{' '}
                      {remainingLabel(item.deadline, now)}
                    </span>

                    {item.workerPhone ? (
                      <a
                        className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                        href={`tel:${item.workerPhone}`}
                      >
                        Call {item.workerPhone}
                      </a>
                    ) : null}

                    {canManage ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="ml-auto"
                        disabled={busyItemId === item.id}
                        onClick={() => void redispatch(item.id)}
                      >
                        {busyItemId === item.id ? 'Re-dispatching…' : 'Re-dispatch'}
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
