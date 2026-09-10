import { ExecutionContext, createParamDecorator } from '@nestjs/common';

import { RequestWithUser } from './authenticated-user';

export const GUEST_TOKEN_HEADER = 'x-guest-token';

export const GuestToken = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    const header = request.header(GUEST_TOKEN_HEADER);
    return header && header.length > 0 ? header : undefined;
  },
);
