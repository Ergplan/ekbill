import strings from '@ekbill/design/copy/strings.json';

/**
 * The dictionary. One file, two registers: the app speaks Hinglish in Latin
 * script (hi-Latn) by default, English on request. Keys are the contract;
 * Stage 1 adds every key the approved screens need, Stage 9 merges the MVP's.
 */
export type Locale = 'hi-Latn' | 'en';

type Entry = { 'hi-Latn': string; en: string };
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

export function t(key: string, params?: Record<string, string | number>, locale: Locale = 'hi-Latn'): string {
  const entry = DICTIONARY[key];
  if (!entry) return key;
  return fill(entry[locale] ?? entry['hi-Latn'], params);
}
