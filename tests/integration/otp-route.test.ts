import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

/**
 * OTP on and off by the one variable (Stage 10; Twilio Verify from 19 Oct). Switcher mode (the build): both OTP
 * doors are closed (404) and the switcher answers. OTP mode: the switcher is gone (404); with no sender configured
 * the doors say so (503); with the test sender a code goes out, a wrong code is 401 with no session, and the right
 * one sets the session cookie.
 */
const before = { mode: process.env.AUTH_MODE, dir: process.env.OTP_FAKE_DIR };
afterEach(() => {
  process.env.AUTH_MODE = before.mode;
  if (before.dir === undefined) delete process.env.OTP_FAKE_DIR;
  else process.env.OTP_FAKE_DIR = before.dir;
});
const req = (path: string, body: string) =>
  new Request(`http://127.0.0.1:3000/api/auth/otp/${path}`, { method: 'POST', body });

describe('AUTH_MODE', () => {
  it('switcher: both OTP doors are 404 and /dev/switch/sharma signs in', async () => {
    process.env.AUTH_MODE = 'switcher';
    const send = await import('../../apps/web/app/api/auth/otp/send/route');
    const check = await import('../../apps/web/app/api/auth/otp/check/route');
    for (const res of [await send.POST(req('send', '{}')), await check.POST(req('check', '{}'))]) {
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'otp.off' });
    }
    const sw = await import('../../apps/web/app/dev/switch/[person]/route');
    const r = await sw.GET(new Request('http://127.0.0.1:3000/dev/switch/sharma'), {
      params: Promise.resolve({ person: 'sharma' }),
    });
    expect(r.status).toBe(303);
    expect(r.headers.get('set-cookie')).toContain('eb-session=');
  });

  it('otp with no sender configured: /dev/switch is 404 and the doors answer 503, not a 500', async () => {
    process.env.AUTH_MODE = 'otp';
    delete process.env.OTP_FAKE_DIR;
    const sw = await import('../../apps/web/app/dev/switch/[person]/route');
    const r = await sw.GET(new Request('http://127.0.0.1:3000/dev/switch/sharma'), {
      params: Promise.resolve({ person: 'sharma' }),
    });
    expect(r.status).toBe(404);
    const send = await import('../../apps/web/app/api/auth/otp/send/route');
    const res = await send.POST(req('send', JSON.stringify({ phone: '9822012345' })));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'otp.unavailable' });
  });

  it('otp: a code goes out; a wrong code is 401 with no cookie; the right code signs in', async () => {
    process.env.AUTH_MODE = 'otp';
    const dir = mkdtempSync(join(tmpdir(), 'ekbill-otp-route-'));
    process.env.OTP_FAKE_DIR = dir;
    const digits = `91${String(Date.now()).slice(-8)}`;
    const send = await import('../../apps/web/app/api/auth/otp/send/route');
    const check = await import('../../apps/web/app/api/auth/otp/check/route');
    const sent = await send.POST(req('send', JSON.stringify({ phone: `+91${digits}` })));
    expect(sent.status).toBe(200);
    expect(await sent.json()).toEqual({ sent: true });
    const code = readFileSync(join(dir, `91${digits}.txt`), 'utf8');
    const wrong = await check.POST(
      req('check', JSON.stringify({ phone: `+91${digits}`, code: code === '000000' ? '111111' : '000000' })),
    );
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: 'otp.invalid' });
    expect(wrong.headers.get('set-cookie')).toBeNull();
    const right = await check.POST(req('check', JSON.stringify({ phone: `+91${digits}`, code })));
    expect(right.status).toBe(200);
    expect(await right.json()).toEqual({ to: '/' });
    expect(right.headers.get('set-cookie')).toContain('eb-session=');
  });

  it('otp: any JSON body that is not an object is a 400 or 401, never a 500 (Stage 10 review)', async () => {
    process.env.AUTH_MODE = 'otp';
    process.env.OTP_FAKE_DIR = mkdtempSync(join(tmpdir(), 'ekbill-otp-route-'));
    const send = await import('../../apps/web/app/api/auth/otp/send/route');
    const check = await import('../../apps/web/app/api/auth/otp/check/route');
    for (const body of ['null', '3', '"x"', '[]', 'not json']) {
      const a = await send.POST(req('send', body));
      expect(a.status, body).toBe(400);
      expect(await a.json()).toEqual({ error: 'otp.phone' });
      const b = await check.POST(req('check', body));
      expect(b.status, body).toBe(400);
      expect(b.headers.get('set-cookie')).toBeNull();
    }
  });
});
