/** Unlike Boolean(value), the query string "false" must remain false.
 * Leave unknown input intact so @IsBoolean rejects it instead of guessing. */
export function booleanQuery({ value }: { value: unknown }): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}
