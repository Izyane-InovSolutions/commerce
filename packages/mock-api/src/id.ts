/**
 * Derives a stable UUID from a name.
 *
 * Seed data needs identifiers that survive a restart and read meaningfully in
 * source (`id('sku:DESK-OAK-140')`), so ids are derived from their name rather
 * than generated randomly or written out by hand.
 */
export function id(name: string): string {
  let hash = 0x811c9dc5;
  const bytes: number[] = [];

  for (let index = 0; index < 16; index += 1) {
    for (let position = 0; position < name.length; position += 1) {
      hash ^= name.charCodeAt(position) + index;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    bytes.push(hash & 0xff);
  }

  // Stamp the version (4) and variant bits so the value is a well-formed UUID.
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}
