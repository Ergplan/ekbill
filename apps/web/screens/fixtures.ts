import fixture from '../../../tests/fixtures/v2.json';

import type { Registration, Role } from './types';

/**
 * The typed view of tests/fixtures/v2.json. Every screen's data.ts reads
 * through these types only; Stage 4–9 replace the loaders' source with the
 * repositories without touching the screens.
 */
export interface Person {
  id: string;
  name: string;
  phone: string;
  business: string | null;
  role: Role;
}
export interface Series {
  prefix: string;
  next: number;
}
export interface Look {
  logo: boolean;
  signature: boolean;
  design: 'classic' | 'modern' | 'simple';
  colour: string;
  paper: 'A4' | 'A5' | '80mm' | '58mm';
  share: 'pdf' | 'jpg';
}
export interface Business {
  id: string;
  name: string;
  ownerName: string;
  pan: string | null;
  gstin: string | null;
  registration: Registration;
  turnoverBand: string | null;
  irn: boolean;
  phone: string;
  upi: string | null;
  bank: { name: string; account: string; ifsc: string } | null;
  address: string | null;
  city: string | null;
  stateCode: string | null;
  stateName: string | null;
  series: Series[];
  look: Look;
  theme: 'narangi' | 'harmony' | 'system';
  lang: 'hi-Latn' | 'en';
  voiceOnArrival: boolean;
  gstDefaultRate: number | null;
}
export interface Customer {
  id: string;
  business: string;
  name: string;
  contact: string;
  phone: string | null;
  gstin: string | null;
  pan: string | null;
  stateCode: string | null;
  stateName: string | null;
  lang: 'hi-Latn' | 'en';
  notes: string | null;
}
export interface Item {
  id: string;
  business: string;
  name: string;
  hsn: string;
  unit: string;
  ratePaise: number;
  gstRate: number | null;
}
export interface BillLine {
  what: string;
  qty: number;
  ratePaise: number;
  gstRate: number | null;
  amountPaise: number;
}
export type BillStatus = 'due' | 'paid' | 'partial' | 'cancelled';
export interface Bill {
  id: string;
  business: string;
  series: string;
  number: string;
  customer: string;
  date: string;
  lines: BillLine[];
  subtotalPaise: number;
  gstPaise: number;
  totalPaise: number;
  status: BillStatus;
  paidPaise: number;
  duePaise: number;
  paidOn: string | null;
  method: 'upi' | 'cash' | 'bank' | null;
  cancelledReason: string | null;
  creditNote: string | null;
  waStatus: 'sent' | 'read';
  kind: 'tax-invoice' | 'bill-of-supply';
}
export interface Payment {
  id: string;
  business: string;
  bill: string;
  date: string;
  amountPaise: number;
  method: string;
}
export interface CreditNote {
  id: string;
  business: string;
  number: string;
  bill: string;
  date: string;
  amountPaise: number;
  reason: string;
}
export interface ReadField {
  value: string;
  confidence: number;
  unreadable?: boolean;
}
export interface PhotoReview {
  customer: string;
  photo: string;
  readAt: string;
  fields: {
    customer: ReadField;
    date: ReadField;
    lines: Array<{ what: ReadField; qty: ReadField; rate: ReadField }>;
    total: ReadField;
  };
}
export interface Fixture {
  today: string;
  people: Person[];
  businesses: Business[];
  customers: Customer[];
  items: Item[];
  bills: Bill[];
  payments: Payment[];
  creditNotes: CreditNote[];
  photoReview: PhotoReview;
  failingCheck: { customer: string; check: string };
  gstQuarter: {
    label: string;
    period: string;
    bills: number;
    taxablePaise: number;
    gstPaise: number;
    byRate: Array<{ rate: number; taxablePaise: number; cgstPaise: number; sgstPaise: number }>;
    b2bBills: number;
    b2cBills: number;
  };
  importPreview: {
    files: string[];
    rows: Array<{ name: string; phone: string | null; gstin: string | null; exists: boolean }>;
  };
  ask: { examples: string[]; answer: { question: string; text: string; sources: string[] } };
  help: { choices: Array<{ id: string; title: string; sub: string }> };
}

export const FIXTURE = fixture as unknown as Fixture;
export const TODAY = FIXTURE.today;

export function daysBetween(fromIso: string, toIso: string = TODAY): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000);
}
export function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
export function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
