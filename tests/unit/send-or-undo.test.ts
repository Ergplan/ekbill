import { describe, expect, it } from 'vitest';

import { sendOrUndo } from '../../apps/web/server/send-or-undo';

describe('sendOrUndo (Stage 5 and 7 reviews)', () => {
  it('a send that works undoes nothing', async () => {
    const calls: string[] = [];
    const ok = await sendOrUndo(
      async () => calls.push('send'),
      async () => calls.push('undo'),
      () => calls.push('report'),
    );
    expect(ok).toBe(true);
    expect(calls).toEqual(['send']);
  });

  it('a failed send is undone and reported; a failed undo is reported too, and the answer is still false', async () => {
    const seen: Array<[string, string]> = [];
    const ok = await sendOrUndo(
      () => Promise.reject(new Error('queue down')),
      () => Promise.reject(new Error('db down')),
      (e, step) => seen.push([step, (e as Error).message]),
    );
    expect(ok).toBe(false);
    expect(seen).toEqual([
      ['send', 'queue down'],
      ['undo', 'db down'],
    ]);
  });
});
