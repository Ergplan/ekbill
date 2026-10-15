// Generates tests/fixtures/v2.json for the Stage 1 prototype. Money in paise, dates ISO.
import { writeFileSync } from 'node:fs';
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function gstin(state, pan) {
  const first14 = `${state}${pan}1Z`;
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const v = ALPHABET.indexOf(first14[i]);
    const p = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return first14 + ALPHABET[(36 - (sum % 36)) % 36];
}
const today = '2026-10-15';
const businesses = [
  {
    id: 'sharma',
    name: 'Sharma Electricals',
    ownerName: 'Sharma ji',
    pan: 'AAAAA0000A',
    gstin: gstin('27', 'AAAAA0000A'),
    registration: 'regular',
    turnoverBand: '40l-1.5cr',
    irn: false,
    phone: '+919822012345',
    upi: 'sharma@upi',
    bank: { name: 'Bank of Maharashtra', account: 'XXXX4321', ifsc: 'MAHB0000123' },
    address: '12, Dharampeth',
    city: 'Nagpur',
    stateCode: '27',
    stateName: 'Maharashtra',
    series: [
      { prefix: 'INV', next: 45 },
      { prefix: 'AMC', next: 7 },
    ],
    look: { logo: true, signature: true, design: 'classic', colour: 'narangi', paper: 'A4', share: 'pdf' },
    theme: 'narangi',
    lang: 'hi-Latn',
    voiceOnArrival: true,
    gstDefaultRate: 18,
  },
  {
    id: 'gupta',
    name: 'Gupta Kirana',
    ownerName: 'Gupta ji',
    pan: 'BBBBB1111B',
    gstin: gstin('27', 'BBBBB1111B'),
    registration: 'composition',
    turnoverBand: '40l-1.5cr',
    irn: false,
    phone: '+919822000004',
    upi: 'guptakirana@upi',
    bank: null,
    address: 'Shop 4, Sitabuldi',
    city: 'Nagpur',
    stateCode: '27',
    stateName: 'Maharashtra',
    series: [{ prefix: 'BOS', next: 23 }],
    look: { logo: false, signature: true, design: 'simple', colour: 'harmony', paper: '80mm', share: 'jpg' },
    theme: 'harmony',
    lang: 'hi-Latn',
    voiceOnArrival: false,
    gstDefaultRate: null,
  },
];
const people = [
  { id: 'sharma', name: 'Sharma ji', phone: '+919822012345', business: 'sharma', role: 'owner' },
  { id: 'ravi', name: 'Ravi', phone: '+919822000002', business: 'sharma', role: 'staff' },
  { id: 'meera', name: 'Meera (CA)', phone: '+919822000003', business: 'sharma', role: 'accountant' },
  { id: 'gupta', name: 'Gupta ji', phone: '+919822000004', business: 'gupta', role: 'owner' },
  { id: 'new', name: 'Naya owner', phone: '+919822000005', business: null, role: 'owner' },
];
const C = (id, business, name, contact, extra = {}) => ({
  id,
  business,
  name,
  contact,
  phone: null,
  gstin: null,
  pan: null,
  stateCode: '27',
  stateName: 'Maharashtra',
  lang: 'hi-Latn',
  notes: null,
  ...extra,
});
const customers = [
  C('mehta', 'sharma', 'Mehta Traders', 'Mehta', {
    phone: '+919822100001',
    gstin: gstin('27', 'AAPFU0939F'),
    pan: 'AAPFU0939F',
  }),
  C('priya', 'sharma', 'Priya Boutique', 'Priya', { phone: '+919822100002', stateCode: null, stateName: null }),
  C('kulkarni', 'sharma', 'Dr. Kulkarni', 'Kulkarni', {
    phone: '+919822100003',
    notes: 'Clinic, Dhantoli. Evening visits.',
  }),
  C('greenpark', 'sharma', 'Green Park Society', 'Patil', {
    phone: '+919822100004',
    gstin: gstin('27', 'AABCG1234H'),
    pan: 'AABCG1234H',
  }),
  C('joshi', 'sharma', 'Joshi Builders', 'Joshi', {
    phone: '+919822100005',
    gstin: gstin('27', 'AAACJ5678K'),
    pan: 'AAACJ5678K',
  }),
  C('sunrise', 'sharma', 'Sunrise School', 'Principal', { phone: '+919822100006', lang: 'en' }),
  C('bansal', 'sharma', 'Bansal Agencies', 'Bansal', {
    phone: '+919822100007',
    gstin: gstin('23', 'AAFCB9012L'),
    pan: 'AAFCB9012L',
    stateCode: '23',
    stateName: 'Madhya Pradesh',
  }),
  C('deshmukh', 'sharma', 'Deshmukh ji', 'Deshmukh', { phone: '+919822100008' }),
  C('cafe', 'sharma', 'Cafe Nagpur', 'Rohan', { phone: '+919822100009' }),
  C('apte', 'sharma', 'Apte Hospital', 'Admin', {
    phone: '+919822100010',
    gstin: gstin('27', 'AABCA3456M'),
    pan: 'AABCA3456M',
    lang: 'en',
  }),
  C('verma', 'sharma', 'Verma Textiles', 'Verma', { phone: '+919822100011' }),
  C('shinde', 'sharma', 'Shinde Garage', 'Shinde', { phone: '+919822100012' }),
  C('mishra', 'gupta', 'Mishra ji', 'Mishra', { phone: '+919822200001' }),
  C('hostel', 'gupta', 'Nehru Hostel Mess', 'Warden', { phone: '+919822200002' }),
  C('tiffin', 'gupta', 'Anna Tiffin', 'Anna', { phone: '+919822200003' }),
];
const items = [
  { id: 'amc', business: 'sharma', name: 'AMC visit', hsn: '998719', unit: 'visit', ratePaise: 350000, gstRate: 18 },
  {
    id: 'fan',
    business: 'sharma',
    name: 'Ceiling fan install',
    hsn: '995461',
    unit: 'nos',
    ratePaise: 135000,
    gstRate: 18,
  },
  {
    id: 'wiring',
    business: 'sharma',
    name: 'Wiring (per point)',
    hsn: '995461',
    unit: 'point',
    ratePaise: 65000,
    gstRate: 18,
  },
  { id: 'rice', business: 'gupta', name: 'Rice 25kg', hsn: '1006', unit: 'bag', ratePaise: 165000, gstRate: null },
  {
    id: 'oil',
    business: 'gupta',
    name: 'Groundnut oil 15L',
    hsn: '1508',
    unit: 'tin',
    ratePaise: 240000,
    gstRate: null,
  },
];
let seq = 0;
const bills = [];
function bill({
  business,
  series,
  number,
  customer,
  date,
  lines,
  status,
  paidPaise,
  paidOn,
  method,
  gst = true,
  cancelledReason,
  creditNote,
  waStatus = 'read',
}) {
  const subtotal = lines.reduce((s, l) => s + Math.round(l.qty * l.ratePaise), 0);
  const gstPaise = gst ? lines.reduce((s, l) => s + Math.round((l.qty * l.ratePaise * (l.gstRate ?? 0)) / 100), 0) : 0;
  const total = subtotal + gstPaise;
  const paid = status === 'paid' ? total : (paidPaise ?? 0);
  seq += 1;
  bills.push({
    id: `b${seq}`,
    business,
    series,
    number,
    customer,
    date,
    lines: lines.map((l) => ({ ...l, amountPaise: Math.round(l.qty * l.ratePaise) })),
    subtotalPaise: subtotal,
    gstPaise,
    totalPaise: total,
    status,
    paidPaise: paid,
    duePaise: status === 'cancelled' ? 0 : total - paid,
    paidOn: paidOn ?? null,
    method: method ?? null,
    cancelledReason: cancelledReason ?? null,
    creditNote: creditNote ?? null,
    waStatus,
    kind: gst ? 'tax-invoice' : 'bill-of-supply',
  });
}
const L = (what, qty, ratePaise, gstRate = 18) => ({ what, qty, ratePaise, gstRate });
// Sharma: Jul–Oct 2026, both series, every state. Oct has 4 sent so far.
bill({
  business: 'sharma',
  series: 'INV',
  number: 'INV-031',
  customer: 'mehta',
  date: '2026-07-25',
  lines: [L('AMC visit — July', 1, 350000), L('Ceiling fan install', 2, 135000)],
  status: 'paid',
  paidOn: '2026-07-30',
  method: 'upi',
});
bill({
  business: 'sharma',
  series: 'INV',
  number: 'INV-032',
  customer: 'joshi',
  date: '2026-07-28',
  lines: [L('Wiring (per point)', 40, 65000)],
  status: 'paid',
  paidOn: '2026-08-12',
  method: 'bank',
});
bill({
  business: 'sharma',
  series: 'AMC',
  number: 'AMC-004',
  customer: 'sunrise',
  date: '2026-08-02',
  lines: [L('AMC visit — August', 1, 350000)],
  status: 'paid',
  paidOn: '2026-08-05',
  method: 'cash',
});
bill({
  business: 'sharma',
  series: 'INV',
  number: 'INV-033',
  customer: 'apte',
  date: '2026-08-06',
  lines: [L('Panel repair', 1, 1200000), L('Wiring (per point)', 12, 65000)],
  status: 'paid',
  paidOn: '2026-08-20',
  method: 'bank',
});
bill({
  business: 'sharma',
  series: 'INV',
  number: 'INV-034',
  customer: 'cafe',
  date: '2026-08-11',
  lines: [L('Ceiling fan install', 4, 135000)],
  status: 'cancelled',
  cancelledReason: 'Galat customer chuna',
  waStatus: 'sent',
});
bill({
  business: 'sharma',
  series: 'INV',
  number: 'INV-035',
  customer: 'cafe',
  date: '2026-08-11',
  lines: [L('Ceiling fan install', 4, 135000)],
  status: 'paid',
  paidOn: '2026-08-11',
  method: 'upi',
});
bill({
  business: 'sharma',
  series: 'INV',
  number: 'INV-036',
  customer: 'mehta',
  date: '2026-08-24',
  lines: [L('AMC visit — August', 1, 350000), L('Ceiling fan install', 2, 135000)],
  status: 'paid',
  paidOn: '2026-08-29',
  method: 'upi',
});
bill({
  business: 'sharma',
  series: 'AMC',
  number: 'AMC-005',
  customer: 'sunrise',
  date: '2026-09-02',
  lines: [L('AMC visit — September', 1, 350000)],
  status: 'paid',
  paidOn: '2026-09-04',
  method: 'cash',
});
bill({
  business: 'sharma',
  series: 'INV',
  number: 'INV-037',
  customer: 'bansal',
  date: '2026-09-05',
  lines: [L('Wiring (per point)', 30, 65000)],
  status: 'partial',
  paidPaise: 1000000,
  paidOn: '2026-09-20',
  method: 'bank',
  waStatus: 'read',
});
bill({
  business: 'sharma',
  series: 'INV',
  number: 'INV-038',
  customer: 'verma',
  date: '2026-09-10',
  lines: [L('Ceiling fan install', 6, 135000)],
  status: 'paid',
  paidOn: '2026-09-12',
  method: 'upi',
  creditNote: 'CN-001',
});
bill({
  business: 'sharma',
  series: 'INV',
  number: 'INV-039',
  customer: 'kulkarni',
  date: '2026-09-17',
  lines: [L('Clinic wiring (per point)', 4, 65000), L('Fan repair', 1, 25000)],
  status: 'due',
});
bill({
  business: 'sharma',
  series: 'INV',
  number: 'INV-040',
  customer: 'greenpark',
  date: '2026-09-12',
  lines: [L('Gate light install', 3, 200000), L('Wiring (per point)', 5, 65000)],
  status: 'due',
});
bill({
  business: 'sharma',
  series: 'INV',
  number: 'INV-041',
  customer: 'priya',
  date: '2026-09-18',
  lines: [L('Shop lighting', 1, 285000)],
  status: 'paid',
  paidOn: '2026-09-19',
  method: 'upi',
});
bill({
  business: 'sharma',
  series: 'INV',
  number: 'INV-042',
  customer: 'mehta',
  date: '2026-09-22',
  lines: [L('AMC visit — September', 1, 350000), L('Ceiling fan install', 2, 135000)],
  status: 'due',
});
bill({
  business: 'sharma',
  series: 'AMC',
  number: 'AMC-006',
  customer: 'sunrise',
  date: '2026-10-02',
  lines: [L('AMC visit — October', 1, 350000)],
  status: 'paid',
  paidOn: '2026-10-03',
  method: 'cash',
});
bill({
  business: 'sharma',
  series: 'INV',
  number: 'INV-043',
  customer: 'deshmukh',
  date: '2026-10-06',
  lines: [L('Inverter install', 1, 450000)],
  status: 'due',
  waStatus: 'sent',
});
bill({
  business: 'sharma',
  series: 'INV',
  number: 'INV-044',
  customer: 'shinde',
  date: '2026-10-12',
  lines: [L('Garage wiring (per point)', 8, 65000), L('Ceiling fan install', 1, 135000)],
  status: 'paid',
  paidOn: '2026-10-12',
  method: 'upi',
});
// Gupta (composition): bills of supply, no GST line.
bill({
  business: 'gupta',
  series: 'BOS',
  number: 'BOS-020',
  customer: 'hostel',
  date: '2026-09-28',
  lines: [L('Rice 25kg', 10, 165000, null), L('Groundnut oil 15L', 2, 240000, null)],
  status: 'paid',
  paidOn: '2026-09-30',
  method: 'bank',
  gst: false,
});
bill({
  business: 'gupta',
  series: 'BOS',
  number: 'BOS-021',
  customer: 'tiffin',
  date: '2026-10-04',
  lines: [L('Rice 25kg', 4, 165000, null)],
  status: 'due',
  gst: false,
});
bill({
  business: 'gupta',
  series: 'BOS',
  number: 'BOS-022',
  customer: 'mishra',
  date: '2026-10-11',
  lines: [L('Groundnut oil 15L', 1, 240000, null)],
  status: 'due',
  gst: false,
  waStatus: 'sent',
});
const creditNotes = [
  {
    id: 'cn1',
    business: 'sharma',
    number: 'CN-001',
    bill: 'INV-038',
    date: '2026-09-14',
    amountPaise: 135000 + 24300,
    reason: 'Ek fan wapas hua',
  },
];
const payments = bills
  .filter((b) => b.paidPaise > 0)
  .map((b, i) => ({
    id: `p${i + 1}`,
    business: b.business,
    bill: b.number,
    date: b.paidOn,
    amountPaise: b.paidPaise,
    method: b.method,
  }));
const fixture = {
  _note:
    'Stage 1 fixtures: the demo business (Sharma Electricals, regular), a composition business (Gupta Kirana), a brand-new owner, a staff member and an accountant. Money in integer paise, dates ISO. Extends design/fixtures/demo.json.',
  today,
  people,
  businesses,
  customers,
  items,
  bills,
  payments,
  creditNotes,
  photoReview: {
    customer: 'kulkarni',
    photo: '/flow-fixtures/kaccha-bill.svg',
    readAt: '2026-10-15T09:12:00+05:30',
    fields: {
      customer: { value: 'Dr. Kulkarni', confidence: 0.93 },
      date: { value: '2026-10-14', confidence: 0.88 },
      lines: [
        {
          what: { value: 'Fan repair', confidence: 0.91 },
          qty: { value: '1', confidence: 0.97 },
          rate: { value: '450', confidence: 0.72 },
        },
        {
          what: { value: 'Wiring 3 point', confidence: 0.58 },
          qty: { value: '3', confidence: 0.81 },
          rate: { value: '650', confidence: 0.35 },
        },
        {
          what: { value: '', confidence: 0, unreadable: true },
          qty: { value: '1', confidence: 0.4 },
          rate: { value: '', confidence: 0, unreadable: true },
        },
      ],
      total: { value: '2850', confidence: 0.66 },
    },
  },
  failingCheck: { customer: 'priya', check: 'state-missing' },
  gstQuarter: {
    label: 'Jul – Sep 2026',
    period: '2026-Q2',
    bills: 14,
    taxablePaise: 11240000,
    gstPaise: 1939200,
    byRate: [
      { rate: 18, taxablePaise: 9840000, cgstPaise: 885600, sgstPaise: 885600 },
      { rate: 12, taxablePaise: 1400000, cgstPaise: 84000, sgstPaise: 84000 },
    ],
    b2bBills: 6,
    b2cBills: 8,
  },
  importPreview: {
    files: ['bills-2025.pdf', 'customers.xlsx', 'IMG_2041.jpg'],
    rows: [
      { name: 'Mehta Traders', phone: '+919822100001', gstin: gstin('27', 'AAPFU0939F'), exists: true },
      { name: 'Rathi Agro', phone: '+919822300001', gstin: gstin('27', 'AADCR7788P'), exists: false },
      { name: 'Pawar Dairy', phone: '+919822300002', gstin: null, exists: false },
      { name: 'Dr. Kulkarni', phone: '+919822100003', gstin: null, exists: true },
      { name: 'Nagpur Sports Club', phone: null, gstin: gstin('27', 'AAATN4455Q'), exists: false },
    ],
  },
  ask: {
    examples: ['Mehta ka kitna baaki hai?', 'Is mahine kitne bills gaye?', 'Pichle saal Diwali pe kya rate tha?'],
    answer: {
      question: 'Mehta ka kitna baaki hai?',
      text: 'Mehta Traders se ₹6,200 baaki hain: INV-042 (22 Sep), 23 din ho gaye. Pichle do bills time pe aa gaye the.',
      sources: ['INV-042', 'INV-036', 'INV-031'],
    },
  },
  help: {
    choices: [
      { id: 'percent', title: 'Contract ka kuch percent', sub: 'Jaise 30% advance, 70% kaam ke baad' },
      { id: 'instalments', title: 'Kisht mein', sub: 'Har mahine ek bill, tay rakam' },
      { id: 'running', title: 'Running bill', sub: 'Jitna kaam hua utna, har baar' },
    ],
  },
};
writeFileSync(process.argv[2], `${JSON.stringify(fixture, null, 2)}\n`);
console.log(
  'bills',
  bills.length,
  'customers',
  customers.length,
  'gstins',
  businesses.map((b) => b.gstin),
);
