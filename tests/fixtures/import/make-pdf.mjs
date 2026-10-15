#!/usr/bin/env node
// Builds tally-invoice.pdf from tally-invoice.txt: one text line per PDF line,
// Helvetica 10 pt, uncompressed, so the worker's pdfjs reader has a real text
// layer to read. Run it again if the .txt changes:
//   node tests/fixtures/import/make-pdf.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const lines = readFileSync(join(here, 'tally-invoice.txt'), 'utf8')
  .replace(/₹/g, 'Rs.')
  .split('\n')
  .map((l) => l.replace(/\s+$/, ''));
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
const body = ['BT', '/F1 10 Tf'];
let y = 800;
for (const line of lines) {
  if (line.trim()) body.push(`1 0 0 1 40 ${y} Tm (${esc(line)}) Tj`);
  y -= 16;
}
body.push('ET');
const stream = body.join('\n');
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
  `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
];
let out = '%PDF-1.4\n';
const offsets = [];
objects.forEach((o, i) => {
  offsets.push(Buffer.byteLength(out));
  out += `${i + 1} 0 obj\n${o}\nendobj\n`;
});
const xref = Buffer.byteLength(out);
out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
writeFileSync(join(here, 'tally-invoice.pdf'), out, 'latin1');
console.log(`wrote tally-invoice.pdf (${lines.length} lines)`);
