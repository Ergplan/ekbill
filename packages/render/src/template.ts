import {
  amountInWords,
  findState,
  formatDateShort,
  formatMoneyIndian,
  formatPercentPlain,
  formatQuantityPlain,
  type IssuedSnapshot,
} from '@ekbill/engine';

/**
 * The bill as the customer gets it (Stage 6): three designs on A4 or A5,
 * and a one-column receipt for 80mm and 58mm counter printers. Ported from
 * the MVP's server/pdf/template.ts (tag mvp-final) onto v2's issued
 * snapshot: everything printed comes from the snapshot, never from the
 * live business or customer (I2), so re-rendering a year-old bill gives
 * the bill the customer got. The design and paper are presentation only.
 * Listed in tokens-allow.txt: the paper is deliberately not themed.
 */
export const PAPERS = ['a4', 'a5', '80mm', '58mm'] as const;
export type Paper = (typeof PAPERS)[number];
export const DESIGNS = ['classic', 'modern', 'simple'] as const;
export type Design = (typeof DESIGNS)[number];

export interface PaperSpec {
  widthMm: number;
  heightMm: number | null;
  receipt: boolean;
  widthPx: number;
}
export const PAPER: Record<Paper, PaperSpec> = {
  a4: { widthMm: 210, heightMm: 297, receipt: false, widthPx: 794 },
  a5: { widthMm: 148, heightMm: 210, receipt: false, widthPx: 559 },
  '80mm': { widthMm: 80, heightMm: null, receipt: true, widthPx: 302 },
  '58mm': { widthMm: 58, heightMm: null, receipt: true, widthPx: 219 },
};

export interface PrintInput {
  snapshot: IssuedSnapshot;
  number: string;
  dueDate?: string | null;
  look: { design: Design; paper: Paper; accent: string };
  logoDataUrl?: string | null;
  signatureDataUrl?: string | null;
  upiQrDataUrl?: string | null;
  /** Printed across the page, for a sample that must not pass for a real bill. */
  watermark?: string | null;
}

export function escapeHtml(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Only data: URLs of a few image types: a logo is the owner's upload, never markup or a URL to fetch. */
export function safeImage(dataUrl: string | null | undefined): string | null {
  if (!dataUrl) return null;
  if (!/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/.test(dataUrl)) return null;
  if (dataUrl.length > 500_000) return null;
  return dataUrl;
}

function tint(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
const stateName = (code: string | null | undefined) => (code ? (findState(code)?.name ?? code) : '');

function prepare(input: PrintInput) {
  const s = input.snapshot;
  const accent = /^#[0-9a-fA-F]{6}$/.test(input.look.accent) ? input.look.accent : '#2f4a9e';
  const lines = s.lines.filter((l) => !l.blank);
  const showGst = s.kind === 'tax-invoice' || (s.kind === 'credit-note' && s.totals.gstPaise > 0);
  const taxRows = s.totals.heads.filter((h) => h.label !== 'Round off');
  return {
    s,
    look: input.look,
    accent,
    lines,
    showGst,
    taxRows,
    logo: safeImage(input.logoDataUrl),
    signature: safeImage(input.signatureDataUrl),
    upiQr: safeImage(input.upiQrDataUrl),
    title: s.title,
    number: input.number,
    dueDate: input.dueDate ?? null,
    watermark: input.watermark ?? null,
    noGstNote:
      s.kind === 'bill-of-supply' || s.kind === 'invoice'
        ? s.legend
          ? null
          : 'No GST is charged on this bill.'
        : null,
  };
}
type Prepared = ReturnType<typeof prepare>;

export function renderBillHtml(input: PrintInput): string {
  const p = prepare(input);
  return PAPER[p.look.paper].receipt ? receiptHtml(p) : pageHtml(p);
}

function designCss(p: Prepared): string {
  const a = p.accent;
  switch (p.look.design) {
    case 'modern':
      return `
  header { background: ${a}; color: #fff; border-radius: 10px; padding: 16px 18px; margin-bottom: 16px; }
  header .muted, header .doc-meta { color: rgba(255,255,255,0.86); }
  header .doc-meta strong { color: #fff; }
  .logo { background: #fff; border-radius: 8px; padding: 6px; }
  .doc-title { color: #fff; font-size: 16pt; }
  table.items thead th { background: ${tint(a, 0.1)}; color: ${a}; border-bottom: 2px solid ${a}; }
  table.items tbody tr:nth-child(even) { background: transparent; }
  table.totals tr.grand td { background: ${a}; color: #fff; border: 0; padding: 10px 8px; }
  .party h3, .box h3 { color: ${a}; }`;
    case 'simple':
      return `
  header { border-bottom: 1px solid #111; }
  .accent, .doc-title { color: #111; }
  table.items thead th { background: none; color: #111; border-top: 1px solid #111; border-bottom: 1px solid #111; }
  table.items tbody tr:nth-child(even) { background: transparent; }
  .box { border-color: #bbb; border-radius: 0; }`;
    default:
      return `
  header { border-bottom: 2px solid ${a}; }
  .accent { color: ${a}; }
  table.items thead th { background: ${a}; color: #fff; }`;
  }
}

function pageHtml(p: Prepared): string {
  const { s } = p;
  const a5 = p.look.paper === 'a5';
  const showDiscount = p.lines.some((l) => l.discountPaise > 0);
  const rows = p.lines
    .map(
      (l, i) => `
        <tr>
          <td class="num">${i + 1}</td>
          <td><div class="desc">${escapeHtml(l.description)}</div>${l.hsnCode ? `<div class="sub">HSN/SAC ${escapeHtml(l.hsnCode)}</div>` : ''}</td>
          <td class="num">${escapeHtml(formatQuantityPlain(l.quantityMilli))}${l.unit ? ` ${escapeHtml(l.unit)}` : ''}</td>
          <td class="num">${formatMoneyIndian(l.unitPricePaise)}</td>
          ${showDiscount ? `<td class="num">${l.discountPaise ? formatMoneyIndian(l.discountPaise) : '—'}</td>` : ''}
          ${p.showGst ? `<td class="num">${escapeHtml(formatPercentPlain(l.gstBp))}%</td>` : ''}
          <td class="num">${formatMoneyIndian(l.taxablePaise)}</td>
        </tr>`,
    )
    .join('');
  const totalsRows: string[] = [];
  if (s.totals.discountPaise > 0) {
    totalsRows.push(`<tr><td>Items total</td><td class="num">${formatMoneyIndian(s.totals.grossPaise)}</td></tr>`);
    totalsRows.push(`<tr><td>Discount</td><td class="num">− ${formatMoneyIndian(s.totals.discountPaise)}</td></tr>`);
  }
  totalsRows.push(
    `<tr><td>${p.showGst ? 'Taxable value' : 'Items total'}</td><td class="num">${formatMoneyIndian(s.totals.subtotalPaise)}</td></tr>`,
  );
  if (p.showGst)
    for (const h of p.taxRows)
      totalsRows.push(`<tr><td>${escapeHtml(h.label)}</td><td class="num">${formatMoneyIndian(h.paise)}</td></tr>`);
  if (s.totals.roundOffPaise !== 0) {
    const sign = s.totals.roundOffPaise > 0 ? '+' : '−';
    totalsRows.push(
      `<tr><td>Rounded off</td><td class="num">${sign} ${formatMoneyIndian(Math.abs(s.totals.roundOffPaise))}</td></tr>`,
    );
  }
  const bank = s.seller.bank;
  const hasPay = Boolean(bank?.account || s.seller.upi);
  return `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<title>${escapeHtml(p.title)} ${escapeHtml(p.number)}</title>
<style>
  @page { size: ${a5 ? 'A5' : 'A4'}; margin: ${a5 ? '10mm 9mm' : '14mm 12mm'}; }
  * { box-sizing: border-box; }
  body { font-family: "Noto Sans", -apple-system, "Segoe UI", Roboto, Arial, sans-serif; font-size: ${a5 ? '9pt' : '10.5pt'};
         color: #1a1a1a; margin: 0; line-height: 1.45; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @media screen { body { padding: ${a5 ? '9mm' : '12mm'}; } }
  header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; padding-bottom: 10px; margin-bottom: 14px; }
  .logo { max-height: ${a5 ? '48px' : '64px'}; max-width: 180px; object-fit: contain; display: block; margin-bottom: 6px; }
  .seller-name { font-size: ${a5 ? '12.5pt' : '15pt'}; font-weight: 700; margin: 0 0 2px; }
  .muted { color: #555; font-size: 0.9em; }
  .doc-title { font-size: ${a5 ? '11pt' : '13pt'}; font-weight: 700; text-align: right; text-transform: uppercase; letter-spacing: 0.04em; }
  .doc-meta { text-align: right; font-size: 0.9em; color: #444; margin-top: 4px; }
  .doc-meta strong { color: #1a1a1a; }
  .parties { display: flex; gap: 20px; margin-bottom: 14px; }
  .party { flex: 1; }
  .party h3, .box h3 { font-size: 0.8em; text-transform: uppercase; letter-spacing: 0.06em; color: #666; margin: 0 0 4px; font-weight: 700; }
  table.items { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  table.items thead th { font-size: 0.85em; text-align: left; padding: 7px 8px; font-weight: 600; }
  table.items thead th.num { text-align: right; }
  table.items tbody td { padding: 7px 8px; border-bottom: 1px solid #e4e4e4; vertical-align: top; }
  table.items tbody tr:nth-child(even) { background: #fafafa; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .desc { font-weight: 500; }
  .sub { font-size: 0.8em; color: #666; }
  .foot { display: flex; gap: 20px; align-items: flex-start; }
  .foot-left { flex: 1.3; }
  .foot-right { flex: 1; }
  table.totals { width: 100%; border-collapse: collapse; }
  table.totals td { padding: 5px 8px; }
  table.totals tr.grand td { border-top: 2px solid #1a1a1a; font-size: 1.15em; font-weight: 700; padding-top: 8px; }
  .words { margin-top: 8px; font-size: 0.9em; color: #333; font-style: italic; }
  .nogst, .legend { margin-top: 6px; font-size: 0.85em; color: #555; }
  .box { border: 1px solid #ddd; border-radius: 6px; padding: 9px 11px; margin-bottom: 10px; }
  .box .line { font-size: 0.9em; }
  .sign { margin-top: 18px; text-align: right; }
  .sign img { max-height: 52px; max-width: 150px; }
  .sign .rule { border-top: 1px solid #999; width: 190px; margin: 4px 0 0 auto; padding-top: 3px; font-size: 0.85em; color: #555; }
  .qr { width: ${a5 ? '88px' : '104px'}; height: ${a5 ? '88px' : '104px'}; object-fit: contain; }
  .watermark { position: fixed; top: 42%; left: 50%; transform: translate(-50%, -50%) rotate(-28deg); font-size: ${a5 ? '56pt' : '78pt'};
               font-weight: 800; color: rgba(190, 40, 30, 0.13); letter-spacing: 0.08em; z-index: 0; }
  .content { position: relative; z-index: 1; }
  .note { margin-top: 10px; font-size: 0.9em; color: #444; white-space: pre-wrap; }
  .legal { margin-top: 14px; padding-top: 8px; border-top: 1px solid #e4e4e4; font-size: 0.75em; color: #777; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
${designCss(p)}
</style>
</head>
<body class="design-${p.look.design} paper-${p.look.paper}">
${p.watermark ? `<div class="watermark">${escapeHtml(p.watermark)}</div>` : ''}
<div class="content">
  <header>
    <div>
      ${p.logo ? `<img class="logo" src="${p.logo}" alt="">` : ''}
      <p class="seller-name">${escapeHtml(s.seller.legalName)}</p>
      ${s.seller.tradeName && s.seller.tradeName !== s.seller.legalName ? `<div class="muted">${escapeHtml(s.seller.tradeName)}</div>` : ''}
      <div class="muted">${[s.seller.address, s.seller.city].filter(Boolean).map(escapeHtml).join(', ')}${s.seller.stateCode ? `<br>${escapeHtml(stateName(s.seller.stateCode))}` : ''}</div>
      <div class="muted">${s.seller.gstin ? `GSTIN: <strong>${escapeHtml(s.seller.gstin)}</strong><br>` : ''}${s.seller.phone ? escapeHtml(s.seller.phone) : ''}</div>
    </div>
    <div>
      <div class="doc-title accent">${escapeHtml(p.title)}</div>
      <div class="doc-meta">
        No. <strong>${escapeHtml(p.number)}</strong><br>
        Date: <strong>${escapeHtml(formatDateShort(s.dateIso))}</strong>
        ${p.dueDate ? `<br>Due: ${escapeHtml(formatDateShort(p.dueDate))}` : ''}
        ${s.linkedInvoice ? `<br>Against invoice <strong>${escapeHtml(s.linkedInvoice.number)}</strong> dated ${escapeHtml(formatDateShort(s.linkedInvoice.dateIso))}` : ''}
      </div>
    </div>
  </header>
  <div class="parties">
    <div class="party">
      <h3>Bill to</h3>
      <div><strong>${escapeHtml(s.customer.name)}</strong></div>
      <div class="muted">
        ${s.customer.address ? escapeHtml(s.customer.address) : ''}
        ${s.customer.stateCode ? `<br>${escapeHtml(stateName(s.customer.stateCode))}` : ''}
        ${s.customer.gstin ? `<br>GSTIN: ${escapeHtml(s.customer.gstin)}` : ''}
        ${s.customer.phone ? `<br>${escapeHtml(s.customer.phone)}` : ''}
      </div>
    </div>
    ${
      p.showGst && s.placeOfSupplyStateCode
        ? `<div class="party"><h3>Place of supply</h3><div>${escapeHtml(stateName(s.placeOfSupplyStateCode))}</div><div class="muted">${s.supply === 'intra' ? 'Within state' : 'Interstate'}</div></div>`
        : ''
    }
  </div>
  <table class="items">
    <thead><tr>
      <th class="num">#</th><th>Description</th><th class="num">Qty</th><th class="num">Rate</th>
      ${showDiscount ? '<th class="num">Discount</th>' : ''}${p.showGst ? '<th class="num">GST</th>' : ''}<th class="num">Amount</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="foot">
    <div class="foot-left">
      ${
        hasPay
          ? `<div class="box"><h3>How to pay</h3>
               ${bank?.name ? `<div class="line">${escapeHtml(bank.name)}</div>` : ''}
               ${bank?.account ? `<div class="line">A/c: ${escapeHtml(bank.account)}</div>` : ''}
               ${bank?.ifsc ? `<div class="line">IFSC: ${escapeHtml(bank.ifsc)}</div>` : ''}
               ${s.seller.upi ? `<div class="line">UPI: ${escapeHtml(s.seller.upi)}</div>` : ''}
             </div>`
          : ''
      }
      ${p.upiQr ? `<img class="qr" src="${p.upiQr}" alt="UPI payment QR code">` : ''}
      ${s.notes ? `<div class="note">${escapeHtml(s.notes)}</div>` : ''}
    </div>
    <div class="foot-right">
      <table class="totals">
        ${totalsRows.join('')}
        <tr class="grand"><td>Total</td><td class="num">${formatMoneyIndian(s.totals.totalPaise, { withSymbol: true })}</td></tr>
      </table>
      <div class="words">${escapeHtml(amountInWords(s.totals.totalPaise))}</div>
      ${s.legend ? `<div class="legend">${escapeHtml(s.legend)}</div>` : ''}
      ${p.noGstNote ? `<div class="nogst">${p.noGstNote}</div>` : ''}
      <div class="sign">
        <div class="muted">For ${escapeHtml(s.seller.legalName)}</div>
        ${p.signature ? `<img src="${p.signature}" alt="">` : ''}
        <div class="rule">Authorised signatory</div>
      </div>
    </div>
  </div>
  <div class="legal">
    ${p.upiQr ? 'The QR code above is a UPI payment code. It is not a government e-invoice QR code. ' : ''}Prepared with EkBill. Rule pack ${escapeHtml(s.rulePackVersion)}.
  </div>
</div>
</body>
</html>`;
}

function row(label: string, value: string): string {
  return `<div class="row"><span>${escapeHtml(label)}</span><span>${value}</span></div>`;
}

/** The counter printer's version: one column, black on white whatever the design (a thermal printer has one colour). */
function receiptHtml(p: Prepared): string {
  const { s } = p;
  const narrow = p.look.paper === '58mm';
  const widthMm = PAPER[p.look.paper].widthMm;
  const mixedRates = new Set(p.lines.map((l) => l.gstBp)).size > 1;
  const items = p.lines
    .map(
      (l) => `
      <div class="item">
        <div class="item__what">${escapeHtml(l.description)}</div>
        <div class="row"><span>${escapeHtml(formatQuantityPlain(l.quantityMilli))}${l.unit ? ` ${escapeHtml(l.unit)}` : ''} x ${formatMoneyIndian(l.unitPricePaise)}${
          p.showGst && mixedRates ? ` · GST ${escapeHtml(formatPercentPlain(l.gstBp))}%` : ''
        }</span><span>${formatMoneyIndian(l.taxablePaise)}</span></div>
      </div>`,
    )
    .join('');
  const sums: string[] = [];
  if (p.showGst) {
    sums.push(row('Taxable', formatMoneyIndian(s.totals.subtotalPaise)));
    for (const h of p.taxRows) sums.push(row(h.label, formatMoneyIndian(h.paise)));
  }
  if (s.totals.discountPaise > 0) sums.push(row('Discount', `− ${formatMoneyIndian(s.totals.discountPaise)}`));
  if (s.totals.roundOffPaise !== 0)
    sums.push(
      row(
        'Round off',
        `${s.totals.roundOffPaise > 0 ? '+' : '−'} ${formatMoneyIndian(Math.abs(s.totals.roundOffPaise))}`,
      ),
    );
  return `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<title>${escapeHtml(p.title)} ${escapeHtml(p.number)}</title>
<style>
  @page { size: ${widthMm}mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #fff; }
  body { width: ${widthMm}mm; padding: ${narrow ? '3mm 2.5mm' : '4mm 4mm'}; font-family: "DejaVu Sans Condensed", "Arial Narrow", Arial, sans-serif;
         font-size: ${narrow ? '7.6pt' : '8.8pt'}; line-height: 1.35; color: #000; }
  .c { text-align: center; }
  .logo { max-width: 70%; max-height: ${narrow ? '14mm' : '18mm'}; object-fit: contain; display: block; margin: 0 auto 2mm; filter: grayscale(1); }
  .shop { font-size: 1.35em; font-weight: 800; }
  .small { font-size: 0.9em; }
  .title { font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; margin: 1.5mm 0; }
  hr { border: 0; border-top: 1px dashed #000; margin: 2mm 0; }
  hr.solid { border-top: 1.5px solid #000; }
  .row { display: flex; justify-content: space-between; gap: 2mm; }
  .row span:last-child { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .item { margin-bottom: 1.4mm; }
  .item__what { font-weight: 600; word-break: break-word; }
  .grand { font-size: 1.3em; font-weight: 800; }
  .words { font-style: italic; margin-top: 1mm; }
  .qr { width: ${narrow ? '26mm' : '32mm'}; height: ${narrow ? '26mm' : '32mm'}; display: block; margin: 1mm auto; }
  .sign { margin-top: 2mm; text-align: right; }
  .sign img { max-height: 10mm; max-width: 60%; filter: grayscale(1); }
  .watermark { text-align: center; font-weight: 800; border: 1.5px solid #000; padding: 1mm; margin-bottom: 2mm; letter-spacing: 0.1em; }
</style>
</head>
<body class="receipt paper-${p.look.paper}">
  ${p.watermark ? `<div class="watermark">${escapeHtml(p.watermark)}</div>` : ''}
  <div class="c">
    ${p.logo ? `<img class="logo" src="${p.logo}" alt="">` : ''}
    <div class="shop">${escapeHtml(s.seller.legalName)}</div>
    <div class="small">${[s.seller.address, s.seller.city].filter(Boolean).map(escapeHtml).join(', ')}</div>
    ${s.seller.gstin ? `<div class="small">GSTIN: ${escapeHtml(s.seller.gstin)}</div>` : ''}
    ${s.seller.phone ? `<div class="small">Ph: ${escapeHtml(s.seller.phone)}</div>` : ''}
    <div class="title">${escapeHtml(p.title)}</div>
  </div>
  <div class="row"><span>No. ${escapeHtml(p.number)}</span><span>${escapeHtml(formatDateShort(s.dateIso))}</span></div>
  <div>To: <strong>${escapeHtml(s.customer.name)}</strong></div>
  ${s.customer.gstin ? `<div class="small">GSTIN: ${escapeHtml(s.customer.gstin)}</div>` : ''}
  ${s.linkedInvoice ? `<div class="small">Against ${escapeHtml(s.linkedInvoice.number)}</div>` : ''}
  <hr>
  ${items}
  <hr>
  ${sums.join('')}
  ${sums.length ? '<hr class="solid">' : ''}
  <div class="row grand"><span>TOTAL</span><span>${formatMoneyIndian(s.totals.totalPaise, { withSymbol: true })}</span></div>
  <div class="words small">${escapeHtml(amountInWords(s.totals.totalPaise))}</div>
  ${s.legend ? `<div class="small">${escapeHtml(s.legend)}</div>` : p.noGstNote ? `<div class="small">${p.noGstNote}</div>` : ''}
  ${
    p.upiQr || s.seller.upi
      ? `<hr>${p.upiQr ? `<img class="qr" src="${p.upiQr}" alt="UPI payment QR code">` : ''}${
          s.seller.upi ? `<div class="c small">UPI: ${escapeHtml(s.seller.upi)}</div>` : ''
        }${p.upiQr ? '<div class="c small">UPI payment code, not a government e-invoice QR code.</div>' : ''}`
      : ''
  }
  <div class="sign"><div class="small">For ${escapeHtml(s.seller.legalName)}</div>${p.signature ? `<img src="${p.signature}" alt="">` : ''}<div class="small">Authorised signatory</div></div>
  <hr>
  <div class="c">Thank you! Dhanyavaad</div>
  <div class="c small">Prepared with EkBill</div>
</body>
</html>`;
}
