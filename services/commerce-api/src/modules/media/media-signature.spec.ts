import { contentMatchesMediaType, sniffMediaType } from './media-signature';

function bytes(...parts: (number[] | string | Buffer)[]): Buffer {
  return Buffer.concat(
    parts.map((part) =>
      typeof part === 'string'
        ? Buffer.from(part, 'latin1')
        : Buffer.from(part),
    ),
  );
}

function riffSize(size: number): number[] {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(size);
  return [...buffer];
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10], 'JFIF', [0x00]);
const PNG = bytes(PNG_MAGIC, [0x00, 0x00, 0x00, 0x0d], 'IHDR', [0, 0, 0, 1]);
const WEBP_BODY = bytes('WEBP', 'VP8 ', [0x00, 0x00, 0x00, 0x00]);
const WEBP = bytes('RIFF', riffSize(WEBP_BODY.length), WEBP_BODY);
const PDF = bytes('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n');

describe('sniffMediaType', () => {
  it.each([
    ['image/jpeg', JPEG],
    ['image/png', PNG],
    ['image/webp', WEBP],
    ['application/pdf', PDF],
  ])('recognises %s', (type, body) => {
    expect(sniffMediaType(body)).toBe(type);
  });

  it.each([
    ['JFIF', 0xe0],
    ['Exif', 0xe1],
    ['a bare quantisation table', 0xdb],
    ['Adobe', 0xee],
  ])('recognises a JPEG that opens with %s', (_label, marker) => {
    expect(sniffMediaType(bytes([0xff, 0xd8, 0xff, marker]))).toBe(
      'image/jpeg',
    );
  });

  it.each(['VP8L', 'VP8X'])(
    'recognises a WebP whose first chunk is %s',
    (chunk) => {
      const body = bytes('WEBP', chunk, [0, 0, 0, 0]);
      expect(sniffMediaType(bytes('RIFF', riffSize(body.length), body))).toBe(
        'image/webp',
      );
    },
  );

  it('recognises a PDF 2.0 header', () => {
    expect(sniffMediaType(bytes('%PDF-2.0\n'))).toBe('application/pdf');
  });

  it('works on a Uint8Array view into a larger buffer', () => {
    const backing = Buffer.concat([Buffer.alloc(3), WEBP]);
    expect(sniffMediaType(backing.subarray(3))).toBe('image/webp');
  });

  describe('empty and truncated input', () => {
    it('rejects an empty buffer', () => {
      expect(sniffMediaType(Buffer.alloc(0))).toBeNull();
    });

    it.each([
      ['JPEG', JPEG, 3],
      ['PNG signature only', PNG, 8],
      ['PNG without the full IHDR type', PNG, 15],
      ['WebP', WEBP, 15],
      ['PDF', PDF, 7],
    ])('rejects a truncated %s', (_label, body, length) => {
      expect(sniffMediaType(body.subarray(0, length))).toBeNull();
    });

    it('rejects a WebP shorter than its RIFF header declares', () => {
      const body = bytes('WEBP', 'VP8 ', [0, 0, 0, 0]);
      expect(
        sniffMediaType(bytes('RIFF', riffSize(body.length + 100), body)),
      ).toBeNull();
    });

    it('tolerates trailing bytes after a WebP RIFF body', () => {
      expect(sniffMediaType(Buffer.concat([WEBP, Buffer.alloc(2)]))).toBe(
        'image/webp',
      );
    });
  });

  describe('lookalikes and disallowed formats', () => {
    it.each([
      ['GIF', bytes('GIF89a', [0x01, 0x00, 0x01, 0x00])],
      ['SVG', bytes('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
      ['HTML', bytes('<!doctype html><html></html>')],
      ['a ZIP archive', bytes([0x50, 0x4b, 0x03, 0x04], 'rest-of-zip...')],
      ['plain text', bytes('just some text that is long enough')],
      [
        'a RIFF WAV file',
        bytes('RIFF', riffSize(8), 'WAVE', 'fmt ', [0, 0, 0, 0]),
      ],
      [
        'a PNG signature whose first chunk is not IHDR',
        bytes(PNG_MAGIC, [0, 0, 0, 0], 'tEXt'),
      ],
      [
        'FF D8 FF followed by a non-marker byte',
        bytes([0xff, 0xd8, 0xff, 0x00]),
      ],
      ['a %PDF- header with no version', bytes('%PDF-x.y\n\n')],
      [
        'a RIFF WEBP container with an unknown first chunk',
        bytes('RIFF', riffSize(8), 'WEBP', 'ABCD'),
      ],
    ])('rejects %s', (_label, body) => {
      expect(sniffMediaType(body)).toBeNull();
    });

    it('does not find a PDF header that is not at the very start', () => {
      // A PNG that carries "%PDF-" a few bytes in would open in a lenient
      // PDF reader; the header must be anchored at offset 0.
      expect(sniffMediaType(bytes([0x20, 0x0a], PDF))).toBeNull();
    });

    it('sniffs a PNG with a PDF appended as the PNG it starts as', () => {
      expect(sniffMediaType(Buffer.concat([PNG, PDF]))).toBe('image/png');
    });
  });
});

describe('contentMatchesMediaType', () => {
  it('accepts content matching its declared type', () => {
    expect(contentMatchesMediaType(PNG, 'image/png')).toBe(true);
    expect(contentMatchesMediaType(PDF, 'application/pdf')).toBe(true);
  });

  it('rejects a PNG declared as a JPEG', () => {
    expect(contentMatchesMediaType(PNG, 'image/jpeg')).toBe(false);
  });

  it('rejects a JPEG declared as a PDF', () => {
    expect(contentMatchesMediaType(JPEG, 'application/pdf')).toBe(false);
  });

  it('rejects HTML declared as an image', () => {
    expect(
      contentMatchesMediaType(bytes('<html><script></script>'), 'image/webp'),
    ).toBe(false);
  });

  it('rejects allowed content declared as a type that is not allowed', () => {
    expect(contentMatchesMediaType(PNG, 'image/svg+xml')).toBe(false);
  });

  it('rejects empty content whatever it claims to be', () => {
    expect(contentMatchesMediaType(Buffer.alloc(0), 'image/png')).toBe(false);
  });
});
