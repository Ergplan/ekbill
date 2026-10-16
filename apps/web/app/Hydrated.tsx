'use client';

import { useEffect } from 'react';

/**
 * Marks <html data-hydrated> once React is live, so the browser tests tap only when a tap can land.
 * It also makes sure the theme is on: a page Next renders after a notFound() does not run the head script.
 */
export function Hydrated() {
  useEffect(() => {
    const root = document.documentElement;
    if (!root.getAttribute('data-theme')) {
      const m = /(?:^|; )eb-theme=(narangi|harmony)/.exec(document.cookie);
      const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
      root.setAttribute('data-theme', m ? m[1]! : dark ? 'harmony' : 'narangi');
    }
    root.setAttribute('data-hydrated', '1');
  }, []);
  return null;
}
