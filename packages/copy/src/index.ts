import { createContext, use } from 'react';

import { DEFAULT_LOCALE, translate, type Locale } from './dictionary';

export * from './dictionary';

/**
 * The person's language for the screens. The root layout puts it in this context (LocaleProvider); `t()` reads it
 * while a screen renders, on the server (SSR) and in the browser. In the browser it is also kept in this module, so
 * an event handler's `t()` (an error said after a tap) speaks the same language. Server code that is not a screen
 * (a data loader, a server component) passes the locale itself: the "react-server" entry (server.ts) has no context.
 */
export const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

let browserLocale: Locale | null = null;

/** Set by LocaleProvider in the browser. */
export function setBrowserLocale(locale: Locale): void {
  browserLocale = locale;
}

function current(): Locale {
  if (typeof window !== 'undefined') {
    if (browserLocale) return browserLocale;
    const fromPage = document.documentElement.dataset.locale as Locale | undefined;
    return fromPage ?? DEFAULT_LOCALE;
  }
  // During SSR the locale comes from the LocaleProvider above the tree. `t()`
  // is also called outside render (loaders, actions), where `use` throws, so
  // it falls back to the default; server code passes the locale explicitly.
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return use(LocaleContext);
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function t(key: string, params?: Record<string, string | number>, locale?: Locale): string {
  return translate(key, params, locale ?? current());
}
