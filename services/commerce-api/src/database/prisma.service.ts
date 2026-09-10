import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    // Connection failures must not crash the process: liveness stays up even
    // when the database is briefly unreachable, and readiness reports it.
    try {
      await this.$connect();
    } catch (error) {
      this.logger.error(
        'Failed to connect to the database on startup',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
