import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { MAX_SIDE, NotAPhotoError, normalisePhoto } from '../../apps/worker/src/read-bill/normalise';

/** Stage 7: the photo the model sees is upright, at most 2000 px, a JPEG at q85, without its EXIF. */
async function photo(width: number, height: number, orientation?: number) {
  const img = sharp({ create: { width, height, channels: 3, background: '#ffffff' } }).jpeg();
  return orientation ? img.withMetadata({ orientation }).toBuffer() : img.toBuffer();
}

describe('normalisePhoto', () => {
  it('turns a phone photo upright by its EXIF orientation and drops the EXIF', async () => {
    const sideways = await photo(400, 300, 6); // the camera held on its side: 90° clockwise to view
    const { jpeg, width, height } = await normalisePhoto(sideways);
    expect([width, height]).toEqual([300, 400]);
    const meta = await sharp(jpeg).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.orientation ?? 1).toBe(1);
    expect(meta.exif).toBeUndefined();
  });

  it('shrinks the longer side to 2000 px and never enlarges', async () => {
    const big = await normalisePhoto(await photo(4000, 3000));
    expect([big.width, big.height]).toEqual([MAX_SIDE, 1500]);
    const small = await normalisePhoto(await photo(800, 600));
    expect([small.width, small.height]).toEqual([800, 600]);
  });

  it('takes a PNG and answers a JPEG', async () => {
    const png = await sharp({ create: { width: 50, height: 40, channels: 4, background: '#00000000' } })
      .png()
      .toBuffer();
    expect((await sharp((await normalisePhoto(png)).jpeg).metadata()).format).toBe('jpeg');
  });

  it('refuses bytes that are not an image', async () => {
    await expect(normalisePhoto(new TextEncoder().encode('%PDF-1.4 not a photo'))).rejects.toBeInstanceOf(
      NotAPhotoError,
    );
  });
});
