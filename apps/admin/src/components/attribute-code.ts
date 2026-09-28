/**
 * Suggests an attribute code from its name: "Screen size" becomes
 * "screen-size". The API only takes lowercase kebab-case, and the code is what
 * storefront filters key on, so the suggestion follows that rule exactly
 * rather than leaving the admin to guess it.
 */
export function toAttributeCode(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
