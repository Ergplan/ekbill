/**
 * The app demo (20 Oct, the operator): about 45 seconds across the app, on the sample business (?as=owner: a look,
 * never the viewer's own records), each line spoken and its place on the screen lit, the point being that the
 * voice fills everything. The words are the dictionary's (demo.*), in five languages; the recordings are made from
 * them (apps/web/app/api/demo/audio). Change a line in design/copy/strings.json and its recording is made again.
 */
export interface DemoStep {
  /** The dictionary key: the caption and the recording. */
  key: string;
  path: string;
  /** The data-guide the ring lights. */
  target: string;
  /** Fields the demo fills while the line plays, as the voice would (the bill form's first line). */
  fill?: Array<{ item: string; value: string; afterMs: number }>;
}

const BILL = '/bills/new?customer=mehta&as=owner';

export const DEMO_STEPS: DemoStep[] = [
  { key: 'demo.s1', path: '/?as=owner', target: 'star' },
  // The two opening buttons (20 Oct): the kaccha bill beside the pakka one, and which is which.
  { key: 'demo.kaccha', path: '/?as=owner', target: 'kaccha' },
  { key: 'demo.s2', path: '/?as=owner', target: 'mic' },
  {
    key: 'demo.s3',
    path: BILL,
    target: 'line-0',
    fill: [
      { item: 'line-0/line-0-what', value: 'Ceiling fan', afterMs: 2600 },
      { item: 'line-0/line-0-qty', value: '2', afterMs: 3300 },
      { item: 'line-0/line-0-rate', value: '350', afterMs: 3900 },
    ],
  },
  { key: 'demo.s4', path: BILL, target: 'gst' },
  { key: 'demo.s5', path: '/bills/new/done?as=owner', target: 'whatsapp' },
  { key: 'demo.s6', path: '/dues?as=owner', target: 'remind' },
  { key: 'demo.s7', path: '/bills/photo?state=review&as=owner', target: 'fields' },
  { key: 'demo.s8', path: '/gst?as=owner', target: 'tiles' },
];

/** Where the demo ends: a first-timer at "Apne baare mein batao", someone billing at the star, a visitor at the start. */
export const DEMO_END = {
  first: { key: 'demo.end.new', path: '/', target: 'about' },
  again: { key: 'demo.end', path: '/', target: 'star' },
  visitor: { key: 'demo.end.visitor', path: '/welcome', target: 'start' },
} as const satisfies Record<string, DemoStep>;

/** Every line that is spoken, for the recordings (and nothing else may be asked for). */
export const DEMO_LINES: string[] = [
  'demo.intro',
  'demo.lang',
  ...DEMO_STEPS.map((s) => s.key),
  ...Object.values(DEMO_END).map((s) => s.key),
];

/** The browser's own voice, where there is no recording: the language tag to look for. */
export const SPEECH_LANG: Record<string, string> = {
  'hi-Latn': 'en-IN',
  en: 'en-IN',
  hi: 'hi-IN',
  mr: 'mr-IN',
  ta: 'ta-IN',
};
