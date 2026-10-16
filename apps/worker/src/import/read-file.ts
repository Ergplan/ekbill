import type { FileReading } from '@ekbill/db';
import { importing, type ImportedCustomer } from '@ekbill/engine';

import { doclingConfig, readWithDocling, type DoclingConfig } from './docling';
import { XlsxTooBigError, readXlsx } from './xlsx';

/**
 * One uploaded file, read (Stage 5, the read-import job). Salvaged from the
 * MVP's server/import/read-file.ts (tag mvp-final): a PDF's text layer is
 * read page by page and each page that looks like a bill yields a customer;
 * a spreadsheet's header row decides the columns; a photo, a scan, or a PDF
 * whose text yields nobody goes to Docling when it runs. Without Docling the
 * screen says a photo cannot be read here rather than guessing.
 */
export const MAX_FILE_BYTES = 8 * 1024 * 1024;

export function kindOf(filename: string, bytes: Uint8Array): FileReading['kind'] {
  const head = Buffer.from(bytes.subarray(0, 8));
  if (head.subarray(0, 4).toString() === '%PDF') return 'pdf';
  if (head[0] === 0x50 && head[1] === 0x4b && /\.xlsx$/i.test(filename)) return 'xlsx';
  if (
    (head[0] === 0xff && head[1] === 0xd8) ||
    head.subarray(0, 4).toString('hex') === '89504e47' ||
    /\.(jpe?g|png|webp|tiff?|bmp|heic)$/i.test(filename)
  )
    return 'image';
  if (/\.(csv|txt|tsv)$/i.test(filename)) return 'csv';
  if (/\.pdf$/i.test(filename)) return 'pdf';
  return 'unknown';
}

export async function readFile(
  filename: string,
  bytes: Uint8Array,
  owner: importing.Owner,
  opts: { docling?: DoclingConfig } = {},
): Promise<FileReading> {
  const kind = kindOf(filename, bytes);
  const docling = opts.docling ?? doclingConfig();
  const base: FileReading = { name: filename, kind, reader: null, pages: 0, found: 0, problem: null, customers: [] };
  const done = (r: FileReading): FileReading => ({ ...r, found: r.customers.length });
  if (bytes.length > MAX_FILE_BYTES) return { ...base, problem: 'too-big' };
  // One file that cannot be read (a corrupt PDF or workbook, HTML named .pdf) is that file's problem, never the
  // whole import's (Stage 11 review: it threw, and the other nineteen files' customers were lost).
  try {
    return await readKnown(kind, filename, bytes, owner, docling, base, done);
  } catch (e) {
    // A workbook that unpacks past the limit (a zip bomb) is too big, said as such (Stage 5 review).
    return { ...base, problem: e instanceof XlsxTooBigError ? 'too-big' : 'unrecognised' };
  }
}

async function readKnown(
  kind: FileReading['kind'],
  filename: string,
  bytes: Uint8Array,
  owner: importing.Owner,
  docling: DoclingConfig,
  base: FileReading,
  done: (r: FileReading) => FileReading,
): Promise<FileReading> {
  switch (kind) {
    case 'pdf': {
      const pages = await pdfPages(bytes);
      const textChars = pages.join('').replace(/\s/g, '').length;
      const customers = billsIn(pages, owner);
      if (customers.length || !docling.url) {
        return done({
          ...base,
          pages: pages.length,
          reader: 'text',
          customers,
          problem: customers.length ? null : textChars < 40 ? 'scanned' : 'unrecognised',
        });
      }
      return done(await viaDocling(base, filename, bytes, owner, docling, textChars < 40, pages.length));
    }
    case 'image':
      if (!docling.url) return { ...base, problem: 'scanned' };
      return done(await viaDocling(base, filename, bytes, owner, docling, true, 0));
    case 'csv': {
      const { customers, unrecognised } = importing.readTable(importing.parseCsv(new TextDecoder().decode(bytes)));
      return done({ ...base, pages: 1, reader: 'sheet', customers, problem: unrecognised ? 'unrecognised' : null });
    }
    case 'xlsx': {
      const { customers, unrecognised } = importing.readTable(readXlsx(bytes));
      return done({ ...base, pages: 1, reader: 'sheet', customers, problem: unrecognised ? 'unrecognised' : null });
    }
    default:
      return { ...base, problem: 'unsupported' };
  }
}

async function viaDocling(
  base: FileReading,
  filename: string,
  bytes: Uint8Array,
  owner: importing.Owner,
  config: DoclingConfig,
  forceOcr: boolean,
  fallbackPages: number,
): Promise<FileReading> {
  try {
    const { pages } = await readWithDocling(filename, bytes, { forceOcr, config });
    const customers = billsIn(pages, owner);
    const empty = pages.join('').replace(/\s/g, '').length < 20;
    return {
      ...base,
      pages: pages.length,
      reader: 'docling',
      customers,
      problem: customers.length ? null : empty ? 'no-text' : 'unrecognised',
    };
  } catch {
    return { ...base, pages: fallbackPages, reader: 'text', problem: 'ocr-failed' };
  }
}

function billsIn(pages: string[], owner: importing.Owner): ImportedCustomer[] {
  const customers: ImportedCustomer[] = [];
  for (const page of pages) {
    const found = importing.readBill(page, owner);
    if (found) customers.push(found);
  }
  return importing.dedupeWithin(customers);
}

/**
 * The text of each page in reading order: items grouped into lines by their
 * y position, left to right, so "Bill to" and the name under it come out on
 * consecutive lines the way a person reads them.
 */
export async function pdfPages(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;
  const pages: string[] = [];
  try {
    for (let p = 1; p <= Math.min(doc.numPages, 40); p += 1) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const items = (content.items as Array<{ str?: string; transform?: number[]; width?: number }>)
        .filter((it) => typeof it.str === 'string' && Array.isArray(it.transform))
        .map((it) => ({ text: it.str!, x: it.transform![4]!, y: it.transform![5]!, w: it.width ?? 0 }))
        .filter((it) => it.text.trim());
      items.sort((a, b) => b.y - a.y || a.x - b.x);
      const lines: string[] = [];
      let current: typeof items = [];
      let lastY: number | null = null;
      for (const it of items) {
        if (lastY !== null && Math.abs(it.y - lastY) > 3) {
          lines.push(joinLine(current));
          current = [];
        }
        current.push(it);
        lastY = it.y;
      }
      if (current.length) lines.push(joinLine(current));
      pages.push(lines.join('\n'));
    }
  } finally {
    await doc.destroy();
  }
  return pages;
}

function joinLine(items: Array<{ text: string; x: number; w: number }>): string {
  let out = '';
  let end = -Infinity;
  for (const it of items) {
    // A wide gap between items is a column break: kept as a double space so a label and its value stay apart.
    if (out && it.x - end > 12) out += '  ';
    else if (out && !out.endsWith(' ') && !it.text.startsWith(' ')) out += ' ';
    out += it.text;
    end = it.x + it.w;
  }
  return out.replace(/\s+/g, ' ').trim();
}
