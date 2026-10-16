'use client';

import type { ConfirmationResult } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { t } from '@ekbill/copy';
import {
  Display,
  Field,
  GuideHighlight,
  HeroPanel,
  IconButton,
  Input,
  Meta,
  OtpInput,
  PrimaryCTA,
  useTour,
} from '@ekbill/ui';

import { useDraft } from '../draft';
import type { OtpConfig } from './firebase';
import { manifest } from './manifest';

const PHONE_RE = /^[6-9]\d{9}$/;
const EMPTY_LOGIN = { phone: '' };

/**
 * Sign-in. In the build (switcher) the approved prototype: the code step
 * hands over to /dev/switch. With OTP on (Stage 10, `otp` given) the SMS goes
 * through Firebase and both steps stay on this screen, so the pending code is
 * not lost to a navigation; six digits confirm by themselves.
 */
export function LoginScreen({ state: asked, otp }: { state: 'phone' | 'code'; otp?: OtpConfig | null }) {
  const router = useRouter();
  const [otpStep, setOtpStep] = useState<'phone' | 'code'>('phone');
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const state = otp ? otpStep : asked;
  const guide = useTour(manifest.tour);
  const [login, setLogin] = useDraft<{ phone: string }>('login', EMPTY_LOGIN);
  const phone = login.phone;
  const setPhone = (p: string) => setLogin({ phone: p });
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  // The SMS code fills in by itself (autocomplete=one-time-code); six digits move on without a tap.
  useEffect(() => {
    if (state !== 'code' || code.length !== 6) return;
    // Sign-in is off (the build): the phone typed is who signs in, a number EkBill has not seen a new owner, as the
    // OTP sign-in does it. Reached without a phone (the screen opened on its own), the brand-new owner of the seed.
    if (!otp) {
      router.push(
        PHONE_RE.test(phone)
          ? `/dev/switch/${encodeURIComponent(`+91${phone}`)}?signin=1`
          : '/dev/switch/new?to=/setup/name',
      );
      return;
    }
    if (!confirmation || busy) return;
    const id = window.setTimeout(() => {
      setBusy(true);
      void import('./firebase')
        .then(({ confirmCode }) => confirmCode(confirmation, code))
        .then((to) => router.push(to))
        .catch((e: unknown) => {
          const key = e instanceof Error && e.message.startsWith('otp.') ? e.message : 'otp.invalid';
          setError(t(key));
          setCode('');
        })
        .finally(() => setBusy(false));
    }, 0);
    return () => window.clearTimeout(id);
  }, [code, state, router, otp, confirmation, busy, phone]);

  // With sign-in off no SMS comes: the code fills itself in, as the screen says it will, after a phone was typed here.
  useEffect(() => {
    if (otp || state !== 'code' || !PHONE_RE.test(phone) || code) return;
    const id = window.setTimeout(() => setCode('123456'), 1500);
    return () => window.clearTimeout(id);
  }, [otp, state, phone, code]);

  const sendCode = () => {
    // +91 98xxx: drop the country code only when it is one (12 digits); a 10-digit number may itself start with 91.
    let digits = phone.replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
    if (!PHONE_RE.test(digits)) {
      setError(t('login.phone.error'));
      return;
    }
    setLogin({ phone: digits });
    if (!otp) {
      router.push('/login?state=code');
      return;
    }
    setBusy(true);
    void import('./firebase')
      .then(({ sendCode: send }) => send(otp, `+91${digits}`, 'otp-send'))
      .then((c) => {
        setConfirmation(c);
        setOtpStep('code');
      })
      .catch(() => setError(t('otp.send.failed')))
      .finally(() => setBusy(false));
  };

  return (
    <main className="eb-screen">
      <header className="eb-topbar">
        <div className="eb-topbar__left">
          <IconButton
            name="back"
            label={t('action.back')}
            data-guide="back"
            onClick={() => {
              if (otp && state === 'code') setOtpStep('phone');
              else router.push(state === 'code' ? '/login' : '/welcome');
            }}
          />
        </div>
        <div className="eb-topbar__right">
          <button
            type="button"
            className="eb-iconbtn"
            aria-label={t('action.tour')}
            data-testid="tour"
            onClick={guide.start}
          >
            ?
          </button>
        </div>
      </header>
      <div className="eb-screen__body">
        <HeroPanel eyebrow="EkBill" title={t('auth.hero')} />
        {state === 'phone' ? (
          <>
            <section className="eb-question">
              <Display as="h1">{t('login.phone.title')}</Display>
              <Meta>{t('login.phone.sub')}</Meta>
            </section>
            <Field id="phone" label={t('login.phone.label')} error={error}>
              <div data-guide="phone">
                <Input
                  id="phone"
                  large
                  numeric
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+91"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && sendCode()}
                />
              </div>
            </Field>
            <div className="eb-sticky eb-sticky--bare">
              <PrimaryCTA data-guide="next" id="otp-send" disabled={busy} onClick={sendCode}>
                {t('action.next')}
              </PrimaryCTA>
            </div>
          </>
        ) : (
          <>
            <section className="eb-question">
              <Display as="h1">{t('login.code.title')}</Display>
              <Meta>{t('login.code.sub', { phone: `+91 ${phone || '98XXX XXXXX'}` })}</Meta>
            </section>
            <OtpInput value={code} onChange={setCode} label={t('login.code.label')} guide="code" />
            {error ? (
              <p className="eb-meta" role="alert">
                {error}
              </p>
            ) : null}
            <Meta>{t('login.code.resend', { time: '0:30' })}</Meta>
          </>
        )}
        {otp ? null : (
          <p className="eb-meta">
            <a href="/dev/switch">{t('login.dev')}</a>
          </p>
        )}
      </div>
      <GuideHighlight step={guide.step} onDone={guide.next} />
    </main>
  );
}
