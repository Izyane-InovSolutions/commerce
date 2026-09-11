import type { Prisma } from '@prisma/client';

export interface JobHandler {
  readonly type: string;
  handle(payload: Prisma.JsonValue): Promise<void>;
}
