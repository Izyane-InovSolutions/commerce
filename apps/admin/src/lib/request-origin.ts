const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function hasValidMutationOrigin(
  method: string,
  origin: string | null,
  expectedOrigin: string,
): boolean {
  return SAFE_METHODS.has(method.toUpperCase()) || origin === expectedOrigin;
}
