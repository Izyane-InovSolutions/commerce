import { SetMetadata } from '@nestjs/common';

export const IS_OPTIONAL_AUTH_KEY = 'isOptionalAuth';

// A present Bearer token is verified as normal (and a bad/expired one still
// rejects the request); a missing token proceeds unauthenticated instead of
// rejecting. For endpoints that must serve both guests and logged-in users.
export const OptionalAuth = (): ReturnType<typeof SetMetadata> =>
  SetMetadata(IS_OPTIONAL_AUTH_KEY, true);
