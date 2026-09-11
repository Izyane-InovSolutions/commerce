import { ExecutionContext, createParamDecorator } from '@nestjs/common';

import { AuthenticatedUser, RequestWithUser } from './authenticated-user';

export const OptionalCurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    return request.user;
  },
);
