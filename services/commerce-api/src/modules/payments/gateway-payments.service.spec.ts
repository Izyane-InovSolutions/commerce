import { UsersService } from '../users/users.service';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { GatewayPaymentsService } from './gateway-payments.service';
import { UnifiedPaymentProvider } from './unified-payment.provider';
import { GatewayPaymentQueryDto } from './dto/gateway-payment.dto';

describe('GatewayPaymentsService', () => {
  const payment = {
    id: 'local-1',
    orderId: 'order-1',
    provider: 'unified',
    providerReference: 'pay_123',
    amount: 10000,
    currency: 'ZMW',
    status: 'PENDING',
  };
  const remote = {
    paymentId: 'pay_123',
    reference: 'order-1',
    amount: 100,
    currency: 'ZMW',
    status: 'PENDING',
  };
  const prisma = {
    user: { findUnique: jest.fn() },
    payment: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    auditEvent: { create: jest.fn() },
  };
  const gateway = {
    name: 'unified',
    getDetails: jest.fn(),
    checkStatus: jest.fn(),
    cancelPayment: jest.fn(),
    requestRefund: jest.fn(),
    listPayments: jest.fn(),
  };
  let service: GatewayPaymentsService;
  beforeEach(() => {
    jest.resetAllMocks();
    prisma.user.findUnique.mockResolvedValue({
      isActive: true,
      role: 'CUSTOMER',
    });
    prisma.payment.findFirst.mockResolvedValue(payment);
    prisma.payment.findUnique.mockResolvedValue(payment);
    gateway.getDetails.mockResolvedValue(remote);
    gateway.checkStatus.mockResolvedValue(remote);
    service = new GatewayPaymentsService(
      prisma as unknown as PrismaService,
      gateway as unknown as UnifiedPaymentProvider,
      new UsersService(prisma as unknown as PrismaService),
    );
  });

  it('looks up local payments by owner before contacting the gateway', async () => {
    await service.get('buyer-1', 'local-1');
    expect(prisma.payment.findFirst).toHaveBeenCalledWith({
      where: { id: 'local-1', order: { userId: 'buyer-1' } },
    });
    expect(gateway.getDetails).toHaveBeenCalledWith('pay_123');
    prisma.payment.findFirst.mockResolvedValue(null);
    await expect(
      service.status('other-buyer', 'local-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(gateway.checkStatus).not.toHaveBeenCalled();
  });

  it('rechecks current account and admin permissions', async () => {
    await expect(
      service.list('buyer-1', new GatewayPaymentQueryDto()),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(gateway.listPayments).not.toHaveBeenCalled();
    prisma.user.findUnique.mockResolvedValue({
      isActive: false,
      role: 'ADMIN',
    });
    await expect(service.get('disabled', 'local-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(gateway.getDetails).not.toHaveBeenCalled();
  });

  it('rejects a mismatched remote payment', async () => {
    gateway.checkStatus.mockResolvedValue({
      ...remote,
      reference: 'another-order',
    });
    await expect(service.status('buyer-1', 'local-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });

  it('returns external cancellation state without inventing a local transition', async () => {
    gateway.cancelPayment.mockResolvedValue({ ...remote, status: 'CANCELLED' });
    await expect(
      service.cancel('buyer-1', 'local-1', 'Customer request'),
    ).resolves.toMatchObject({
      localStatus: 'PENDING',
      requiresReconciliation: true,
      gateway: { status: 'CANCELLED' },
    });
    expect(prisma.auditEvent.create).toHaveBeenCalled();
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });

  it('requires reconciliation when the external ID was not saved', async () => {
    prisma.payment.findFirst.mockResolvedValue({
      ...payment,
      providerReference: null,
    });
    await expect(service.status('buyer-1', 'local-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(gateway.checkStatus).not.toHaveBeenCalled();
  });

  it('does not pretend unsupported refunds were completed', async () => {
    prisma.user.findUnique.mockResolvedValue({ isActive: true, role: 'ADMIN' });
    prisma.payment.findUnique.mockResolvedValue({
      ...payment,
      status: 'SUCCEEDED',
    });
    gateway.requestRefund.mockRejectedValue(new NotImplementedException());
    await expect(
      service.refund(
        'admin-1',
        'local-1',
        { amount: 100, reason: 'Customer request' },
        'request-1',
      ),
    ).rejects.toBeInstanceOf(NotImplementedException);
    expect(gateway.requestRefund).not.toHaveBeenCalled();
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });

  it('rejects excessive refunds before contacting the gateway', async () => {
    prisma.user.findUnique.mockResolvedValue({ isActive: true, role: 'ADMIN' });
    prisma.payment.findUnique.mockResolvedValue({
      ...payment,
      status: 'SUCCEEDED',
    });
    await expect(
      service.refund(
        'admin-1',
        'local-1',
        { amount: 10001, reason: 'Customer request' },
        'request-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(gateway.requestRefund).not.toHaveBeenCalled();
  });
});
