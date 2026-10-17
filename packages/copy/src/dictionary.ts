import strings from '@ekbill/design/copy/strings.json';

/**
 * The dictionary, without React: the keys, the five registers and the lookup. The app speaks Hinglish in Latin
 * script (hi-Latn) by default; English, Hindi (Devanagari), Marathi and Tamil on the person's choice. The bill itself
 * is English (invoice.*, rule 16).
 */
export const LOCALES = ['hi-Latn', 'en', 'hi', 'mr', 'ta'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'hi-Latn';

/** Each language in its own words and script, for the picker. */
export const LOCALE_NAMES: Record<Locale, string> = {
  'hi-Latn': 'Hinglish',
  en: 'English',
  hi: 'हिन्दी',
  mr: 'मराठी',
  ta: 'தமிழ்',
};

/** The BCP 47 tag for <html lang> (screen readers, fonts, hyphenation). */
export function htmlLang(locale: Locale): string {
  return locale === 'en' ? 'en-IN' : locale;
}

/** A stored or cookie value as a locale; anything else is the default. */
export function localeOf(value: string | null | undefined): Locale {
  return (LOCALES as readonly string[]).includes(value ?? '') ? (value as Locale) : DEFAULT_LOCALE;
}

type Entry = Partial<Record<Locale, string>>;
type Dictionary = Record<string, Entry>;

const DICTIONARY = Object.fromEntries(
  Object.entries(strings as Record<string, unknown>).filter(([k]) => !k.startsWith('_')),
) as Dictionary;

export type CopyKey = keyof typeof DICTIONARY & string;

export function copyKeys(): string[] {
  return Object.keys(DICTIONARY);
}

/** Fill {placeholders}. A missing value leaves the placeholder visible, which is a bug you can see. */
function fill(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

/**
 * The key whose Hinglish is this text, among keys starting with `prefix`: the screens' tours are written in Hinglish
 * in their manifests (the flow's source) and translated here by their words (tests/unit/copy.test.ts holds every
 * line to a key).
 */
let bySource: Map<string, string> | null = null;
export function sourceKey(text: string, prefix: string): string | null {
  bySource ??= new Map(
    Object.entries(DICTIONARY)
      .filter(([k, e]) => k.startsWith('tour.') && e['hi-Latn'])
      .map(([k, e]) => [e['hi-Latn']!, k]),
  );
  const key = bySource.get(text);
  return key && key.startsWith(prefix) ? key : null;
}

/** A key in a locale; a register that is missing falls back to Hinglish, then English (the bill's keys). */
export function translate(key: string, params: Record<string, string | number> | undefined, locale: Locale): string {
  const entry = DICTIONARY[key];
  if (!entry) return key;
  return fill(entry[locale] ?? entry['hi-Latn'] ?? entry.en ?? key, params);
}
