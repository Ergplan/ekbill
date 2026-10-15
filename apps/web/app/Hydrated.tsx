'use client';

import { useEffect } from 'react';

/** Marks <html data-hydrated> once React is live, so the browser tests tap only when a tap can land. */
export function Hydrated() {
  useEffect(() => {
    document.documentElement.setAttribute('data-hydrated', '1');
  }, []);
  return null;
}
