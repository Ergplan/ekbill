/**
 * Records every line of the app demo in every language (20 Oct), by asking the running app for each one: a line
 * already recorded is served from the database, a new one is spoken once and kept. Run inside the app container
 * after a deploy (deploy/vm/up.sh does, when there is an OpenAI key), or by hand:
 *
 *   docker exec <app> node --import tsx scripts/demo-audio.mjs
 */
import { LOCALES } from '../packages/copy/src/dictionary.ts';
import { DEMO_LINES } from '../apps/web/screens/demo/script.ts';

const base = process.env.DEMO_AUDIO_BASE ?? `http://127.0.0.1:${process.env.PORT ?? 3000}`;
let made = 0;
let missing = 0;
for (const locale of LOCALES) {
  for (const line of DEMO_LINES) {
    const res = await fetch(
      `${base}/api/demo/audio?locale=${encodeURIComponent(locale)}&line=${encodeURIComponent(line)}`,
    );
    if (res.ok) made += 1;
    else missing += 1;
    await res.arrayBuffer().catch(() => undefined);
  }
}
console.log(
  `demo audio: ${made} line(s) recorded, ${missing} not (${LOCALES.length} languages × ${DEMO_LINES.length} lines)`,
);
