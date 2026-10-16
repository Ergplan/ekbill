import sharp from 'sharp';

/**
 * The photo as the model sees it (Stage 7): turned upright by its EXIF
 * orientation, at most 2000 px on its longer side (never enlarged), JPEG at
 * quality 85, the EXIF itself dropped (a phone's GPS stays on the phone).
 * A file that is not an image throws NotAPhotoError.
 */
export const MAX_SIDE = 2000;

export class NotAPhotoError extends Error {
  constructor(cause: unknown) {
    super('not a photo that can be read', { cause });
    this.name = 'NotAPhotoError';
  }
}

export async function normalisePhoto(bytes: Uint8Array): Promise<{ jpeg: Buffer; width: number; height: number }> {
  try {
    const { data, info } = await sharp(Buffer.from(bytes), { failOn: 'error' })
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { jpeg: data, width: info.width, height: info.height };
  } catch (error) {
    throw new NotAPhotoError(error);
  }
}
