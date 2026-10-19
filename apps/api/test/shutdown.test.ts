import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const API_DIR = path.resolve(__dirname, '..');
const FIXTURE = path.join('test', 'fixtures', 'shutdown-app.ts');

interface Exit {
  code: number | null;
  signal: NodeJS.Signals | null;
  afterMs: number;
}

let child: ChildProcess | undefined;

afterEach(() => {
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
  }
  child = undefined;
});

/** Start the fixture app and resolve once it has rendered a PDF. */
function start(env: Record<string, string>): Promise<{ output: () => string }> {
  child = spawn(process.execPath, ['-r', '@swc-node/register', FIXTURE], {
    cwd: API_DIR,
    env: { ...process.env, NODE_ENV: 'development', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const proc = child;
  return new Promise((resolve, reject) => {
    const onData = (chunk: Buffer): void => {
      output += chunk.toString();
      if (output.includes('ready %PDF-')) {
        resolve({ output: () => output });
      }
    };
    proc.stdout!.on('data', onData);
    proc.stderr!.on('data', onData);
    proc.once('exit', (code) =>
      reject(new Error(`fixture exited early (${code}):\n${output}`)),
    );
  });
}

function terminate(proc: ChildProcess): Promise<Exit> {
  const sentAt = Date.now();
  return new Promise((resolve) => {
    proc.once('exit', (code, signal) =>
      resolve({ code, signal, afterMs: Date.now() - sentAt }),
    );
    proc.kill('SIGTERM');
  });
}

function childPids(pid: number): number[] {
  try {
    return execFileSync('pgrep', ['-P', String(pid)], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .map(Number);
  } catch {
    return [];
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe('graceful shutdown on SIGTERM', () => {
  it('runs every hook, closes the PDF browser and ends with the signal', async () => {
    const app = await start({ SHUTDOWN_TIMEOUT_MS: '8000' });
    const browserPids = childPids(child!.pid!);
    expect(browserPids.length).toBeGreaterThan(0);

    const exit = await terminate(child!);

    expect(exit.signal).toBe('SIGTERM');
    expect(exit.afterMs).toBeLessThan(8000);
    expect(app.output()).toContain('probe: destroy hook ran');
    expect(app.output()).toContain('probe: shutdown hook ran');
    expect(browserPids.filter(isAlive)).toEqual([]);
  }, 30_000);

  it('force-exits once the timeout passes when a close never settles', async () => {
    const app = await start({ SHUTDOWN_TIMEOUT_MS: '1500', HANG_ON_CLOSE: '1' });

    const exit = await terminate(child!);

    expect(exit.code).toBe(1);
    expect(exit.afterMs).toBeGreaterThanOrEqual(1400);
    expect(exit.afterMs).toBeLessThan(6000);
    expect(app.output()).toContain('probe: destroy hook ran');
    expect(app.output()).toContain('forcing exit');
    expect(app.output()).not.toContain('probe: shutdown hook ran');
  }, 30_000);
});
