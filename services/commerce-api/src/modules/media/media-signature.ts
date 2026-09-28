import { ALLOWED_MEDIA_TYPES } from './dto/reserve-upload.dto';

export type AllowedMediaType = (typeof ALLOWED_MEDIA_TYPES)[number];

/**
 * Identifies an upload from its leading bytes ("magic numbers") rather than
 * from the Content-Type the client sent, which multer passes through
 * untouched and so proves nothing about the content.
 *
 * Only the types ALLOWED_MEDIA_TYPES accepts are recognised; anything else —
 * including formats that are perfectly valid but not accepted, such as GIF
 * or SVG — comes back as null. Every signature below is anchored at offset
 * 0 and their first bytes differ, so at most one can ever match: a buffer is
 * never ambiguous between two allowed types.
 *
 * The checks go a little past the bare magic number where a legitimate file
 * always has more structure (PNG's IHDR chunk, WebP's VP8 chunk header,
 * JPEG's second marker, PDF's version digit). That rejects headers pasted
 * onto something else and inputs truncated to just the signature, without
 * attempting a full decode — this is a type check, not a validator.
 */
export function sniffMediaType(body: Uint8Array): AllowedMediaType | null {
  if (isJpeg(body)) return 'image/jpeg';
  if (isPng(body)) return 'image/png';
  if (isWebp(body)) return 'image/webp';
  if (isPdf(body)) return 'application/pdf';
  return null;
}

/**
 * Whether the content really is the type it was declared as. A declared type
 * outside the allowed list never matches, even when the bytes sniff as an
 * allowed type, so the caller can use this as its single gate.
 */
export function contentMatchesMediaType(
  body: Uint8Array,
  declaredType: string,
): boolean {
  const sniffed = sniffMediaType(body);
  return sniffed !== null && sniffed === declaredType;
}

// SOI (FF D8) followed by the first segment's marker. Every marker is FF
// then a byte in C0–FE (FF itself is fill, 00 is a stuffed data byte), so a
// stray FF D8 FF 00 is not a JPEG.
function isJpeg(body: Uint8Array): boolean {
  return (
    body.length >= 4 &&
    body[0] === 0xff &&
    body[1] === 0xd8 &&
    body[2] === 0xff &&
    (body[3] ?? 0) >= 0xc0 &&
    (body[3] ?? 0) <= 0xfe
  );
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// The 8-byte signature, then the first chunk: a 4-byte length and its type,
// which the PNG spec requires to be IHDR.
function isPng(body: Uint8Array): boolean {
  return (
    body.length >= 16 &&
    startsWith(body, PNG_SIGNATURE) &&
    ascii(body, 12, 4) === 'IHDR'
  );
}

// RIFF container of form WEBP whose first chunk is one of the three WebP
// bitstream chunks. The RIFF size field counts everything after the first
// 8 bytes, so a body shorter than it declares has been truncated; trailing
// bytes past it are tolerated, as RIFF readers ignore them.
function isWebp(body: Uint8Array): boolean {
  if (body.length < 16) return false;
  if (ascii(body, 0, 4) !== 'RIFF' || ascii(body, 8, 4) !== 'WEBP')
    return false;
  const chunk = ascii(body, 12, 4);
  if (chunk !== 'VP8 ' && chunk !== 'VP8L' && chunk !== 'VP8X') return false;
  const riffSize = new DataView(
    body.buffer,
    body.byteOffset,
    body.byteLength,
  ).getUint32(4, true);
  return riffSize + 8 <= body.length;
}

// "%PDF-" then a major version digit and a dot. Readers such as Acrobat
// tolerate the header anywhere in the first kilobyte, but accepting that
// would let any file with "%PDF-" a few bytes in — a PNG, say — pass as a
// PDF, which is exactly the polyglot this check exists to stop.
function isPdf(body: Uint8Array): boolean {
  return (
    body.length >= 8 &&
    ascii(body, 0, 5) === '%PDF-' &&
    (body[5] ?? 0) >= 0x31 &&
    (body[5] ?? 0) <= 0x39 &&
    body[6] === 0x2e
  );
}

function startsWith(body: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((byte, index) => body[index] === byte);
}

function ascii(body: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...body.subarray(offset, offset + length));
}
