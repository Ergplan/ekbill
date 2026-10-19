import 'server-only';

import { randomInt } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The SMS code for phone sign-in (19 Oct: Twilio, in place of Firebase). EkBill's server asks Twilio Verify to send
 * a code to the phone and later asks it whether the code typed is the one sent; Twilio keeps the code, its expiry
 * (10 minutes) and its attempt count, so nothing about the code is stored here. The browser only ever talks to
 * EkBill. The account's credentials never reach the browser or a log.
 *
 * Without Twilio's settings there is no sender (sign-in says so). OTP_FAKE_DIR, for the tests only, is a sender that
 * sends nothing: it writes each code to a file in that folder for the test to read, as the Firebase emulator did.
 * Compose never passes it, and real Twilio settings win over it.
 */
export type CheckResult = 'approved' | 'wrong' | 'expired';

export interface CodeSender {
  readonly kind: 'twilio' | 'fake';
  /** Sends a code by SMS. Throws VerifyError on refusal. */
  send(phoneE164: string): Promise<void>;
  /** Whether `code` is the code last sent to the phone and still good. */
  check(phoneE164: string, code: string): Promise<CheckResult>;
}

export class VerifyError extends Error {
  constructor(
    readonly code: 'verify.refused' | 'verify.tooMany' | 'verify.unreachable',
    readonly detail?: string,
  ) {
    super(code);
  }
}

export interface TwilioSettings {
  serviceSid: string;
  username: string;
  password: string;
  baseUrl: string;
}

/**
 * Twilio's settings from the environment, or null when they are not all there. An API key (SK…, with its secret)
 * is preferred, as it can be revoked on its own; else the account SID and its auth token. Empty counts as unset
 * (Compose passes `VAR=` through as '').
 */
export function twilioSettingsOf(env: Record<string, string | undefined>): TwilioSettings | null {
  const v = (k: string) => env[k]?.trim() || '';
  const serviceSid = v('TWILIO_VERIFY_SERVICE_SID');
  if (!/^VA[0-9a-f]{32}$/i.test(serviceSid)) return null;
  const apiKey = v('TWILIO_API_KEY_SID');
  const apiSecret = v('TWILIO_API_KEY_SECRET');
  const account = v('TWILIO_ACCOUNT_SID');
  const token = v('TWILIO_AUTH_TOKEN');
  const [username, password] = apiKey && apiSecret ? [apiKey, apiSecret] : account && token ? [account, token] : [];
  if (!username || !password) return null;
  return {
    serviceSid,
    username,
    password,
    baseUrl: (v('TWILIO_VERIFY_BASE_URL') || 'https://verify.twilio.com').replace(/\/$/, ''),
  };
}

type Fetch = typeof fetch;

/** Twilio Verify over its REST API (no SDK: two form POSTs). `fetchImpl` is the tests' way in. */
export function twilioSender(s: TwilioSettings, fetchImpl: Fetch = fetch): CodeSender {
  const auth = `Basic ${Buffer.from(`${s.username}:${s.password}`).toString('base64')}`;
  const post = async (path: string, form: Record<string, string>) => {
    let res: Response;
    try {
      res = await fetchImpl(`${s.baseUrl}/v2/Services/${s.serviceSid}/${path}`, {
        method: 'POST',
        headers: { authorization: auth, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(form).toString(),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (e) {
      throw new VerifyError('verify.unreachable', e instanceof Error ? e.name : undefined);
    }
    const body = (await res.json().catch(() => ({}))) as { status?: string; code?: number; message?: string };
    return { status: res.status, body };
  };
  return {
    kind: 'twilio',
    async send(phoneE164) {
      const r = await post('Verifications', { To: phoneE164, Channel: 'sms' });
      if (r.status === 201 || r.status === 200) return;
      // 60203: too many sends to this number; 429: Twilio's own rate limit.
      if (r.status === 429 || r.body.code === 60203) throw new VerifyError('verify.tooMany', String(r.body.code ?? ''));
      throw new VerifyError('verify.refused', `${r.status}/${r.body.code ?? ''}`);
    },
    async check(phoneE164, code) {
      const r = await post('VerificationCheck', { To: phoneE164, Code: code });
      if (r.status === 200) return r.body.status === 'approved' ? 'approved' : 'wrong';
      // 404 (20404): no code waiting for this number: it expired, was used, or ran out of attempts.
      if (r.status === 404 || r.body.code === 20404) return 'expired';
      // 60202: five wrong codes; a new one has to be asked for.
      if (r.status === 429 || r.body.code === 60202) return 'expired';
      throw new VerifyError('verify.refused', `${r.status}/${r.body.code ?? ''}`);
    },
  };
}

/** The test sender: a random code per send, written to `<dir>/<digits>.txt`; ten minutes and five tries, as Twilio. */
export function fakeSender(dir: string, now: () => number = Date.now): CodeSender {
  const pending = new Map<string, { code: string; until: number; tries: number }>();
  return {
    kind: 'fake',
    async send(phoneE164) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      pending.set(phoneE164, { code, until: now() + 10 * 60_000, tries: 0 });
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${phoneE164.replace(/\D/g, '')}.txt`), code);
    },
    async check(phoneE164, code) {
      const p = pending.get(phoneE164);
      if (!p || p.until < now() || p.tries >= 5) {
        pending.delete(phoneE164);
        return 'expired';
      }
      if (p.code !== code) {
        p.tries += 1;
        return 'wrong';
      }
      pending.delete(phoneE164);
      return 'approved';
    },
  };
}

let fake: { dir: string; sender: CodeSender } | null = null;

/** The sender this process uses: Twilio when its settings are all there, else the test sender, else none. */
export function codeSender(env: Record<string, string | undefined> = process.env): CodeSender | null {
  const s = twilioSettingsOf(env);
  if (s) return twilioSender(s);
  const dir = env.OTP_FAKE_DIR?.trim();
  if (!dir) return null;
  if (fake?.dir !== dir) fake = { dir, sender: fakeSender(dir) };
  return fake.sender;
}
