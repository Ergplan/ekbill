import { DEFAULT_LOCALE, translate, type Locale } from './dictionary';

export * from './dictionary';

/**
 * The server components' entry ("react-server"): no React context there, so the locale is passed. Screens are client
 * components and read it from the provider; a server component or a loader that makes text passes the viewer's.
 */
export function t(key: string, params?: Record<string, string | number>, locale: Locale = DEFAULT_LOCALE): string {
  return translate(key, params, locale);
}
