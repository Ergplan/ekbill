'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { t } from '@ekbill/copy';
import {
  Display,
  Field,
  GhostButton,
  GuideHighlight,
  HeroPanel,
  Icon,
  IconButton,
  Input,
  Meta,
  OtpInput,
  PrimaryCTA,
  useTour,
} from '@ekbill/ui';

import { useDraft } from '../draft';
import { manifest } from './manifest';

const PHONE_RE = /^[6-9]\d{9}$/;
const EMPTY_LOGIN = { phone: '' };
/** Seconds before another code may be asked for (Twilio sends at most five an hour to a number). */
const RESEND_AFTER = 30;

/** POSTs to one of the sign-in routes; answers the body, or throws the route's error key. */
async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? 'otp.send.failed');
  return json;
}
const errorKey = (e: unknown) =>
  e instanceof Error && /^(otp|rate)\./.test(e.message) ? e.message : 'otp.send.failed';

/**
 * Sign-in. In the build (switcher) the approved prototype: the code step
 * hands over to /dev/switch. With OTP on (`otp`) EkBill's server has Twilio
 * send the SMS and checks the code (19 Oct); both steps stay on this screen,
 * so the pending code is not lost to a navigation; six digits confirm by
 * themselves, and after 30 seconds another code can be asked for.
 */
export function LoginScreen({ state: asked, otp = false }: { state: 'phone' | 'code'; otp?: boolean }) {
  const router = useRouter();
  const [otpStep, setOtpStep] = useState<'phone' | 'code'>('phone');
  const [busy, setBusy] = useState(false);
  // When another code may be asked for (a clock time, so a phone that slows the page's timers still counts right).
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(0);
  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000));
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
    if (busy) return;
    const id = window.setTimeout(() => {
      setBusy(true);
      void post<{ to: string }>('/api/auth/otp/check', { phone: `+91${phone}`, code })
        .then(({ to }) => router.push(to))
        .catch((e: unknown) => {
          setError(t(errorKey(e)));
          setCode('');
        })
        .finally(() => setBusy(false));
    }, 0);
    return () => window.clearTimeout(id);
  }, [code, state, router, otp, busy, phone]);

  // Chrome on Android reads the SMS itself when its last line is "@<this site> #<code>" (WebOTP; the Twilio template
  // deploy/vm/twilio-template.sh asks for) and offers the code; taken, it fills the six boxes and signs in as typed.
  // A new code (resend) starts a new wait; leaving the step stops it. Safari needs none of this (one-time-code).
  useEffect(() => {
    if (!otp || state !== 'code' || !('OTPCredential' in window)) return;
    const ac = new AbortController();
    navigator.credentials
      .get({ otp: { transport: ['sms'] }, signal: ac.signal } as CredentialRequestOptions)
      .then((cred) => {
        const got = (cred as { code?: string } | null)?.code ?? '';
        if (/^\d{6}$/.test(got)) setCode(got);
      })
      .catch(() => undefined);
    return () => ac.abort();
  }, [otp, state, resendAt]);

  // The resend count-down, read off the clock every half second while the code screen is up.
  useEffect(() => {
    if (!otp || state !== 'code' || !resendAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [otp, state, resendAt]);

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
    void post('/api/auth/otp/send', { phone: `+91${digits}` })
      .then(() => {
        setCode('');
        setError(null);
        setResendAt(Date.now() + RESEND_AFTER * 1000);
        setNow(Date.now());
        setOtpStep('code');
      })
      .catch((e: unknown) => setError(t(errorKey(e))))
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
            <Icon name="help" size={20} />
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
            {otp && wait <= 0 ? (
              <div className="eb-actions">
                <GhostButton data-guide="resend" disabled={busy} onClick={sendCode}>
                  {t('login.code.resend.now')}
                </GhostButton>
              </div>
            ) : (
              <Meta>{t('login.code.resend', { time: `0:${String(otp ? wait : 30).padStart(2, '0')}` })}</Meta>
            )}
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
