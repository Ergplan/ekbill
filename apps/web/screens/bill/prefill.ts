/**
 * Lines for the bill form to place once when it opens (Stage 9): what the
 * voice heard ("Mehta ka bill banao, AMC visit 3500") or what the contract
 * helper worked out ("30% advance of ₹5,00,000"). Kept in sessionStorage
 * for the one hop to /bills/new; the form takes it and removes it. Nothing
 * is saved until the owner taps Bill banao.
 */
export const PREFILL_KEY = 'ekbill.bill.prefill';

export interface BillPrefill {
  lines: Array<{ what: string; qty: string; rate: string }>;
  /** The GST rate in percent the lines carry (the contract's), when it differs from the form's default. */
  gstRate?: number | null;
  /** False: these lines carry no GST (a contract agreed without it). */
  gstOn?: boolean | null;
}

/** Said when lines are handed over: a form already open for the same bill takes them at once. */
export const PREFILL_EVENT = 'ekbill:prefill';

export function writePrefill(p: BillPrefill): void {
  try {
    sessionStorage.setItem(PREFILL_KEY, JSON.stringify(p));
  } catch {
    // No storage: the form opens with the customer only.
  }
  window.dispatchEvent(new Event(PREFILL_EVENT));
}

/** Reads and removes it: the form places it once. */
export function takePrefill(): BillPrefill | null {
  try {
    const raw = sessionStorage.getItem(PREFILL_KEY);
    sessionStorage.removeItem(PREFILL_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as BillPrefill;
    if (!Array.isArray(p?.lines)) return null;
    const lines = p.lines
      .filter((l) => l && typeof l.what === 'string' && typeof l.rate === 'string')
      .slice(0, 30)
      .map((l) => ({ what: l.what.slice(0, 300), qty: typeof l.qty === 'string' ? l.qty : '1', rate: l.rate }));
    return lines.length
      ? {
          lines,
          gstRate: typeof p.gstRate === 'number' ? p.gstRate : null,
          gstOn: typeof p.gstOn === 'boolean' ? p.gstOn : null,
        }
      : null;
  } catch {
    return null;
  }
}

/**
 * Said when a detail of the business is saved where the owner is (20 Oct): by the voice's update_business or the
 * bill form's own "GST number hai?". The detail ("gstin") rides along; a bill form open now turns its GST on.
 */
export const BUSINESS_EVENT = 'ekbill:business-updated';
export function announceBusinessDetail(field: string): void {
  window.dispatchEvent(new CustomEvent(BUSINESS_EVENT, { detail: { field } }));
}
