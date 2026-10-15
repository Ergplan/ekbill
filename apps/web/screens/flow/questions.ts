import type { FlowQuestion } from './Screen';

/** Open design questions for the operator, each with the answer the prototype builds. */
export const questions: FlowQuestion[] = [
  {
    id: 1,
    question:
      'The new-owner path (d) needs the short setup: name → GST? → "Sab sahi hai?" → Chalo. PAN, UPI, city and signature are offered on the review screen ("Abhi bhar deta hoon") and on Aap, not asked one by one first. Is that acceptable, or must every question be asked before the first bill?',
    proposal:
      'Accept: the budget of 14 taps from welcome to WhatsApp is met only this way (the full chain costs 19). The signature is asked again before the first bill is sent (Stage 4).',
  },
  {
    id: 2,
    question:
      'For the first bill of a brand-new owner, the customer’s name is a field on the bill form itself (the customer is created with the bill). Elsewhere "Naya customer" has its own screen. Keep both?',
    proposal:
      'Keep both: the inline name saves two taps on the first bill; the Naya customer screen holds phone, GSTIN and language for everyone after.',
  },
  {
    id: 3,
    question: 'Kitna (quantity) defaults to 1 on every new line. Right for a service business; a trader types over it.',
    proposal: 'Keep the default of 1; the field is the first thing after "Kya kiya?" and takes one tap to change.',
  },
  {
    id: 4,
    question:
      'The tab bar has five slots (Ghar · Bills · mic · GST · Aap). Only the active tab shows its word; the others show their icon. The pack’s mock showed words on all three tabs.',
    proposal: 'Keep icon-only inactive tabs: five worded slots do not fit 390 px at 44 px targets.',
  },
  {
    id: 5,
    question:
      'Harmony’s folder on Home shows the three latest bills peeking behind "Kiska bill" and the three oldest dues peeking behind "Kiske paise aane hain". The pack only shows one folder per screen.',
    proposal:
      'Keep two folders on Home in Harmony (the pack’s rule was written for a screen with one hero); if you prefer, the Kiska bill folder loses its peeks.',
  },
  {
    id: 6,
    question:
      'GST per bill: the quiet strip "GST: 18% sab pe · badlo" opens a sheet with Haan/Nahi, one rate or per-line, rates 0/5/12/18/28/40. Should 12 % and 28 % stay in the chips after GST 2.0 (Stage 3 verifies the slabs)?',
    proposal:
      'Keep all six until Stage 3’s rule pack says which apply on the bill’s date; the chips then come from the pack.',
  },
  {
    id: 7,
    question:
      'Accountants see Home with the second and third cards only and no "Yaad dilao"; staff see everything but cancel, credit note and Team. Is the accountant allowed "WhatsApp dobara" and "Download" on a bill?',
    proposal: 'Download yes (they need the PDFs), WhatsApp dobara no (that is a reminder in effect).',
  },
  {
    id: 8,
    question:
      'Poocho and "Mera bill thoda complex hai" have no tab and no Home card. They are reached from the mic (voice) and from Aap. Is a text entry on Home needed too?',
    proposal: 'No entry on Home (rule 7 keeps Home to three cards); the mic’s first words offer both.',
  },
];
