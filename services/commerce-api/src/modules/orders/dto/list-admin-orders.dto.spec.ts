import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';

import { ListAdminOrdersDto } from './list-admin-orders.dto';

// Same options as the global pipe in main.ts - forbidNonWhitelisted is what
// made a bare @Query('status') next to PaginationQueryDto reject every filter.
const pipe = new ValidationPipe({
  forbidNonWhitelisted: true,
  transform: true,
  whitelist: true,
});

function parse(query: Record<string, unknown>): Promise<ListAdminOrdersDto> {
  return pipe.transform(query, {
    type: 'query',
    metatype: ListAdminOrdersDto,
  }) as Promise<ListAdminOrdersDto>;
}

describe('ListAdminOrdersDto', () => {
  it('accepts a status filter alongside pagination', async () => {
    const query = await parse({
      status: OrderStatus.PAID,
      page: '2',
      limit: '10',
    });
    expect(query).toMatchObject({
      status: OrderStatus.PAID,
      page: 2,
      limit: 10,
    });
  });

  it('leaves status undefined when omitted', async () => {
    expect((await parse({})).status).toBeUndefined();
  });

  it('rejects an unknown status', async () => {
    await expect(parse({ status: 'NOT_A_STATUS' })).rejects.toThrow();
  });
});
