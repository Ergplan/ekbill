/**
 * Docling: its Markdown back into lines, and the worker's reader sending a
 * photo to it. Salvaged from the MVP's tests/unit/docling.test.ts (tag
 * mvp-final); the reader no longer returns the text it read (the import
 * keeps only what it found), so that one assertion is dropped.
 */
import { readFileSync } from 'node:fs';
import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { readFile } from '../../apps/worker/src/import/read-file';
import { readBill } from '../../packages/engine/src/import/bill-text';
import { markdownToLines, markdownToPages } from '../../packages/engine/src/import/markdown-lines';

const md = readFileSync(new URL('../fixtures/import/tally-invoice.docling.md', import.meta.url)).toString();
const owner = { gstin: '27AAPFU0939F1ZV', phone: '9822012345', name: 'Sharma Electricals' };
// The first bytes of a JPEG are enough for the importer to call it a photo.
const photo = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);

describe('Docling Markdown to lines', () => {
  it('keeps table cells apart the way the text layer keeps columns', () => {
    expect(markdownToLines('| Invoice No. | INV-7 | Dated | 1-Jan-2026 |\n|---|---|---|---|')).toEqual([
      'Invoice No.  INV-7  Dated  1-Jan-2026',
    ]);
  });

  it('drops headings marks, bold, image placeholders and table rules', () => {
    expect(markdownToLines('## TAX INVOICE\n\n**Buyer (Bill to)**\n<!-- image -->\n|---|---|')).toEqual([
      'TAX INVOICE',
      'Buyer (Bill to)',
    ]);
  });

  it('collapses a merged cell Docling repeated across columns', () => {
    expect(markdownToLines('| Grand Total | Grand Total | 7,316.00 |')).toEqual(['Grand Total  7,316.00']);
  });

  it('splits pages on the placeholder and drops empty ones', () => {
    expect(markdownToPages('a\n<!-- page-break -->\n\n<!-- page-break -->\nb')).toEqual(['a', 'b']);
  });

  it('gives the bill reader what it needs from a photographed Tally invoice', () => {
    const [first] = markdownToPages(md);
    const c = readBill(first!, owner)!;
    expect(c.name).toBe('Green Park Co-operative Housing Society');
    expect(c.gstin).toBe('27AABCG1234H1ZZ');
    expect(c.phone).toBe('9876543210');
    expect(c.bill).toEqual({ number: 'INV/2025-26/042', date: '2025-09-12', totalPaise: 731600 });
  });
});

describe('reading a photo', () => {
  let server: Server;
  let url = '';
  let answer: (res: ServerResponse, form: string) => void = () => undefined;
  const seen: string[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        seen.push(`${req.method} ${req.url}`);
        answer(res, body);
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));
  afterEach(() => {
    delete process.env.DOCLING_URL;
    seen.length = 0;
  });

  it('is refused with a sentence when Docling is not set up', async () => {
    const r = await readFile('bill.jpg', photo, owner);
    expect(r.problem).toBe('scanned');
    expect(r.customers).toHaveLength(0);
  });

  it('goes to Docling with OCR forced, and the customer comes back', async () => {
    process.env.DOCLING_URL = url;
    let form = '';
    answer = (res, body) => {
      form = body;
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({ document: { filename: 'bill.jpg', md_content: md }, status: 'success', processing_time: 4.2 }),
      );
    };
    const r = await readFile('bill.jpg', photo, owner);
    expect(seen).toEqual(['POST /v1/convert/file']);
    expect(form).toMatch(/name="force_ocr"\r\n\r\ntrue/);
    expect(form).toMatch(/name="md_page_break_placeholder"\r\n\r\n<!-- page-break -->/);
    expect(r.reader).toBe('docling');
    expect(r.problem).toBeNull();
    expect(r.customers.map((c) => c.name)).toEqual(['Green Park Co-operative Housing Society']);
  });

  it('says so when Docling fails, rather than claiming there was nobody', async () => {
    process.env.DOCLING_URL = url;
    answer = (res) => {
      res.statusCode = 500;
      res.end('boom');
    };
    const r = await readFile('bill.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]), owner);
    expect(r.problem).toBe('ocr-failed');
  });

  it('says so when Docling read the photo but it held no bill', async () => {
    process.env.DOCLING_URL = url;
    answer = (res) => {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          document: { md_content: '## Menu\n\nChai 10\n\nSamosa 15\n\nThank you, visit again' },
          status: 'success',
        }),
      );
    };
    const r = await readFile('menu.jpg', photo, owner);
    expect(r.reader).toBe('docling');
    expect(r.problem).toBe('unrecognised');
  });
});

describe('the worker reads the import fixtures (Stage 5)', () => {
  const owner = { gstin: '27AAPFU0939F1ZV', phone: '9822012345', name: 'Sharma Electricals' };
  const file = (name: string) => new Uint8Array(readFileSync(new URL(`../fixtures/import/${name}`, import.meta.url)));
  const noDocling = { url: null, apiKey: null, timeoutMs: 1000, ocrLanguages: [] };

  it('one customer from the PDF text layer', async () => {
    const r = await readFile('tally-invoice.pdf', file('tally-invoice.pdf'), owner, { docling: noDocling });
    expect(r).toMatchObject({ kind: 'pdf', reader: 'text', pages: 1, found: 1, problem: null });
    expect(r.customers[0]).toMatchObject({
      name: 'Green Park Co-operative Housing Society',
      gstin: '27AABCG1234H1ZZ',
      phone: '9876543210',
      bill: { number: 'INV/2025-26/042', date: '2025-09-12', totalPaise: 731600 },
    });
  });

  it('every row of the CSV as read (the repeated one folds when the import is recorded)', async () => {
    const r = await readFile('parties.csv', file('parties.csv'), owner, { docling: noDocling });
    expect(r).toMatchObject({ kind: 'csv', reader: 'sheet', found: 4, problem: null });
    expect(r.customers.map((c) => c.name)).toEqual([
      'Rathi Agro Industries',
      'Pawar Dairy',
      'Mehta Traders',
      'Pawar Dairy',
    ]);
    expect(r.customers[0]).toMatchObject({
      gstin: '27AADCR7788P1ZA',
      pan: 'AADCR7788P',
      stateCode: '27',
      city: 'Nagpur',
    });
  });

  it('refuses what it cannot read, and says which', async () => {
    expect(
      (await readFile('notes.docx', new Uint8Array([0x50, 0x4b, 3, 4]), owner, { docling: noDocling })).problem,
    ).toBe('unsupported');
    expect(
      (await readFile('big.csv', new Uint8Array(8 * 1024 * 1024 + 1), owner, { docling: noDocling })).problem,
    ).toBe('too-big');
  });
});

// Stage 11 review: one file that could not be parsed threw out of the reading, and every other file's customers
// were lost with it. It is now that file's own problem.
describe('a file that cannot be read', () => {
  const owner = { gstin: null, pan: null, phone: null, name: 'Sharma Electricals' };
  it('is "unrecognised", and the import goes on', async () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    for (const [name, bytes] of [
      ['bill.pdf', enc('<html><body>not a pdf</body></html>')],
      ['cut.pdf', enc('%PDF-1.4\n1 0 obj')],
      ['grahak.xlsx', enc('PK\u0003\u0004 not really a workbook')],
    ] as const) {
      const r = await readFile(name, bytes, owner, { docling: { url: null } as never });
      expect({ name, problem: r.problem, found: r.found }).toEqual({ name, problem: 'unrecognised', found: 0 });
    }
  });
});

describe('a workbook that unpacks to gigabytes (a zip bomb) is too big, not read (Stage 5 review)', () => {
  it('is refused before its bytes are made, as too-big', async () => {
    const { zipSync } = await import('fflate');
    const { XLSX_MAX_INFLATED, XlsxTooBigError, readXlsx } = await import('../../apps/worker/src/import/xlsx');
    // A few hundred kilobytes that would inflate to more than the limit.
    const bomb = zipSync({ 'xl/worksheets/sheet1.xml': new Uint8Array(XLSX_MAX_INFLATED + 1024 * 1024) }, { level: 9 });
    expect(bomb.length).toBeLessThan(1_000_000);
    expect(() => readXlsx(bomb)).toThrow(XlsxTooBigError);
    const r = await readFile('parties.xlsx', bomb, owner);
    expect(r.problem).toBe('too-big');
  });
});
