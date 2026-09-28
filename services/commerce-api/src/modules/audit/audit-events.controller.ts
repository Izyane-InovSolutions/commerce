import { Controller, Get, Query } from '@nestjs/common';
import { Role } from '@prisma/client';

import { Roles } from '../../common/auth/roles.decorator';
import { AuditEventPage } from './audit-event';
import { AuditService } from './audit.service';
import { ListAuditEventsDto } from './dto/list-audit-events.dto';

/** Read side of the audit trail — ADMIN only, since rows can carry actor
 * IPs, user agents and business metadata across every module. */
@Roles(Role.ADMIN)
@Controller('admin/audit-events')
export class AuditEventsController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  list(@Query() query: ListAuditEventsDto): Promise<AuditEventPage> {
    return this.auditService.list(query);
  }

  /** Distinct action names, for the log's filter dropdown. */
  @Get('actions')
  actions(): Promise<string[]> {
    return this.auditService.listActions();
  }
}
