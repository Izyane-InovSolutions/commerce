import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';

import { ServiceUnavailableException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { ShutdownState } from '../../infrastructure/lifecycle/shutdown-state.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  let shutdown: ShutdownState;
  const healthCheckServiceMock = { check: jest.fn() };
  const prismaIndicatorMock = { pingCheck: jest.fn() };
  const prismaServiceMock = {};

  beforeEach(async () => {
    shutdown = new ShutdownState();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: healthCheckServiceMock },
        { provide: PrismaHealthIndicator, useValue: prismaIndicatorMock },
        { provide: PrismaService, useValue: prismaServiceMock },
        { provide: ShutdownState, useValue: shutdown },
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

  it('reports not ready once draining, without checking the database', () => {
    shutdown.beginDraining();

    expect(() => controller.checkReadiness()).toThrow(
      ServiceUnavailableException,
    );
    expect(healthCheckServiceMock.check).not.toHaveBeenCalled();
    // Liveness is unaffected: the process is still healthy while it drains.
    expect(controller.getHealth()).toEqual({ status: 'ok' });
  });
});
