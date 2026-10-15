import { describe, expect, it } from 'vitest';

import { FILE_LIMITS, acceptFile, base64Size, checkFile, parseDataUrl } from '../../packages/engine/src/files';

const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/** The file limits of the Stage 4 prompt: a logo or a signature ≤ 300 KB (a signature ≤ 60 KB), images only. */
describe('business files', () => {
  it('parses a data URL into its mime and bytes, and sizes it without decoding', () => {
    const p = parseDataUrl(PNG_1PX)!;
    expect(p.mime).toBe('image/png');
    expect(p.bytes.length).toBe(70);
    expect(Array.from(p.bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(base64Size(PNG_1PX)).toBe(70);
    expect(parseDataUrl('hello')).toBeNull();
    expect(parseDataUrl('data:text/plain,hi')).toBeNull();
  });
  it('holds the limits: 300 KB for a logo, 60 KB for a signature, images only', () => {
    expect(FILE_LIMITS.logo.maxBytes).toBe(307200);
    expect(FILE_LIMITS.signature.maxBytes).toBe(61440);
    expect(checkFile('logo', { mime: 'image/jpeg', size: 307200 })).toBeNull();
    expect(checkFile('logo', { mime: 'image/jpeg', size: 307201 })).toBe('too-big');
    expect(checkFile('logo', { mime: 'application/pdf', size: 10 })).toBe('mime');
    expect(checkFile('logo', { mime: 'image/png', size: 0 })).toBe('empty');
    expect(checkFile('signature', { mime: 'image/jpeg', size: 10 })).toBe('mime');
    expect(checkFile('signature', { mime: 'image/png', size: 61441 })).toBe('too-big');
  });
  it('accepts a small PNG for either kind and refuses an oversized one before decoding it', () => {
    expect(acceptFile('logo', PNG_1PX)).toMatchObject({ ok: true, mime: 'image/png' });
    expect(acceptFile('signature', PNG_1PX)).toMatchObject({ ok: true });
    const big = `data:image/png;base64,${'A'.repeat(Math.ceil((61441 * 4) / 3) + 4)}`;
    expect(acceptFile('signature', big)).toEqual({ ok: false, problem: 'too-big' });
    expect(acceptFile('logo', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toEqual({ ok: false, problem: 'mime' });
    expect(acceptFile('logo', 'not a data url')).toEqual({ ok: false, problem: 'not-a-data-url' });
  });
});
