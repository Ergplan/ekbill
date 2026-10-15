import { describe, expect, it } from 'vitest';

import { GET } from '../../apps/web/app/dev/switch/[person]/route';

const call = (person: string, query = '') =>
  GET(new Request(`http://127.0.0.1:3000/dev/switch/${person}${query}`), { params: Promise.resolve({ person }) });

describe('GET /dev/switch/[person] (the build’s door while sign-in is off)', () => {
  it('sets the persona cookie and lands on Home for a person with a business', async () => {
    const res = await call('sharma');
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/');
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^eb-as=sharma;/);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });
  it('lands the brand-new owner on welcome, or on ?to= when it is an internal path', async () => {
    expect((await call('new')).headers.get('location')).toBe('/welcome');
    expect((await call('new', '?to=/setup/name')).headers.get('location')).toBe('/setup/name');
    expect((await call('new', '?to=https://evil.example')).headers.get('location')).toBe('/welcome');
    expect((await call('new', '?to=//evil.example')).headers.get('location')).toBe('/welcome');
  });
  it('sends an unknown person back to the list without a cookie', async () => {
    const res = await call('nobody');
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/dev/switch');
    expect(res.headers.get('set-cookie')).toBeNull();
  });
  it('echoes a caller’s request id', async () => {
    const res = await GET(
      new Request('http://127.0.0.1:3000/dev/switch/ravi', { headers: { 'x-request-id': 'abc-123' } }),
      { params: Promise.resolve({ person: 'ravi' }) },
    );
    expect(res.headers.get('x-request-id')).toBe('abc-123');
  });
});
