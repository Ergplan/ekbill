import { NextResponse } from 'next/server';

import { authMode } from '../../../../server/auth-mode';
import { logRequest, requestId } from '../../../../server/log';

export const dynamic = 'force-dynamic';

/** Phone + OTP sign-in arrives in Stage 10. Until then the door exists and says so: 501, whatever the mode. */
export async function POST(request: Request) {
  const id = requestId(request);
  logRequest('POST /api/auth/otp', id, { authMode: authMode(), implemented: false });
  return NextResponse.json(
    { error: 'otp.not.yet', authMode: authMode(), signIn: 'arrives in Stage 10' },
    { status: 501, headers: { 'x-request-id': id } },
  );
}
