import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AddressesModule } from './addresses/addresses.module';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AddressesModule, AuditModule],
  controllers: [UsersController, AdminUsersController],
  providers: [UsersService, AdminUsersService],
  exports: [UsersService],
})
export class UsersModule {}
