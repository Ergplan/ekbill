'use client';

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
import { manifest } from './manifest';

const PHONE_RE = /^[6-9]\d{9}$/;
const EMPTY_LOGIN = { phone: '' };

export function LoginScreen({ state }: { state: 'phone' | 'code' }) {
  const router = useRouter();
  const guide = useTour(manifest.tour);
  const [login, setLogin] = useDraft<{ phone: string }>('login', EMPTY_LOGIN);
  const phone = login.phone;
  const setPhone = (p: string) => setLogin({ phone: p });
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  // The SMS code fills in by itself (autocomplete=one-time-code); six digits move on without a tap.
  useEffect(() => {
    if (state === 'code' && code.length === 6) router.push('/setup/name');
  }, [code, state, router]);

  const sendCode = () => {
    const digits = phone.replace(/\D/g, '').replace(/^91/, '');
    if (!PHONE_RE.test(digits)) {
      setError(t('login.phone.error'));
      return;
    }
    setLogin({ phone: digits });
    router.push('/login?state=code');
  };

  return (
    <main className="eb-screen">
      <header className="eb-topbar">
        <div className="eb-topbar__left">
          <IconButton
            name="back"
            label={t('action.back')}
            data-guide="back"
            onClick={() => router.push(state === 'code' ? '/login' : '/welcome')}
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
              <PrimaryCTA data-guide="next" onClick={sendCode}>
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
            <Meta>{t('login.code.resend', { time: '0:30' })}</Meta>
          </>
        )}
        <p className="eb-meta">
          <a href="/dev/switch">{t('login.dev')}</a>
        </p>
      </div>
      <GuideHighlight step={guide.step} onDone={guide.next} />
    </main>
  );
}
