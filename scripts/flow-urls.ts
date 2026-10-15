// Prints one URL per line for every screen state the prototype renders (smoke tests and screenshots).
import { SAMPLE_URL, STATE_URLS } from '../apps/web/screens/registry';

const urls = [
  ...Object.values(SAMPLE_URL),
  ...STATE_URLS.map((s) => (s.as ? `${s.url}${s.url.includes('?') ? '&' : '?'}as=${s.as}` : s.url)),
  '/flow',
  '/kit',
];
process.stdout.write(`${urls.join('\n')}\n`);
