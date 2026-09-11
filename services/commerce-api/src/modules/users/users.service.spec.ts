import { PrismaService } from '../../database/prisma.service';
import { UsersService } from './users.service';

describe('UsersService identity normalization', () => {
  const prisma = {
    user: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  };
  const service = new UsersService(prisma as unknown as PrismaService);
  beforeEach(() => jest.resetAllMocks());
  it('normalizes account creation and lookup consistently', async () => {
    await service.create('  Buyer@Example.COM  ', 'hashed-password');
    await service.findByEmail(' Buyer@Example.COM ');
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: { email: 'buyer@example.com', passwordHash: 'hashed-password' },
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'buyer@example.com' },
    });
  });
  it('uses the supplied transaction for a password change', async () => {
    const tx = { user: { update: jest.fn() } };
    await service.updatePasswordHash('user', 'hashed-password', tx as never);
    expect(tx.user.update).toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
