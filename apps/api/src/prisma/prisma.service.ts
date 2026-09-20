import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@ota/db';

/**
 * DI token for the shared Prisma client. `PrismaModule` provides the singleton
 * exported by `@ota/db`, so the API and the auth layer share one connection pool.
 */
@Injectable()
export class PrismaService extends PrismaClient {}
