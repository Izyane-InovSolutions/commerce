import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Admits a configured internal scraper to the Prometheus endpoint by a
 * shared bearer secret (METRICS_SCRAPE_TOKEN). The route is otherwise public
 * to the JWT guard, which would reject a non-JWT bearer value.
 *
 * Unset token means scraping is disabled and the route answers 404, so an
 * unconfigured deployment exposes nothing. Admins read the same data from
 * the JSON endpoint with their normal session.
 */
@Injectable()
export class MetricsScrapeGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('METRICS_SCRAPE_TOKEN');
    if (!expected) throw new NotFoundException();

    const header = context
      .switchToHttp()
      .getRequest<Request>()
      .header('authorization');
    const supplied = header?.startsWith('Bearer ')
      ? header.slice('Bearer '.length)
      : '';
    if (!supplied || !sameSecret(supplied, expected))
      throw new UnauthorizedException('Invalid metrics scrape token');
    return true;
  }
}

// Hashing first gives equal-length inputs, so the comparison time reveals
// neither the token's length nor how much of a guess matched.
function sameSecret(supplied: string, expected: string): boolean {
  const digest = (value: string): Buffer =>
    createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(supplied), digest(expected));
}
