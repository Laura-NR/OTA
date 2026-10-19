import { Global, Module, type OnApplicationShutdown } from '@nestjs/common';
import { prisma } from '@ota/db';

import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [{ provide: PrismaService, useValue: prisma }],
  exports: [PrismaService],
})
export class PrismaModule implements OnApplicationShutdown {
  // After the HTTP server has drained, so no request loses its connection.
  async onApplicationShutdown(): Promise<void> {
    await prisma.$disconnect();
  }
}
