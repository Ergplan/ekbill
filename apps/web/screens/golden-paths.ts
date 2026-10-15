/**
 * The golden paths (I9), as the exact taps the owner makes. A tap is one
 * press of a button, chip, row or field; filling a field counts as one tap
 * (the fill-a-field-counts-one rule). tests/e2e/golden-path.spec.ts walks
 * each one on the prototype and asserts the count; scripts/flow-map.mjs
 * writes them into docs/SCREEN-FLOW.md.
 */
export interface GoldenPath {
  id: string;
  name: string;
  budget: number;
  start: string;
  as?: string;
  taps: string[];
}

export const goldenPaths: GoldenPath[] = [
  {
    id: 'a',
    name: '(a) Repeat bill to a regular customer, sent on WhatsApp',
    budget: 4,
    start: '/',
    taps: [
      'Home → chip "Mehta Traders"',
      'Bill → "Haan, wahi bharo"',
      'Bill → "Bill banao · ₹7,316"',
      'Bill done → "WhatsApp pe bhejo"',
    ],
  },
  {
    id: 'b',
    name: '(b) Money came in, in full',
    budget: 3,
    start: '/',
    taps: ['Home → dues row "Green Park Society"', 'Bill view → "Paise aa gaye"', 'Sheet → "Poore"'],
  },
  {
    id: 'c',
    name: '(c) Bill from a photo',
    budget: 4,
    start: '/',
    taps: [
      'Home → "Photo se bill"',
      'Photo → "Photo lo" (the picker opens; the photo itself is not a tap)',
      'Review → "Bill banao · ₹2,400"',
    ],
  },
  {
    id: 'd',
    name: '(d) Brand-new owner: welcome to the first bill handed to WhatsApp',
    budget: 14,
    start: '/welcome',
    as: 'new',
    taps: [
      'Welcome → "Shuru karein"',
      'Login → phone field (fill)',
      'Login → "Aage"',
      'Login → code field (fill; six digits move on by themselves)',
      'Setup → dukaan ka naam (fill)',
      'Setup → "Aage"',
      'Setup → "Nahi" (GST mein registered? — answers and moves on)',
      'Setup review → "Chalo, shuru karte hain"',
      'Home → "Pehla bill banao"',
      'Bill → customer ka naam (fill)',
      'Bill → Kya kiya? (fill)',
      'Bill → Rate (fill; Kitna is 1 by default)',
      'Bill → "Bill banao"',
      'Bill done → "WhatsApp pe bhejo"',
    ],
  },
];
