import { SetMetadata } from '@nestjs/common';

export const REQUIRE_VERIFIED_EMAIL_KEY = 'requireVerifiedEmail';
export const RequireVerifiedEmail = (): ClassDecorator & MethodDecorator =>
  SetMetadata(REQUIRE_VERIFIED_EMAIL_KEY, true);
