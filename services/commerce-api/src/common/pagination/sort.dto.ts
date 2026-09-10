import { IsOptional, Matches } from 'class-validator';

export type SortOrder = 'asc' | 'desc';

export type SortField = {
  field: string;
  order: SortOrder;
};

const SORT_PATTERN = /^([a-zA-Z0-9_]+):(asc|desc)$/;

/**
 * Query convention: ?sort=field:asc,otherField:desc
 */
export class SortQueryDto {
  @IsOptional()
  @Matches(SORT_PATTERN, {
    each: true,
    message: 'sort entries must match "field:asc" or "field:desc"',
  })
  sort?: string | string[];
}

export function parseSort(sort: string | string[] | undefined): SortField[] {
  if (!sort) {
    return [];
  }

  const entries = Array.isArray(sort) ? sort : sort.split(',');

  return (
    entries
      .map((entry) => SORT_PATTERN.exec(entry))
      .filter((match): match is RegExpExecArray => match !== null)
      // Regex guarantees both groups are present when the pattern matches.
      .map((match) => ({ field: match[1]!, order: match[2]! as SortOrder }))
  );
}
