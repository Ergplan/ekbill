/**
 * The key two names are compared by: case, spacing and punctuation ignored, letters of every script kept
 * (Devanagari and Tamil names keep their vowel signs). Found by the Stage 11 review: an [a-z0-9] key made every
 * non-Latin name the empty string, so an import kept one of them and silently dropped the rest, and any two
 * Hindi-named walk-ins with the same total looked like a duplicate bill. An empty key matches nothing.
 */
export function nameKey(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\(sample\)/g, '')
    .replace(/[^\p{L}\p{M}\p{N}]/gu, '');
}
