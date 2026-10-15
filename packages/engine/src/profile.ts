import { checkGstin, checkPan } from './ids';
import { say, type Say } from './say';
import { findState } from './state-codes';
import { toE164 } from './phone';
import type { Registration } from './rules';

/**
 * The business profile as the owner gives it (setup, then Aap), checked the
 * same way in the browser as the owner types and on the server before the
 * write. Salvaged from the MVP's profile.ts, aap.ts and bill-look.ts (tag
 * mvp-final), re-shaped for v2's setup answers (Haan / Composition / Nahi /
 * Pata nahi), the turnover band and the e-invoicing question. Pure: every
 * message is a dictionary key.
 */
export type SetupAnswer = 'yes' | 'composition' | 'no' | 'unknown';
export type RegistrationType = 'regular' | 'composition' | 'not-registered' | 'not-sure';
export type TurnoverBand = '40l' | '40l-1.5cr' | '1.5-5cr' | '5cr+';

export const TURNOVER_BANDS: readonly TurnoverBand[] = ['40l', '40l-1.5cr', '1.5-5cr', '5cr+'];
/** The upper bound of each band in paise: what the engine's thresholds compare against. */
export const TURNOVER_BAND_PAISE: Record<TurnoverBand, number> = {
  '40l': 400_000_000,
  '40l-1.5cr': 1_500_000_000,
  '1.5-5cr': 5_000_000_000,
  '5cr+': 5_000_000_001,
};
/** The band whose question needs the e-invoicing answer (8.0: "only when 5 crore se zyada"). */
export const E_INVOICE_BAND: TurnoverBand = '5cr+';

/** Haan → regular, Composition → composition, Nahi → not-registered, Pata nahi → not-sure. */
export const REGISTRATION_OF_ANSWER: Record<SetupAnswer, RegistrationType> = {
  yes: 'regular',
  composition: 'composition',
  no: 'not-registered',
  unknown: 'not-sure',
};
export const ANSWER_OF_REGISTRATION: Record<RegistrationType, SetupAnswer> = {
  regular: 'yes',
  composition: 'composition',
  'not-registered': 'no',
  'not-sure': 'unknown',
};
/** The engine's registration for a stored profile. */
export const ENGINE_REGISTRATION: Record<RegistrationType, Registration> = {
  regular: 'regular',
  composition: 'composition',
  'not-registered': 'unregistered',
  'not-sure': 'unknown',
};

export const BILL_DESIGNS = ['classic', 'modern', 'simple'] as const;
export type BillDesign = (typeof BILL_DESIGNS)[number];
export const BILL_PAPERS = ['a4', 'a5', '80mm', '58mm'] as const;
export type BillPaper = (typeof BILL_PAPERS)[number];
export const BILL_SHARE = ['pdf', 'jpg'] as const;
export type BillShareAs = (typeof BILL_SHARE)[number];
/** Colours that print well and read on a phone (the MVP's). The first is the default. */
export const BILL_ACCENTS = ['#2f4a9e', '#0f766e', '#b45309', '#be123c', '#6d28d9', '#1f2937'] as const;
export const PAYMENT_TERMS = [0, 7, 15, 30] as const;

export interface BillLook {
  design: BillDesign;
  paper: BillPaper;
  shareAs: BillShareAs;
  accent: string;
}
export const DEFAULT_LOOK: BillLook = { design: 'classic', paper: 'a4', shareAs: 'pdf', accent: BILL_ACCENTS[0] };

export interface ProfileInput {
  /** "Dukaan ka naam": the legal name and the trade name until the owner separates them. */
  name: string;
  tradeName?: string | null;
  /** The setup answer, or the stored registration type. */
  gst: SetupAnswer | RegistrationType;
  gstin?: string | null;
  pan?: string | null;
  turnoverBand?: TurnoverBand | null;
  /** Haan → true, Nahi → false, Pata nahi → null. */
  eInvoicingApplies?: boolean | null;
  /** The legend a composition business prints (from the pack); required for composition. */
  compositionLegend?: string | null;
  phone?: string | null;
  email?: string | null;
  upi?: string | null;
  address?: string | null;
  city?: string | null;
  pincode?: string | null;
  stateCode?: string | null;
  bankName?: string | null;
  bankAccount?: string | null;
  bankIfsc?: string | null;
  bankHolder?: string | null;
  defaultPaymentTermsDays?: number | null;
  look?: Partial<BillLook> | null;
  voiceOnArrival?: boolean | null;
}

export interface Profile {
  legalName: string;
  tradeName: string;
  registrationType: RegistrationType;
  gstin: string | null;
  pan: string | null;
  stateCode: string | null;
  turnoverBand: TurnoverBand | null;
  /** The band's upper bound, for the engine's thresholds; null until a band is chosen. */
  turnoverPaise: number | null;
  eInvoicingApplies: boolean | null;
  compositionLegend: string | null;
  phone: string | null;
  email: string | null;
  upi: string | null;
  address: string | null;
  city: string | null;
  pincode: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankIfsc: string | null;
  bankHolder: string | null;
  defaultPaymentTermsDays: number;
  look: BillLook;
  voiceOnArrival: boolean;
}

export type ProfileField =
  | 'name'
  | 'gst'
  | 'gstin'
  | 'pan'
  | 'turnoverBand'
  | 'eInvoicingApplies'
  | 'compositionLegend'
  | 'phone'
  | 'email'
  | 'upi'
  | 'address'
  | 'city'
  | 'pincode'
  | 'stateCode'
  | 'bankName'
  | 'bankAccount'
  | 'bankIfsc'
  | 'bankHolder'
  | 'defaultPaymentTermsDays'
  | 'look';

export type ProfileCheck = { ok: true; profile: Profile } | { ok: false; field: ProfileField; message: Say };

const NAME_MAX = 120;
const ADDRESS_MAX = 200;
const CITY_MAX = 80;
const UPI_ID = /^[\w.-]{2,60}@[a-zA-Z]{2,30}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PINCODE = /^[1-9][0-9]{5}$/;
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT = /^[0-9]{9,18}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;

const clean = (v: string | null | undefined) => (v ?? '').trim();
const orNull = (v: string | null | undefined) => clean(v) || null;
const oneOf = <T extends string>(list: readonly T[], v: unknown, fallback: T): T =>
  (list as readonly unknown[]).includes(v) ? (v as T) : fallback;

export function registrationOf(gst: SetupAnswer | RegistrationType): RegistrationType {
  return gst in REGISTRATION_OF_ANSWER ? REGISTRATION_OF_ANSWER[gst as SetupAnswer] : (gst as RegistrationType);
}

/** Every check of the Stage 4 prompt, first failure first, in the order the setup asks. */
export function checkProfile(input: ProfileInput): ProfileCheck {
  const fail = (field: ProfileField, key: string, params?: Record<string, string | number>): ProfileCheck => ({
    ok: false,
    field,
    message: say(key, params),
  });
  const legalName = clean(input.name).replace(/\s+/g, ' ');
  if (!legalName) return fail('name', 'error.required');
  if (legalName.length > NAME_MAX) return fail('name', 'error.tooLong', { n: NAME_MAX });
  const tradeName = clean(input.tradeName).replace(/\s+/g, ' ') || legalName;
  if (tradeName.length > NAME_MAX) return fail('name', 'error.tooLong', { n: NAME_MAX });

  const registrationType = registrationOf(input.gst);
  if (!(registrationType in ANSWER_OF_REGISTRATION)) return fail('gst', 'error.required');
  const registered = registrationType === 'regular' || registrationType === 'composition';

  let pan = orNull(input.pan)?.toUpperCase() ?? null;
  if (pan) {
    const c = checkPan(pan);
    if (!c.ok) return fail('pan', 'error.pan');
    pan = c.normalised;
  }

  let stateCode = orNull(input.stateCode);
  if (stateCode && !findState(stateCode)) return fail('stateCode', 'error.state');

  let gstin: string | null = null;
  const rawGstin = clean(input.gstin);
  if (registered) {
    if (!rawGstin) return fail('gstin', 'error.gstin.required');
    const c = checkGstin(rawGstin);
    if (!c.ok)
      return fail('gstin', `setup.gstin.error.${c.problem === 'unknown-state' ? 'state' : (c.problem ?? 'format')}`);
    gstin = c.normalised;
    // The PAN inside the GSTIN is the PAN; a different one typed is a typo in one of them.
    if (pan && c.pan && pan !== c.pan) return fail('pan', 'error.gstinPan', { gstPan: c.pan });
    pan = pan ?? c.pan ?? null;
    // The GSTIN carries its state; a chosen state that disagrees puts the wrong tax on every bill.
    if (stateCode && stateCode !== c.stateCode)
      return fail('stateCode', 'error.gstinState', {
        gstState: c.stateName ?? '',
        chosen: findState(stateCode)?.name ?? stateCode,
      });
    stateCode = c.stateCode ?? stateCode;
  } else if (rawGstin) {
    // "Nahi" or "Pata nahi" with a GSTIN typed: the answer and the number disagree.
    return fail('gst', 'error.gstAnswer');
  }

  let turnoverBand: TurnoverBand | null = null;
  if (registrationType === 'regular') {
    if (input.turnoverBand && !TURNOVER_BANDS.includes(input.turnoverBand))
      return fail('turnoverBand', 'error.required');
    turnoverBand = input.turnoverBand ?? null;
  }
  const eInvoicingApplies = registrationType === 'regular' ? (input.eInvoicingApplies ?? null) : null;
  if (turnoverBand === E_INVOICE_BAND && eInvoicingApplies === null) return fail('eInvoicingApplies', 'einv.required');

  const compositionLegend = registrationType === 'composition' ? orNull(input.compositionLegend) : null;
  if (registrationType === 'composition' && !compositionLegend) return fail('compositionLegend', 'error.legend');

  let phone: string | null = null;
  if (clean(input.phone)) {
    phone = toE164(clean(input.phone));
    if (!phone) return fail('phone', 'error.phone');
  }
  const email = orNull(input.email);
  if (email && !EMAIL.test(email)) return fail('email', 'error.email');
  const upi = orNull(input.upi);
  if (upi && !UPI_ID.test(upi)) return fail('upi', 'error.upi');

  const address = orNull(input.address);
  if (address && address.length > ADDRESS_MAX) return fail('address', 'error.tooLong', { n: ADDRESS_MAX });
  const city = orNull(input.city);
  if (city && city.length > CITY_MAX) return fail('city', 'error.tooLong', { n: CITY_MAX });
  const pincode = orNull(input.pincode)?.replace(/\s/g, '') ?? null;
  if (pincode && !PINCODE.test(pincode)) return fail('pincode', 'error.pincode');

  const bankAccount = orNull(input.bankAccount)?.replace(/\s/g, '') ?? null;
  if (bankAccount && !ACCOUNT.test(bankAccount)) return fail('bankAccount', 'error.account');
  const bankIfsc = orNull(input.bankIfsc)?.toUpperCase() ?? null;
  if (bankIfsc && !IFSC.test(bankIfsc)) return fail('bankIfsc', 'error.ifsc');
  if (bankAccount && !bankIfsc) return fail('bankIfsc', 'error.required');
  const bankName = orNull(input.bankName);
  const bankHolder = orNull(input.bankHolder);

  const days = input.defaultPaymentTermsDays ?? 0;
  if (!Number.isInteger(days) || days < 0 || days > 365) return fail('defaultPaymentTermsDays', 'error.days');

  const look: BillLook = {
    design: oneOf(BILL_DESIGNS, input.look?.design, DEFAULT_LOOK.design),
    paper: oneOf(BILL_PAPERS, input.look?.paper, DEFAULT_LOOK.paper),
    shareAs: oneOf(BILL_SHARE, input.look?.shareAs, DEFAULT_LOOK.shareAs),
    accent: HEX.test(input.look?.accent ?? '') ? input.look!.accent!.toLowerCase() : DEFAULT_LOOK.accent,
  };

  return {
    ok: true,
    profile: {
      legalName,
      tradeName,
      registrationType,
      gstin,
      pan,
      stateCode,
      turnoverBand,
      turnoverPaise: turnoverBand ? TURNOVER_BAND_PAISE[turnoverBand] : null,
      eInvoicingApplies,
      compositionLegend,
      phone,
      email,
      upi,
      address,
      city,
      pincode,
      bankName,
      bankAccount,
      bankIfsc,
      bankHolder,
      defaultPaymentTermsDays: days,
      look,
      voiceOnArrival: input.voiceOnArrival ?? true,
    },
  };
}

/** "+919876543210" -> "+91 98765 43210". The shape people read numbers in. */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return '';
  const m = /^\+91(\d{5})(\d{5})$/.exec(e164);
  return m ? `+91 ${m[1]} ${m[2]}` : e164;
}
