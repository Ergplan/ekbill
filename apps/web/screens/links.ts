/** Keep the prototype's role view (?as=) on an internal link, whatever the link already carries. */
export function withAs(href: string, as: string | null | undefined): string {
  if (!as) return href;
  return `${href}${href.includes('?') ? '&' : '?'}as=${as}`;
}

/**
 * A bill's own page (and its sub-pages), by number. Numbers that carry the financial year have a slash in them
 * (INV-2026-27/001, every new business's default), so the number is one encoded path segment; the route decodes it.
 */
export function billPath(
  number: string,
  rest: '' | '/remind' | '/credit-note' = '',
  fy?: string | null,
  query?: string,
): string {
  // The year too, when known: a series without the year in its numbers starts again each April, and last year's
  // INV-001 is not this year's.
  const q = [fy ? `fy=${encodeURIComponent(fy)}` : '', query ?? ''].filter(Boolean).join('&');
  return `/bills/${encodeURIComponent(number)}${rest}${q ? `?${q}` : ''}`;
}

/** The name a bill's file is saved or shared under: the number with anything a file name cannot carry made a dash. */
export function billFileName(number: string, ext: string): string {
  return `${number.replace(/[^A-Za-z0-9._-]+/g, '-')}.${ext}`;
}

/** A path segment as it was meant: "%" alone (or any broken escape) is taken as written, never a crash. */
export function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
