import { NextResponse } from 'next/server';

import { aiCalls, customers } from '@ekbill/db';
import { AiUnavailableError, mintVoiceSession, voiceAvailable } from '@ekbill/ai';

import { log } from '../../../../server/log';
import { current } from '../../../../server/session';

export const dynamic = 'force-dynamic';

/**
 * One voice session (Stage 9): a short-lived client secret minted here with
 * the instructions and tools baked in; the OpenAI key never reaches the
 * browser. Any signed-in person: a member of a business (the business's
 * name and customers go into the instructions), or a brand-new owner in
 * setup (no records, only the questions). One ai_calls row per session.
 */
export async function POST() {
  const me = await current();
  if (!me) return NextResponse.json({ error: 'auth.signed.out' }, { status: 401 });
  if (!voiceAvailable()) return NextResponse.json({ error: 'voice.off' }, { status: 503 });
  const scope = me.scope;
  try {
    const names = scope ? (await customers.listCustomers(scope)).slice(0, 200).map((c) => ({ name: c.name })) : [];
    const session = await mintVoiceSession({
      businessName: me.business?.tradeName ?? null,
      customers: names,
      record: (row) =>
        scope
          ? aiCalls.recordAiCall(scope, row)
          : aiCalls.recordUserAiCall({ userId: me.user.id, requestId: `voice-${me.sessionId.slice(0, 8)}` }, row),
    });
    log.info({ requestId: scope?.requestId, fake: session.fake }, 'voice session minted');
    return NextResponse.json(session);
  } catch (e) {
    if (e instanceof AiUnavailableError) return NextResponse.json({ error: 'voice.off' }, { status: 503 });
    log.warn({ requestId: scope?.requestId, err: (e as Error).message }, 'voice session refused');
    return NextResponse.json({ error: 'voice.failed' }, { status: 502 });
  }
}
