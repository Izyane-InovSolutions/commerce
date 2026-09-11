import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';

import { PrismaService } from '../../database/prisma.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  const healthCheckServiceMock = { check: jest.fn() };
  const prismaIndicatorMock = { pingCheck: jest.fn() };
  const prismaServiceMock = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: healthCheckServiceMock },
        { provide: PrismaHealthIndicator, useValue: prismaIndicatorMock },
        { provide: PrismaService, useValue: prismaServiceMock },
      ],
    }).compile();

    controller = module.get(HealthController);
    jest.clearAllMocks();
  });

  it('reports that the service is healthy', () => {
    expect(controller.getHealth()).toEqual({ status: 'ok' });
  });

  it('delegates readiness checks to the health check service', async () => {
    healthCheckServiceMock.check.mockResolvedValue({
      status: 'ok',
      info: {},
      error: {},
      details: {},
    });

    await controller.checkReadiness();

    expect(healthCheckServiceMock.check).toHaveBeenCalledWith([
      expect.any(Function),
    ]);
  });
});
