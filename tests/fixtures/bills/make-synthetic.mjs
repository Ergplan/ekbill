#!/usr/bin/env node
// Synthetic kaccha bills for Stage 7 (node tests/fixtures/bills/make-synthetic.mjs).
//
// The operator's real photos and ground truth go in tests/fixtures/bills/real/
// (<name>.jpg + <name>.json); until there are 30, these stand in. Each is a
// bill pad page drawn by Chromium (slanted, uneven, on ruled paper), saved
// as synthetic/<name>.jpg with its ground truth synthetic/<name>.json, and
// the fake model's answer fake/<sha256 of the jpg>.json (the ground truth
// with confidences, a few fields made doubtful or unreadable on purpose,
// one blurred photo and one photo of no bill). Deterministic: run it again
// and the files are the same.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'synthetic');
const FAKE = join(HERE, 'fake');
mkdirSync(OUT, { recursive: true });
mkdirSync(FAKE, { recursive: true });

// A small deterministic generator (no Math.random: the files must not change between runs).
let seed = 20261016;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = (a) => a[Math.floor(rnd() * a.length)];

const CUSTOMERS = [
  'Mehta Traders',
  'Joshi Builders',
  'Green Park Society',
  'Dr. Kulkarni',
  'Priya Boutique',
  'Deshmukh ji',
  'Shinde Garage',
  'Sunrise School',
  'Ramesh Patil',
  'Anand Kirana',
  'Sai Medical',
  'Hotel Annapurna',
  'Verma Sweets',
  'Lakshmi Tailors',
  'Gupta Hardware',
];
const ITEMS = [
  ['Fan repair', 350],
  ['Wiring work', 1200],
  ['Switch board', 450],
  ['MCB 32A', 520],
  ['LED tube 20W', 240],
  ['Ceiling fan install', 1350],
  ['Inverter service', 800],
  ['Copper wire 1.5mm', 1650],
  ['Socket 6A', 85],
  ['Labour charges', 600],
  ['Geyser repair', 950],
  ['Doorbell', 320],
  ['Extension board', 410],
  ['AMC visit', 3500],
];
const DATE_STYLES = [
  (d, m, y) => `${d}/${m}/${String(y).slice(2)}`,
  (d, m, y) => `${d}-${m}-${y}`,
  (d, m, y) => `${d}.${m}.${y}`,
  (d, m) => `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]}`,
];
const pad = (n) => String(n).padStart(2, '0');
const money = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

function makeBill(i) {
  const lines = Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => {
    const [what, base] = pick(ITEMS);
    const qty = rnd() < 0.6 ? 1 : 1 + Math.floor(rnd() * 5);
    const rate = Math.round((base * (0.8 + rnd() * 0.5)) / 10) * 10;
    return { what, qty, rate, amount: qty * rate };
  });
  const day = 1 + Math.floor(rnd() * 28);
  const month = 7 + Math.floor(rnd() * 3); // Jul–Sep 2026: within a year of the tests' today
  return {
    name: `kaccha-${pad(i + 1)}`,
    customer: pick(CUSTOMERS),
    date: `2026-${pad(month)}-${pad(day)}`,
    dateWritten: pick(DATE_STYLES)(day, month, 2026),
    lines,
    total: lines.reduce((s, l) => s + l.amount, 0),
    legible: true,
    found: true,
  };
}

function html(bill, { blur = false, menu = false } = {}) {
  const tilt = (rnd() * 4 - 2).toFixed(2);
  const ink = pick(['#1d2b6b', '#13235c', '#222', '#2a1f5f']);
  const row = (l) => {
    const r = (rnd() * 1.6 - 0.8).toFixed(2);
    return `<div class="row" style="transform:rotate(${r}deg) translateX(${Math.floor(rnd() * 10)}px)">
      <span class="w">${l.what}</span><span class="q">${l.qty}</span><span class="r">${money(l.rate)}</span><span class="a">${money(l.amount)}/-</span></div>`;
  };
  const body = menu
    ? `<h1>Shree Chai Corner</h1><div class="row">Chai ........ 10</div><div class="row">Samosa ...... 15</div><div class="row">Vada pav .... 20</div><p>Thank you, visit again</p>`
    : `<h1>Sharma Electricals</h1><div class="sub">Dharampeth, Nagpur · 98220 12345</div>
       <div class="meta"><span>To: ${bill.customer}</span><span>Date: ${bill.dateWritten}</span></div>
       <div class="row head"><span class="w">Particulars</span><span class="q">Qty</span><span class="r">Rate</span><span class="a">Amount</span></div>
       ${bill.lines.map(row).join('')}
       <div class="total">Total &nbsp; ₹ ${money(bill.total)}/-</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:#d8d2c4;}
    .page{width:760px;min-height:980px;margin:30px auto;padding:40px 50px;background:#fbf8ef;
      background-image:repeating-linear-gradient(#fbf8ef 0 38px,#b9cde6 38px 39px);
      transform:rotate(${tilt}deg);box-shadow:0 4px 18px rgba(0,0,0,.25);
      font-family:'DejaVu Sans',sans-serif;font-style:italic;color:${ink};${blur ? 'filter:blur(9px);' : ''}}
    h1{font-size:34px;margin:0 0 4px;font-style:normal;color:#8b1d1d;letter-spacing:1px}
    .sub{font-size:16px;margin-bottom:26px;color:#8b1d1d;font-style:normal}
    .meta{display:flex;justify-content:space-between;font-size:24px;margin-bottom:24px}
    .row{display:flex;font-size:25px;line-height:39px}
    .row.head{font-size:18px;font-style:normal;color:#8b1d1d;border-bottom:2px solid #8b1d1d}
    .w{flex:1}.q{width:70px;text-align:center}.r{width:110px;text-align:right}.a{width:140px;text-align:right}
    .total{margin-top:30px;text-align:right;font-size:30px;font-weight:bold}
    p{font-size:22px}
  </style></head><body><div class="page">${body}</div></body></html>`;
}

const field = (value, confidence = 0.95) => ({
  value: value === null ? null : String(value),
  confidence,
  unreadable: false,
});
const blank = { value: null, confidence: 0, unreadable: true };

function answerFor(bill, i) {
  // The fake model: right, mostly sure; a doubtful rate every 4th bill, an unreadable date every 7th.
  const doubtful = i % 4 === 2;
  return {
    legible: true,
    found: true,
    customer: field(bill.customer, i % 5 === 3 ? 0.62 : 0.93),
    date: i % 7 === 5 ? blank : field(bill.dateWritten, 0.9),
    lines: bill.lines.map((l, j) => ({
      what: field(l.what, 0.92),
      qty: field(l.qty, 0.95),
      unit: { value: null, confidence: 1, unreadable: false },
      rate: field(money(l.rate), doubtful && j === 0 ? 0.55 : 0.9),
      amount: field(`${money(l.amount)}/-`, 0.9),
    })),
    total: field(`₹ ${money(bill.total)}/-`, 0.9),
    notes: null,
  };
}

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 860, height: 1060 }, deviceScaleFactor: 1 });
const index = [];
for (let i = 0; i < 30; i += 1) {
  const bill = makeBill(i);
  await page.setContent(html(bill));
  const jpg = await page.screenshot({ type: 'jpeg', quality: 62 });
  const sha = createHash('sha256').update(jpg).digest('hex');
  const { dateWritten, ...truth } = bill;
  writeFileSync(join(OUT, `${bill.name}.jpg`), jpg);
  writeFileSync(
    join(OUT, `${bill.name}.json`),
    `${JSON.stringify({ ...truth, written: { date: dateWritten } }, null, 2)}\n`,
  );
  writeFileSync(join(FAKE, `${sha}.json`), `${JSON.stringify(answerFor(bill, i), null, 2)}\n`);
  index.push({ name: bill.name, sha256: sha });
}
// The two error states: a photo too blurred to read, and a photo of no bill.
for (const [name, opts, answer] of [
  ['blurred', { blur: true }, { legible: false }],
  ['not-a-bill', { menu: true }, { legible: true, found: false }],
]) {
  const bill = makeBill(99);
  await page.setContent(html(bill, opts));
  const jpg = await page.screenshot({ type: 'jpeg', quality: 62 });
  const sha = createHash('sha256').update(jpg).digest('hex');
  writeFileSync(join(OUT, `${name}.jpg`), jpg);
  writeFileSync(
    join(OUT, `${name}.json`),
    `${JSON.stringify({ name, legible: answer.legible, found: answer.found ?? true, customer: null, date: null, lines: [], total: null }, null, 2)}\n`,
  );
  writeFileSync(
    join(FAKE, `${sha}.json`),
    `${JSON.stringify({ found: true, customer: blank, date: blank, lines: [], total: blank, notes: null, ...answer }, null, 2)}\n`,
  );
  index.push({ name, sha256: sha });
}
writeFileSync(join(HERE, 'synthetic-index.json'), `${JSON.stringify(index, null, 2)}\n`);
await browser.close();
console.log(`synthetic: ${index.length} photos`);
