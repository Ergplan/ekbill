import { afterEach, describe, expect, it } from 'vitest';

/**
 * Stage 10: OTP on and off by the one variable. Switcher mode (the build): the OTP door is closed
 * (404) and the switcher answers. OTP mode: the switcher is gone (404) and the OTP door refuses a
 * token it cannot verify (401, never a session).
 */
const before = process.env.AUTH_MODE;
afterEach(() => {
  process.env.AUTH_MODE = before;
  delete process.env.FIREBASE_PROJECT_ID;
});

describe('AUTH_MODE', () => {
  it('switcher: POST /api/auth/otp is 404 and /dev/switch/sharma signs in', async () => {
    process.env.AUTH_MODE = 'switcher';
    const otp = await import('../../apps/web/app/api/auth/otp/route');
    const res = await otp.POST(new Request('http://127.0.0.1:3000/api/auth/otp', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'otp.off' });
    const sw = await import('../../apps/web/app/dev/switch/[person]/route');
    const r = await sw.GET(new Request('http://127.0.0.1:3000/dev/switch/sharma'), {
      params: Promise.resolve({ person: 'sharma' }),
    });
    expect(r.status).toBe(303);
    expect(r.headers.get('set-cookie')).toContain('eb-session=');
  });

  it('otp: /dev/switch is 404, and a token that does not verify is 401 with no session', async () => {
    process.env.AUTH_MODE = 'otp';
    process.env.FIREBASE_PROJECT_ID = 'demo-ekbill';
    const sw = await import('../../apps/web/app/dev/switch/[person]/route');
    const r = await sw.GET(new Request('http://127.0.0.1:3000/dev/switch/sharma'), {
      params: Promise.resolve({ person: 'sharma' }),
    });
    expect(r.status).toBe(404);
    const otp = await import('../../apps/web/app/api/auth/otp/route');
    const res = await otp.POST(
      new Request('http://127.0.0.1:3000/api/auth/otp', {
        method: 'POST',
        body: JSON.stringify({ idToken: 'eyJhbGciOiJSUzI1NiJ9.not-a-real-token.signature' }),
      }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'otp.invalid' });
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});
