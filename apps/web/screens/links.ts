/** Keep the prototype's role view (?as=) on an internal link, whatever the link already carries. */
export function withAs(href: string, as: string | null | undefined): string {
  if (!as) return href;
  return `${href}${href.includes('?') ? '&' : '?'}as=${as}`;
}
