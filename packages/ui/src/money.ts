/**
 * Display formatting for money: integer paise in, Indian grouping out
 * (₹1,12,400). The engine owns arithmetic; this only draws.
 */
export function formatRupees(paise: number, opts: { whole?: boolean } = {}): string {
  const negative = paise < 0;
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const p = abs % 100;
  const s = String(rupees);
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
  const body = opts.whole || p === 0 ? grouped : `${grouped}.${String(p).padStart(2, '0')}`;
  return `${negative ? '−' : ''}${body}`;
}
