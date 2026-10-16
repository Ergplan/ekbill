import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { Limiter, MINUTE, clientAddress, isSignIn, isWrite, limitsFromEnv } from '../../apps/web/server/rate-limit';

/** Stage 10, master prompt 4.3: 60 writes a minute per session, 30 sign-ins a minute per address. */
describe('the limiter', () => {
  it('lets 60 writes through in a minute, refuses the 61st with when to come back, and forgets after the minute', () => {
    const l = new Limiter();
    const limit = { max: 60, windowMs: MINUTE };
    const t0 = 1_000_000;
    for (let i = 0; i < 60; i += 1) expect(l.hit('write:s1', limit, t0 + i * 500).ok).toBe(true);
    const refused = l.hit('write:s1', limit, t0 + 30_000);
    expect(refused).toEqual({ ok: false, retryAfterSeconds: 30 });
    // Another session is not slowed by the first.
    expect(l.hit('write:s2', limit, t0 + 30_000).ok).toBe(true);
    // A minute after the first write, one slot is free again.
    expect(l.hit('write:s1', limit, t0 + MINUTE + 1).ok).toBe(true);
  });

  it('a limit of 0 is off; the map stays bounded under a flood of new keys', () => {
    const l = new Limiter(100);
    for (let i = 0; i < 1000; i += 1) expect(l.hit(`k${i}`, { max: 0, windowMs: MINUTE }).ok).toBe(true);
    for (let i = 0; i < 1000; i += 1) l.hit(`k${i}`, { max: 5, windowMs: MINUTE }, 1);
    expect((l as unknown as { hits: Map<string, number[]> }).hits.size).toBeLessThanOrEqual(100);
  });

  it('reads its limits from the environment, 60 and 30 by default', () => {
    expect(limitsFromEnv({})).toEqual({
      writes: { max: 60, windowMs: MINUTE },
      signIn: { max: 30, windowMs: MINUTE },
    });
    expect(limitsFromEnv({ RATE_WRITES_PER_MIN: '0', RATE_SIGNIN_PER_MIN: '5' }).signIn.max).toBe(5);
  });

  it('knows a write, a sign-in door and the address Caddy forwarded', () => {
    expect(['POST', 'put', 'DELETE'].map(isWrite)).toEqual([true, true, true]);
    expect(isWrite('GET')).toBe(false);
    expect(isSignIn('/dev/switch/sharma')).toBe(true);
    expect(isSignIn('/api/auth/otp')).toBe(true);
    expect(isSignIn('/bills')).toBe(false);
    expect(clientAddress(new Headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.2' }))).toBe('203.0.113.9');
    expect(clientAddress(new Headers())).toBe('unknown');
  });
});

describe('the proxy', () => {
  // The proxy reads its limits once, when it is first imported: pin them, whatever the shell running the tests
  // says (CI and Playwright's servers set both to 0, limits off).
  beforeAll(() => {
    vi.stubEnv('RATE_SIGNIN_PER_MIN', '30');
    vi.stubEnv('RATE_WRITES_PER_MIN', '60');
  });
  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('answers the 31st sign-in from one address with 429, the Hinglish words and Retry-After', async () => {
    const { NextRequest } = await import('next/server');
    const { proxy } = await import('../../apps/web/proxy');
    const req = () =>
      new NextRequest('http://127.0.0.1:3000/dev/switch/sharma', { headers: { 'x-forwarded-for': '198.51.100.7' } });
    for (let i = 0; i < 30; i += 1) expect(proxy(req()).status).not.toBe(429);
    const res = proxy(req());
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(await res.text()).toBe('Bahut baar koshish hui. Thodi der baad phir aao.');
    // Another address still gets in.
    const other = new NextRequest('http://127.0.0.1:3000/dev/switch/sharma', {
      headers: { 'x-forwarded-for': '198.51.100.8' },
    });
    expect(proxy(other).status).not.toBe(429);
  });

  it('answers the 61st write in a minute from one session with 429 JSON', async () => {
    const { NextRequest } = await import('next/server');
    const { proxy } = await import('../../apps/web/proxy');
    const req = () =>
      new NextRequest('http://127.0.0.1:3000/bills/new', { method: 'POST', headers: { cookie: 'eb-session=s-rate' } });
    for (let i = 0; i < 60; i += 1) expect(proxy(req()).status).not.toBe(429);
    const res = proxy(req());
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: 'rate.writes', message: expect.stringContaining('Ek minute ruk') });
  });
});
