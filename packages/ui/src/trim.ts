/**
 * The pixel arithmetic behind the signature pad, kept pure so the trimming
 * is tested on fixture strokes without a canvas: the bounds of what was
 * drawn, and the scale that brings a PNG under its byte cap.
 */
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The box around every pixel whose alpha is above `threshold`, padded by `pad` and clamped to the image; null when nothing was drawn. */
export function alphaBounds(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  { threshold = 10, pad = 8 }: { threshold?: number; pad?: number } = {},
): Bounds | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (data[row + x * 4 + 3]! > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const x = Math.max(0, minX - pad);
  const y = Math.max(0, minY - pad);
  return { x, y, width: Math.min(width, maxX + 1 + pad) - x, height: Math.min(height, maxY + 1 + pad) - y };
}

/** The bytes a base64 data URL carries. */
export function dataUrlBytes(dataUrl: string): number {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

/** The next scale to try when a PNG is over its cap: four fifths each time, never below a tenth. */
export function nextScale(scale: number): number | null {
  const next = Math.round(scale * 0.8 * 1000) / 1000;
  return next < 0.1 ? null : next;
}
