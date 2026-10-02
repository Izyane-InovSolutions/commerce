import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnApplicationShutdown
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

  // Not onModuleDestroy: Nest runs those before the HTTP server stops
  // accepting, so requests still in flight would lose their connection.
  // Shutdown hooks run after the server has drained.
  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }
}
