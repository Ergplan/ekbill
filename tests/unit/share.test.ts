import { afterEach, describe, expect, it, vi } from 'vitest';

import { handoffToWhatsApp } from '../../apps/web/screens/share';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the WhatsApp hand-off (I9)', () => {
  it('reports the sheet as shared when it resolves', async () => {
    vi.stubGlobal('navigator', { share: vi.fn().mockResolvedValue(undefined) });
    expect(await handoffToWhatsApp({ text: 'hi' })).toBe('shared');
  });
  it('reports cancelled only when the owner dismissed the sheet', async () => {
    vi.stubGlobal('navigator', {
      share: vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'AbortError' })),
    });
    expect(await handoffToWhatsApp({ text: 'hi' })).toBe('cancelled');
  });
  it('counts the wa.me tab as opened when the browser returns it, and cuts its opener by hand', async () => {
    vi.stubGlobal('navigator', {});
    const tab = { opener: {} as unknown };
    const open = vi.fn().mockReturnValue(tab);
    vi.stubGlobal('window', { open });
    expect(await handoffToWhatsApp({ text: 'Namaste' })).toBe('opened');
    // Not the 'noopener' feature: with it window.open returns null even when the tab opened, so a blocked popup
    // could not be told from a success.
    expect(open).toHaveBeenCalledWith('https://wa.me/?text=Namaste', '_blank');
    expect(tab.opener).toBeNull();
  });
  it('reports cancelled when the browser blocked the popup', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('window', { open: vi.fn().mockReturnValue(null) });
    expect(await handoffToWhatsApp({ text: 'hi' })).toBe('cancelled');
  });
  it('opens the customer’s own chat when their number is known', async () => {
    vi.stubGlobal('navigator', {});
    const open = vi.fn().mockReturnValue(null);
    vi.stubGlobal('window', { open });
    await handoffToWhatsApp({ text: 'hi', phone: '98765 43210' });
    expect(open.mock.calls[0]?.[0]).toBe('https://wa.me/919876543210?text=hi');
  });
});
