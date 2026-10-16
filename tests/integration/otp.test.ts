import { describe, expect, it } from 'vitest';

import { getPool } from '../../packages/db/src/pool';
import * as memberships from '../../packages/db/src/repos/memberships';
import { OtpError, signInWithIdToken, type Verifier } from '../../apps/web/server/otp';
import { scopeFor, seeded } from './helpers';

/**
 * Stage 10, phone OTP on v2's sessions: a verified Firebase token's phone is the identity; a new
 * number becomes a person who lands on welcome; an invited number lands in the business; a token
 * that fails verification, is stale, or has no phone signs nobody in.
 */
const NOW = Date.UTC(2026, 9, 15, 6, 0, 0);
const token = 'x'.repeat(40);
const verifierFor =
  (phone: string | undefined, authTime = NOW / 1000 - 30): Verifier =>
  async () => ({ uid: 'firebase-uid', phone_number: phone, auth_time: authTime });

seeded();

describe('signInWithIdToken', () => {
  it('a number EkBill has never seen becomes a person, with a session and no business: welcome', async () => {
    const phone = `+9198${String(Date.now()).slice(-8)}`;
    const r = await signInWithIdToken(token, verifierFor(phone), { now: NOW });
    expect(r.to).toBe('/welcome');
    const row = (await getPool().query('select business_id from sessions where id = $1', [r.sessionId])).rows[0];
    expect(row.business_id).toBeNull();
    const again = await signInWithIdToken(token, verifierFor(phone), { now: NOW });
    expect(again.userId).toBe(r.userId);
  });

  it('an invited number lands in the business with its role', async () => {
    const owner = await scopeFor('sharma', 'owner');
    const phone = `+9197${String(Date.now()).slice(-8)}`;
    await memberships.invite(owner, { phoneE164: phone, name: 'OTP Staff', role: 'staff' });
    const r = await signInWithIdToken(token, verifierFor(phone), { now: NOW });
    expect(r.to).toBe('/');
    const row = (await getPool().query('select business_id, role from sessions where id = $1', [r.sessionId])).rows[0];
    expect(row).toEqual({ business_id: owner.businessId, role: 'staff' });
  });

  it('a token that fails verification, is older than five minutes, or carries no phone signs nobody in', async () => {
    await expect(
      signInWithIdToken(
        token,
        async () => {
          throw new Error('bad signature');
        },
        { now: NOW },
      ),
    ).rejects.toEqual(new OtpError('otp.invalid'));
    await expect(
      signInWithIdToken(token, verifierFor('+919812345678', NOW / 1000 - 600), { now: NOW }),
    ).rejects.toEqual(new OtpError('otp.stale'));
    await expect(signInWithIdToken(token, verifierFor(undefined), { now: NOW })).rejects.toEqual(
      new OtpError('otp.noPhone'),
    );
    await expect(signInWithIdToken('short', verifierFor('+919812345678'), { now: NOW })).rejects.toEqual(
      new OtpError('otp.invalid'),
    );
  });
});
