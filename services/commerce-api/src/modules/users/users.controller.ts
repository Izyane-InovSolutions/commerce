import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Patch,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { toUserProfile, UserProfile } from './user-profile';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser): Promise<UserProfile> {
    const found = await this.usersService.findById(user.id);

    if (!found) {
      throw new NotFoundException('User not found');
    }

    return toUserProfile(found);
  }

  @Patch('me')
  async updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserProfile> {
    const updated = await this.usersService.updateProfile(user.id, dto);
    return toUserProfile(updated);
  }
}
