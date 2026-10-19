import { NextResponse } from 'next/server';

import { authMode } from '../../../../../server/auth-mode';
import { logRequest, requestId } from '../../../../../server/log';
import { OtpError, sendCode } from '../../../../../server/otp';
import { codeSender } from '../../../../../server/verify';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const STATUS: Record<OtpError['code'], number> = {
  'otp.phone': 400,
  'otp.invalid': 400,
  'otp.stale': 401,
  'otp.tooMany': 429,
  'otp.send.failed': 502,
};

/**
 * Phone sign-in, step 1 (19 Oct: Twilio Verify): `{ phone }` → an SMS code to that Indian mobile. Only with
 * AUTH_MODE=otp (in the build's switcher mode the door is closed, 404); 503 while Twilio's settings are missing.
 * Rate-limited per address in proxy.ts and per number in otp.ts. The answer never says whether the number is
 * already someone's.
 */
export async function POST(request: Request) {
  const id = requestId(request);
  if (authMode() !== 'otp')
    return NextResponse.json({ error: 'otp.off' }, { status: 404, headers: { 'x-request-id': id } });
  const sender = codeSender();
  if (!sender) {
    logRequest('POST /api/auth/otp/send', id, { sent: false, error: 'otp.unavailable' });
    return NextResponse.json({ error: 'otp.unavailable' }, { status: 503, headers: { 'x-request-id': id } });
  }
  const raw: unknown = await request.json().catch(() => null);
  const phone = raw && typeof raw === 'object' ? (raw as { phone?: unknown }).phone : undefined;
  try {
    await sendCode(phone, sender);
    logRequest('POST /api/auth/otp/send', id, { sent: true, via: sender.kind });
    return NextResponse.json({ sent: true }, { headers: { 'x-request-id': id } });
  } catch (e) {
    if (!(e instanceof OtpError)) throw e;
    logRequest('POST /api/auth/otp/send', id, { sent: false, error: e.code });
    return NextResponse.json({ error: e.code }, { status: STATUS[e.code], headers: { 'x-request-id': id } });
  }
}
