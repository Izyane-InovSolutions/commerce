import { PrismaService } from './prisma.service';

describe('PrismaService lifecycle', () => {
  it('disconnects only in the shutdown hook, after the HTTP server drains', async () => {
    const service = new PrismaService();
    const disconnect = jest
      .spyOn(service, '$disconnect')
      .mockResolvedValue(undefined);

    // Nest calls onModuleDestroy before closing the HTTP server; in-flight
    // requests still need the connection then.
    expect(
      (service as unknown as { onModuleDestroy?: unknown }).onModuleDestroy,
    ).toBeUndefined();

    await service.onApplicationShutdown();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
