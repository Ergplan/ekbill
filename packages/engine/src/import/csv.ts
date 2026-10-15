/**
 * Rows of a CSV the way a spreadsheet exports it: commas (or semicolons or
 * tabs, whichever the header uses most), double quotes around a cell that
 * holds one, "" for a quote inside. A BOM and blank lines are dropped;
 * cells are trimmed. Pure, so the engine reads a party list without a
 * library.
 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const firstLine = src.split('\n', 1)[0] ?? '';
  const counts = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length - 1] as const);
  const delimiter = counts.sort((a, b) => b[1] - a[1])[0]![1] > 0 ? counts[0]![0] : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
      continue;
    }
    if (ch === '"' && cell.trim() === '') {
      quoted = true;
      cell = '';
    } else if (ch === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n') {
      row.push(cell.trim());
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}
