import { describe, expect, it } from 'vitest';

import { gstOfLines } from '../../apps/web/screens/bill/gst-lines';

/** Stage 6 review: a redo or "Pichle jaisa hi" of a bill with mixed rates came back at the first line's rate. */
describe('gstOfLines', () => {
  it('lines at different rates come back per line', () => {
    expect(gstOfLines([5, 18], 18)).toEqual({ mode: 'perline', rate: 5, perLine: [5, 18] });
  });
  it('lines at one rate come back as one rate', () => {
    expect(gstOfLines([18, 18], 5)).toEqual({ mode: 'one', rate: 18, perLine: [] });
  });
  it('a line with no rate takes the business’s default, and none at all gives the default', () => {
    expect(gstOfLines([null, 5], 18)).toEqual({ mode: 'perline', rate: 18, perLine: [18, 5] });
    expect(gstOfLines([], 12)).toEqual({ mode: 'one', rate: 12, perLine: [] });
  });
});
