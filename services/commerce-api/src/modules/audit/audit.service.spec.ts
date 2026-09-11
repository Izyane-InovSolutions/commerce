import { PrismaService } from '../../database/prisma.service';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  let prisma: { auditEvent: { create: jest.Mock } };
  let auditService: AuditService;

  beforeEach(() => {
    prisma = { auditEvent: { create: jest.fn().mockResolvedValue(undefined) } };
    auditService = new AuditService(prisma as unknown as PrismaService);
  });

  it('writes an audit row with the given fields', async () => {
    await auditService.record({
      actorUserId: 'user-1',
      action: 'auth.login.success',
      targetType: 'User',
      targetId: 'user-1',
    });

    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: {
        actorUserId: 'user-1',
        action: 'auth.login.success',
        targetType: 'User',
        targetId: 'user-1',
        metadata: undefined,
        ipAddress: undefined,
        userAgent: undefined,
      },
    });
  });

  it('redacts sensitive fields in metadata before persisting', async () => {
    await auditService.record({
      action: 'auth.register',
      metadata: { email: 'a@b.com', password: 'hunter2' },
    });

    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: { email: 'a@b.com', password: '[REDACTED]' },
        }) as object,
      }),
    );
  });
});
