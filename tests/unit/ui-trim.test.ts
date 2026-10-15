import { describe, expect, it } from 'vitest';

import { alphaBounds, dataUrlBytes, nextScale } from '../../packages/ui/src/trim';

/** Fixture strokes on a 100×60 canvas: alpha set where the pen went. */
function canvas(width: number, height: number, strokes: Array<[number, number]>, alpha = 255) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y] of strokes) data[(y * width + x) * 4 + 3] = alpha;
  return data;
}

describe('signature trimming', () => {
  it('finds the box around the strokes with an 8-pixel margin', () => {
    const data = canvas(100, 60, [
      [20, 10],
      [21, 11],
      [50, 30],
      [60, 12],
    ]);
    expect(alphaBounds(data, 100, 60)).toEqual({ x: 12, y: 2, width: 57, height: 37 });
  });
  it('clamps the margin to the canvas when the stroke touches an edge', () => {
    const data = canvas(100, 60, [
      [0, 0],
      [99, 59],
    ]);
    expect(alphaBounds(data, 100, 60)).toEqual({ x: 0, y: 0, width: 100, height: 60 });
    expect(alphaBounds(canvas(100, 60, [[3, 4]]), 100, 60, { pad: 2 })).toEqual({ x: 1, y: 2, width: 5, height: 5 });
  });
  it('ignores the faint antialiasing halo and an untouched canvas', () => {
    expect(alphaBounds(canvas(100, 60, [[40, 20]], 8), 100, 60)).toBeNull();
    expect(alphaBounds(canvas(100, 60, []), 100, 60)).toBeNull();
    const data = canvas(100, 60, [[40, 20]]);
    data[(21 * 100 + 41) * 4 + 3] = 5; // the halo pixel does not widen the box
    expect(alphaBounds(data, 100, 60, { pad: 0 })).toEqual({ x: 40, y: 20, width: 1, height: 1 });
  });
  it('sizes a data URL and steps the scale down by four fifths until a tenth', () => {
    expect(dataUrlBytes('data:image/png;base64,AAAA')).toBe(3);
    expect(dataUrlBytes('data:image/png;base64,AAA=')).toBe(2);
    expect(nextScale(1)).toBe(0.8);
    expect(nextScale(0.8)).toBe(0.64);
    expect(nextScale(0.12)).toBeNull();
  });
});
