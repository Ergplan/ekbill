import { NextResponse } from 'next/server';

import { speak, speechConfig, speechHash, type SpeechLocale } from '@ekbill/ai';
import { LOCALES, t } from '@ekbill/copy/server';
import { aiCalls, demoAudioOf, keepDemoAudio } from '@ekbill/db';

import { log, logRequest, requestId } from '../../../../server/log';
import { current } from '../../../../server/session';
import { DEMO_LINES } from '../../../../screens/demo/script';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * One line of the app demo, recorded (20 Oct): ?locale=hi-Latn&line=demo.s1. The text is the dictionary's for that
 * language, never the caller's; a recording made once is served from then on. Where nothing can be spoken (the
 * build: AI_TRANSPORT=fake; no key), 404, and the demo shows its captions and uses the phone's own voice.
 */
export async function GET(request: Request) {
  const id = requestId(request);
  const q = new URL(request.url).searchParams;
  const locale = q.get('locale') as SpeechLocale | null;
  const line = q.get('line') ?? '';
  if (!locale || !(LOCALES as readonly string[]).includes(locale) || !DEMO_LINES.includes(line))
    return NextResponse.json({ error: 'demo.unknown' }, { status: 400, headers: { 'x-request-id': id } });
  const text = t(line, undefined, locale);
  const hash = speechHash(text, locale);
  const kept = await demoAudioOf(locale, line, hash);
  if (kept) return audio(kept, id);
  if (!speechConfig()) {
    logRequest('GET /api/demo/audio', id, { line, locale, recorded: false });
    return NextResponse.json({ error: 'demo.noRecording' }, { status: 404, headers: { 'x-request-id': id } });
  }
  const me = await current();
  try {
    const made = await speak({
      text,
      locale,
      record: (row) =>
        me ? aiCalls.recordUserAiCall({ userId: me.user.id, requestId: id }, row) : aiCalls.recordSystemAiCall(id, row),
    });
    if (!made)
      return NextResponse.json({ error: 'demo.noRecording' }, { status: 404, headers: { 'x-request-id': id } });
    await keepDemoAudio({ locale, lineId: line, textSha256: hash, mime: made.mime, bytes: made.bytes });
    logRequest('GET /api/demo/audio', id, { line, locale, recorded: true });
    return audio(made, id);
  } catch (e) {
    log.warn(
      { requestId: id, line, locale, err: String((e as Error)?.message ?? e).slice(0, 200) },
      'demo line not recorded',
    );
    return NextResponse.json({ error: 'demo.noRecording' }, { status: 404, headers: { 'x-request-id': id } });
  }
}

function audio(a: { mime: string; bytes: Buffer }, id: string) {
  return new NextResponse(new Uint8Array(a.bytes), {
    headers: {
      'content-type': a.mime,
      'content-length': String(a.bytes.length),
      // A day: a changed line is a new recording, and the browser asks again tomorrow.
      'cache-control': 'public, max-age=86400',
      'x-request-id': id,
    },
  });
}
