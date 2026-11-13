import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { ServerTelemetry } from '../src/telemetry/server-telemetry';
import {
  MockTelemetrySink,
  type SinkEvent,
  type TelemetrySink,
} from '../src/telemetry/telemetry-sink';

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function tempFile(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ota-telemetry-'));
  dirs.push(dir);
  return join(dir, 'nested', 'events.jsonl');
}

describe('ServerTelemetry', () => {
  it('records a transition with the actor named from the account role', () => {
    const sink = new MockTelemetrySink();
    new ServerTelemetry(sink).stateChanged({
      bookingCode: 'DEMO0001',
      from: 'PENDING_PAYMENT',
      to: 'CONFIRMED',
      actor: { role: 'TRAVELER' },
      reason: 'payment_confirmed',
    });

    expect(sink.recent()).toEqual([
      expect.objectContaining({
        event: 'booking_state_changed',
        userId: null,
        params: {
          booking_code: 'DEMO0001',
          from: 'PENDING_PAYMENT',
          to: 'CONFIRMED',
          actor: 'traveler',
          reason: 'payment_confirmed',
        },
      }),
    ]);
  });

  it('drops an event the table refuses rather than failing the change', () => {
    const sink = new MockTelemetrySink();
    expect(() =>
      new ServerTelemetry(sink).emit('offer_sent', {
        service_item_id: 'item-1',
        service_type: 'SPACESHIP',
      }),
    ).not.toThrow();
    expect(sink.recent()).toEqual([]);
  });

  it('never lets a failing sink reach the caller', async () => {
    let calls = 0;
    const failing: TelemetrySink = {
      record: async () => {
        calls += 1;
        throw new Error('sink down');
      },
    };
    expect(() =>
      new ServerTelemetry(failing).emit('offer_timeout', {
        service_item_id: 'item-1',
        service_type: 'GUIDE',
        timer_h: 2,
      }),
    ).not.toThrow();
    // The rejection is handled: no unhandled rejection fails the run.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(calls).toBe(1);
  });
});

describe('MockTelemetrySink with a file', () => {
  const event = (name: string): SinkEvent => ({
    event: 'offer_sent',
    ts: '2026-10-25T12:00:00.000Z',
    essential: true,
    context: { app: 'server', consent: 'essential', funnel_stage: null },
    params: { service_item_id: name, service_type: 'GUIDE' },
    userId: null,
    receivedAt: '2026-10-25T12:00:00.000Z',
  });

  it('appends each event as a JSON line, in the order of the batches', async () => {
    const file = await tempFile();
    const sink = new MockTelemetrySink(file);

    await Promise.all([sink.record([event('a'), event('b')]), sink.record([event('c')])]);

    const lines = (await readFile(file, 'utf8')).trim().split('\n');
    expect(
      lines.map(
        (line) => (JSON.parse(line) as SinkEvent).params.service_item_id as string,
      ),
    ).toEqual(['a', 'b', 'c']);
    expect(sink.recent()).toHaveLength(3);
  });

  it('logs a failed append without failing the batch, and keeps writing after it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ota-telemetry-'));
    dirs.push(dir);
    const blocker = join(dir, 'nested');
    await writeFile(blocker, 'a file where the directory should be');
    const file = join(blocker, 'events.jsonl');
    const sink = new MockTelemetrySink(file);

    await expect(sink.record([event('a')])).resolves.toBeUndefined();
    await rm(blocker);
    await sink.record([event('b')]);

    const lines = (await readFile(file, 'utf8')).trim().split('\n');
    expect(
      lines.map((line) => (JSON.parse(line) as SinkEvent).params.service_item_id),
    ).toEqual(['b']);
    expect(sink.recent()).toHaveLength(2);
  });
});
