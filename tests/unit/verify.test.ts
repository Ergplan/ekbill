import { describe, expect, it } from 'vitest';

import { mobileOf } from '../../apps/web/server/otp';
import { twilioSender, twilioSettingsOf } from '../../apps/web/server/verify';

/**
 * The Twilio Verify client (19 Oct), against a recorded fetch: no request leaves the machine. What it sends (the
 * service's URL, Basic auth, the form), and how it reads Twilio's answers.
 */
const SERVICE = `VA${'a'.repeat(32)}`;
const base = { TWILIO_VERIFY_SERVICE_SID: SERVICE };

describe('twilioSettingsOf', () => {
  it('an API key and secret first, else the account SID and auth token; empty counts as unset', () => {
    expect(
      twilioSettingsOf({
        ...base,
        TWILIO_API_KEY_SID: 'SK1',
        TWILIO_API_KEY_SECRET: 'secret',
        TWILIO_ACCOUNT_SID: 'AC1',
        TWILIO_AUTH_TOKEN: 'token',
      }),
    ).toMatchObject({ username: 'SK1', password: 'secret', baseUrl: 'https://verify.twilio.com' });
    expect(
      twilioSettingsOf({ ...base, TWILIO_API_KEY_SID: '', TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 'token' }),
    ).toMatchObject({ username: 'AC1', password: 'token' });
    expect(twilioSettingsOf({ ...base, TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: '' })).toBeNull();
    expect(
      twilioSettingsOf({ TWILIO_VERIFY_SERVICE_SID: 'VA12', TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't' }),
    ).toBeNull();
    expect(
      twilioSettingsOf({ TWILIO_VERIFY_SERVICE_SID: 'not-a-sid', TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't' }),
    ).toBeNull();
  });
});

function recorder(answers: Array<{ status: number; body: unknown }>) {
  const calls: Array<{ url: string; auth: string | null; form: Record<string, string> }> = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const headers = new Headers(init.headers);
    calls.push({
      url,
      auth: headers.get('authorization'),
      form: Object.fromEntries(new URLSearchParams(String(init.body))),
    });
    const a = answers.shift()!;
    return new Response(JSON.stringify(a.body), { status: a.status });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

describe('twilioSender', () => {
  const settings = { serviceSid: SERVICE, username: 'SK1', password: 'secret', baseUrl: 'https://verify.twilio.com' };

  it('send: one form POST to Verifications, SMS, with Basic auth', async () => {
    const r = recorder([{ status: 201, body: { status: 'pending' } }]);
    await twilioSender(settings, r.fetchImpl).send('+919822012345');
    expect(r.calls).toEqual([
      {
        url: `https://verify.twilio.com/v2/Services/${SERVICE}/Verifications`,
        auth: `Basic ${Buffer.from('SK1:secret').toString('base64')}`,
        form: { To: '+919822012345', Channel: 'sms' },
      },
    ]);
  });

  it('send: Twilio’s "too many" is tooMany; anything else refused; no network is unreachable', async () => {
    const r = recorder([
      { status: 429, body: { code: 60203 } },
      { status: 400, body: { code: 60200, message: 'Invalid parameter' } },
    ]);
    const s = twilioSender(settings, r.fetchImpl);
    await expect(s.send('+919822012345')).rejects.toMatchObject({ code: 'verify.tooMany' });
    await expect(s.send('+919822012345')).rejects.toMatchObject({ code: 'verify.refused' });
    const down = twilioSender(settings, (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch);
    await expect(down.send('+919822012345')).rejects.toMatchObject({ code: 'verify.unreachable' });
  });

  it('check: approved, wrong (still pending), or expired (404, or out of tries)', async () => {
    const r = recorder([
      { status: 200, body: { status: 'approved', valid: true } },
      { status: 200, body: { status: 'pending', valid: false } },
      { status: 404, body: { code: 20404 } },
      { status: 429, body: { code: 60202 } },
    ]);
    const s = twilioSender(settings, r.fetchImpl);
    expect(await s.check('+919822012345', '123456')).toBe('approved');
    expect(await s.check('+919822012345', '000000')).toBe('wrong');
    expect(await s.check('+919822012345', '123456')).toBe('expired');
    expect(await s.check('+919822012345', '123456')).toBe('expired');
    expect(r.calls[0]).toMatchObject({
      url: `https://verify.twilio.com/v2/Services/${SERVICE}/VerificationCheck`,
      form: { To: '+919822012345', Code: '123456' },
    });
  });
});

describe('mobileOf', () => {
  it('an Indian mobile in any common writing; nothing else', () => {
    for (const ok of ['9822012345', '+91 98220 12345', '919822012345', '09822012345', '+91-98220-12345'])
      expect(mobileOf(ok), ok).toBe('+919822012345');
    for (const bad of ['5822012345', '98220123', '+14155550100', '+44 7700 900123', '98220l2345', 42, null])
      expect(mobileOf(bad), String(bad)).toBeNull();
  });
});
