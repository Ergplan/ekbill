import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { resolveScope } from '../../packages/db/src/auth';
import { GET } from '../../apps/web/app/dev/switch/[person]/route';
import { businessOf, seeded } from './helpers';

const call = (person: string, query = '') =>
  GET(new Request(`http://127.0.0.1:3000/dev/switch/${person}${query}`), { params: Promise.resolve({ person }) });

const sessionOf = (res: Response) => res.headers.get('set-cookie')?.match(/eb-session=([0-9a-f-]{36})/)?.[1] ?? null;

describe('GET /dev/switch/[person] (the build’s door while sign-in is off)', () => {
  seeded();
  // The build's mode: the route is the door only while sign-in is off.
  beforeAll(() => {
    process.env.AUTH_MODE = 'switcher';
  });
  afterEach(() => {
    process.env.AUTH_MODE = 'switcher';
  });

  it('creates a real session for the person, bound to their business and role, and lands on Home', async () => {
    const res = await call('sharma');
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/');
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/eb-session=[0-9a-f-]{36};/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/eb-theme=narangi/);
    expect(cookie).toMatch(/eb-lang=hi-Latn/);
    expect(res.headers.get('x-request-id')).toBeTruthy();
    const resolved = await resolveScope(sessionOf(res)!, 'r');
    expect(resolved?.business?.id).toBe(businessOf('sharma').id);
    expect(resolved?.role).toBe('owner');
  });

  it('gives staff and accountants their business and role; the brand-new owner has none and lands on welcome', async () => {
    expect((await resolveScope(sessionOf(await call('sunita'))!, 'r'))?.role).toBe('staff');
    expect((await resolveScope(sessionOf(await call('sunita'))!, 'r'))?.business?.id).toBe(businessOf('gupta').id);
    expect((await resolveScope(sessionOf(await call('iyer'))!, 'r'))?.role).toBe('accountant');
    const fresh = await call('new');
    expect(fresh.headers.get('location')).toBe('/welcome');
    const resolved = await resolveScope(sessionOf(fresh)!, 'r');
    expect(resolved?.business).toBeNull();
    expect(resolved?.scope).toBeNull();
  });

  it('lands on ?to= only when it is a plain internal path', async () => {
    expect((await call('new', '?to=/setup/name')).headers.get('location')).toBe('/setup/name');
    expect((await call('new', '?to=https://evil.example')).headers.get('location')).toBe('/welcome');
    expect((await call('new', '?to=//evil.example')).headers.get('location')).toBe('/welcome');
    expect((await call('new', '?to=/%09/evil.example')).headers.get('location')).toBe('/welcome');
    expect((await call('new', '?to=/\\evil.example')).headers.get('location')).toBe('/welcome');
    expect((await call('new', '?to=/setup/name?x=1')).headers.get('location')).toBe('/setup/name?x=1');
  });

  it('sends an unknown person back to the list without a session', async () => {
    const res = await call('nobody');
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/dev/switch');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('from the login screen (?signin=1) a new phone is a new owner, sent to setup; typed on the list it is not', async () => {
    const phone = encodeURIComponent('+919800011122');
    const typed = await call(phone);
    expect(typed.headers.get('location')).toBe('/dev/switch');
    expect(typed.headers.get('set-cookie')).toBeNull();
    const res = await call(phone, '?signin=1');
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/setup/name');
    const me = await resolveScope(sessionOf(res)!, 'r');
    expect(me?.user.phoneE164 ?? null).toBe('+919800011122');
    expect(me?.scope ?? null).toBeNull();
    // A phone that is already someone (Sharma ji's) signs that person in, on Home.
    const sharma = await call(encodeURIComponent('+919822012345'), '?signin=1');
    expect(sharma.headers.get('location')).toBe('/');
  });

  it('echoes a caller’s request id', async () => {
    const res = await GET(
      new Request('http://127.0.0.1:3000/dev/switch/ravi', { headers: { 'x-request-id': 'abc-123' } }),
      { params: Promise.resolve({ person: 'ravi' }) },
    );
    expect(res.headers.get('x-request-id')).toBe('abc-123');
  });

  it('is gone behind AUTH_MODE=otp', async () => {
    process.env.AUTH_MODE = 'otp';
    const res = await call('sharma');
    expect(res.status).toBe(404);
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});
