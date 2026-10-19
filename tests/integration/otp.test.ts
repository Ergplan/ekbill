import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getPool } from '../../packages/db/src/pool';
import * as memberships from '../../packages/db/src/repos/memberships';
import { OtpError, checkCode, sendCode, signInWithPhone } from '../../apps/web/server/otp';
import { VerifyError, fakeSender, type CodeSender } from '../../apps/web/server/verify';
import { scopeFor, seeded } from './helpers';

/**
 * Phone OTP on v2's sessions (Stage 10; Twilio Verify from 19 Oct). A code the sender approves makes the phone the
 * identity: a new number becomes a person who lands on welcome; an invited number lands in the business. A wrong
 * code, a code that has run out, a number that is not an Indian mobile, or too many tries sign nobody in.
 */
seeded();

const dir = mkdtempSync(join(tmpdir(), 'ekbill-otp-'));
const codeOf = (phone: string) => readFileSync(join(dir, `${phone.replace(/\D/g, '')}.txt`), 'utf8');
const fresh = (lead = '98') => `+91${lead}${String(Date.now()).slice(-8)}`;
const roomy = { send: { max: 100, windowMs: 60_000 }, check: { max: 100, windowMs: 60_000 } };

describe('sendCode and checkCode', () => {
  it('a number EkBill has never seen: the right code makes a person, a session and no business (welcome)', async () => {
    const sender = fakeSender(dir);
    const phone = fresh();
    expect(await sendCode(phone.slice(3), sender, { limits: roomy })).toEqual({ phone });
    const r = await checkCode(phone, codeOf(phone), sender, { limits: roomy });
    expect(r.to).toBe('/welcome');
    const row = (await getPool().query('select business_id from sessions where id = $1', [r.sessionId])).rows[0];
    expect(row.business_id).toBeNull();
    // The code is used up; a second sign-in needs a second code, and is the same person.
    await expect(checkCode(phone, codeOf(phone), sender, { limits: roomy })).rejects.toEqual(new OtpError('otp.stale'));
    await sendCode(phone, sender, { limits: roomy });
    expect((await checkCode(phone, codeOf(phone), sender, { limits: roomy })).userId).toBe(r.userId);
  });

  it('an invited number lands in the business with its role', async () => {
    const sender = fakeSender(dir);
    const owner = await scopeFor('sharma', 'owner');
    const phone = fresh('97');
    await memberships.invite(owner, { phoneE164: phone, name: 'OTP Staff', role: 'staff' });
    await sendCode(phone, sender, { limits: roomy });
    const r = await checkCode(phone, codeOf(phone), sender, { limits: roomy });
    expect(r.to).toBe('/');
    const row = (await getPool().query('select business_id, role from sessions where id = $1', [r.sessionId])).rows[0];
    expect(row).toEqual({ business_id: owner.businessId, role: 'staff' });
  });

  it('a wrong code, a run-out code, a malformed code or phone sign nobody in', async () => {
    let clock = Date.UTC(2026, 9, 19, 6);
    const sender = fakeSender(dir, () => clock);
    const phone = fresh('96');
    await sendCode(phone, sender, { limits: roomy });
    const wrong = codeOf(phone) === '000000' ? '111111' : '000000';
    await expect(checkCode(phone, wrong, sender, { limits: roomy })).rejects.toEqual(new OtpError('otp.invalid'));
    await expect(checkCode(phone, 'abc', sender, { limits: roomy })).rejects.toEqual(new OtpError('otp.invalid'));
    await expect(checkCode(phone, 123456, sender, { limits: roomy })).rejects.toEqual(new OtpError('otp.invalid'));
    clock += 11 * 60_000;
    await expect(checkCode(phone, codeOf(phone), sender, { limits: roomy })).rejects.toEqual(new OtpError('otp.stale'));
    for (const bad of ['12345', '+1 415 555 0100', '5812345678', '', null, { phone }])
      await expect(sendCode(bad, sender, { limits: roomy })).rejects.toEqual(new OtpError('otp.phone'));
    const sessions = await getPool().query(
      'select count(*)::int as n from sessions s join users u on u.id = s.user_id where u.phone_e164 = $1',
      [phone],
    );
    expect(sessions.rows[0].n).toBe(0);
  });

  it('five codes an hour per number, then "too many"; a sender that refuses says the SMS did not go', async () => {
    const sender = fakeSender(dir);
    const phone = fresh('95');
    const now = Date.UTC(2026, 9, 19, 7);
    for (let i = 0; i < 5; i++) await sendCode(phone, sender, { now });
    await expect(sendCode(phone, sender, { now })).rejects.toEqual(new OtpError('otp.tooMany'));
    await expect(sendCode(phone, sender, { now: now + 61 * 60_000 })).resolves.toEqual({ phone });
    const refusing: CodeSender = {
      kind: 'twilio',
      send: async () => {
        throw new VerifyError('verify.refused', '400/60200');
      },
      check: async () => 'wrong',
    };
    await expect(sendCode(fresh('94'), refusing, { limits: roomy })).rejects.toEqual(new OtpError('otp.send.failed'));
    const busy: CodeSender = {
      ...refusing,
      send: async () => {
        throw new VerifyError('verify.tooMany', '60203');
      },
    };
    await expect(sendCode(fresh('93'), busy, { limits: roomy })).rejects.toEqual(new OtpError('otp.tooMany'));
  });

  it('signInWithPhone: the same person each time', async () => {
    const phone = fresh('92');
    const a = await signInWithPhone(phone);
    const b = await signInWithPhone(phone);
    expect(b.userId).toBe(a.userId);
    expect(b.sessionId).not.toBe(a.sessionId);
  });
});
