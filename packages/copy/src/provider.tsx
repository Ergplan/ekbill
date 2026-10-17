'use client';

import type { ReactNode } from 'react';

import { LocaleContext, setBrowserLocale } from './index';
import type { Locale } from './dictionary';

/** The person's language for every screen below it (the root layout renders it with the cookie's language). */
export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  if (typeof window !== 'undefined') setBrowserLocale(locale);
  return <LocaleContext value={locale}>{children}</LocaleContext>;
}
