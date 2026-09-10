import { ExecutionContext, createParamDecorator } from '@nestjs/common';

import { AuthenticatedUser, RequestWithUser } from './authenticated-user';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();

    if (!request.user) {
      throw new Error(
        'CurrentUser decorator used on a route without an authenticated user',
      );
    }

    return request.user;
  },
);
