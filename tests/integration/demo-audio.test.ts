import { afterAll, describe, expect, it } from 'vitest';

import { setSpeechTransport, speak, speechHash } from '../../packages/ai/src/speech';
import { demoAudioOf, keepDemoAudio } from '../../packages/db/src/demo-audio';
import { recordSystemAiCall } from '../../packages/db/src/repos/ai-calls';
import { getPool } from '../../packages/db/src/pool';
import { seeded } from './helpers';

/**
 * The demo's recordings (20 Oct, the operator: "in demo some weird voice is there"). A line asked for by a visitor
 * who is not signed in, or by the warm-up after a deploy, is EkBill's own model call (no business, no person): its
 * ai_calls row was refused by row security, so no line was ever kept and the demo used the phone's voice.
 */
describe('a demo line recorded for nobody in particular', () => {
  seeded();
  afterAll(() => setSpeechTransport(null));

  it('is spoken, its call recorded as the system, and kept for everyone', async () => {
    setSpeechTransport(async ({ text }) => ({ bytes: Buffer.from(`mp3:${text}`), mime: 'audio/mpeg' }));
    const text = `नमस्ते! ${Date.now()}`;
    const made = await speak({ text, locale: 'hi-Latn', record: (row) => recordSystemAiCall('demo-audio-test', row) });
    expect(made?.mime).toBe('audio/mpeg');
    const hash = speechHash(text, 'hi-Latn');
    await keepDemoAudio({
      locale: 'hi-Latn',
      lineId: 'demo.test',
      textSha256: hash,
      mime: made!.mime,
      bytes: made!.bytes,
    });
    expect((await demoAudioOf('hi-Latn', 'demo.test', hash))?.bytes.toString()).toBe(`mp3:${text}`);
    const { rows } = await getPool().query(
      'select business_id, user_id, purpose, outcome from ai_calls where input_hash = $1',
      [hash],
    );
    expect(rows).toContainEqual({ business_id: null, user_id: null, purpose: 'demo-speech', outcome: 'ok' });
  });
});
