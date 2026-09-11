import { applyDecorators } from '@nestjs/common';
import { Matches } from 'class-validator';

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function IsSlug(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    Matches(SLUG_PATTERN, {
      message: 'must be a lowercase kebab-case slug (e.g. "wireless-mouse")',
    }),
  );
}
