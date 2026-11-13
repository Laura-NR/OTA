// Child process for shutdown.test.ts: a minimal Nest app with the real
// graceful-shutdown wiring and the real Chromium renderer. Run it with
// `node -r @swc-node/register` (as the API's dev runner) so decorators work.
import 'reflect-metadata';

import {
  Injectable,
  Module,
  type OnApplicationShutdown,
  type OnModuleDestroy,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { enableGracefulShutdown } from '../../src/common/graceful-shutdown';
import {
  DOCUMENT_RENDERER,
  type DocumentRenderer,
  PlaywrightDocumentRenderer,
} from '../../src/documents/document-renderer';

/** Stands in for a BullMQ/Redis close; HANG_ON_CLOSE=1 makes it never settle. */
@Injectable()
class CloseProbe implements OnModuleDestroy, OnApplicationShutdown {
  onModuleDestroy(): Promise<void> {
    process.stdout.write('probe: destroy hook ran\n');
    return process.env.HANG_ON_CLOSE === '1' ? new Promise(() => {}) : Promise.resolve();
  }

  onApplicationShutdown(): void {
    process.stdout.write('probe: shutdown hook ran\n');
  }
}

@Module({
  providers: [
    { provide: DOCUMENT_RENDERER, useClass: PlaywrightDocumentRenderer },
    CloseProbe,
  ],
})
class ShutdownFixtureModule {}

async function main(): Promise<void> {
  const app = await NestFactory.create(ShutdownFixtureModule, {
    logger: ['log', 'error'],
  });
  enableGracefulShutdown(app, Number(process.env.SHUTDOWN_TIMEOUT_MS));
  await app.listen(0, '127.0.0.1');

  const pdf = await app
    .get<DocumentRenderer>(DOCUMENT_RENDERER)
    .render('<p>shutdown</p>');
  process.stdout.write(`ready ${new TextDecoder().decode(pdf.slice(0, 5))}\n`);
}

void main();
