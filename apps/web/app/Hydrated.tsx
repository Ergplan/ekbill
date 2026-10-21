'use client';

import { unstable_isUnrecognizedActionError } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Marks <html data-hydrated> once React is live, so the browser tests tap only when a tap can land.
 * It also makes sure the theme is on: a page Next renders after a notFound() does not run the head script.
 * And a page from an older build reloads (21 Oct: a phone that had the app open across a deploy kept the old
 * screens, and their taps went to Server Actions the new build no longer had, so nothing happened): when the phone
 * comes back to the app and the build has changed, and when a tap meets a Server Action the server does not know.
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

    let reloading = false;
    const reload = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    const mine = process.env.NEXT_PUBLIC_BUILD_STAMP;
    let asked = 0;
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !mine || Date.now() - asked < 30_000) return;
      asked = Date.now();
      void fetch('/api/build', { cache: 'no-store' })
        .then((r) => (r.ok ? (r.json() as Promise<{ builtAt?: string }>) : null))
        .then((b) => {
          if (b?.builtAt && b.builtAt !== 'unknown' && b.builtAt !== mine) reload();
        })
        .catch(() => undefined);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      if (unstable_isUnrecognizedActionError(e.reason)) reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
  return null;
}
