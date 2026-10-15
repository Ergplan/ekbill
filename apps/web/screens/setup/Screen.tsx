'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { t } from '@ekbill/copy';
import { checkGstin, checkPan } from '@ekbill/engine';
import {
  ChoiceList,
  Display,
  Field,
  GhostButton,
  GuideHighlight,
  IconButton,
  Input,
  Meta,
  PrimaryCTA,
  SettingGroup,
  SettingRow,
  SignaturePad,
  useTour,
} from '@ekbill/ui';

import { useDraft } from '../draft';
import { manifest, type SetupStep } from './manifest';

export interface SetupDraft {
  name: string;
  gst: 'yes' | 'composition' | 'no' | 'unknown' | null;
  gstin: string;
  pan: string;
  turnover: 'a' | 'b' | 'c' | 'd' | null;
  irn: 'yes' | 'no' | 'unknown' | null;
  upi: string;
  city: string;
  signature: string | null;
}
const EMPTY: SetupDraft = {
  name: '',
  gst: null,
  gstin: '',
  pan: '',
  turnover: null,
  irn: null,
  upi: '',
  city: '',
  signature: null,
};

/** The next question, given the answers so far (8.0: only what the GST answer needs). */
export function nextStep(step: SetupStep, d: SetupDraft): SetupStep | 'home' {
  switch (step) {
    case 'name':
      return 'gst';
    case 'gst':
      return d.gst === 'yes' || d.gst === 'composition' ? 'gstin' : 'review';
    case 'gstin':
      return d.gst === 'yes' ? 'turnover' : 'review';
    case 'turnover':
      return d.turnover === 'd' ? 'irn' : 'review';
    case 'irn':
      return 'review';
    case 'review':
      return 'home';
    case 'pan':
      return 'upi';
    case 'upi':
      return 'city';
    case 'city':
      return 'sign';
    case 'sign':
      return 'review';
    default:
      return 'review';
  }
}
export function prevStep(step: SetupStep, d: SetupDraft): SetupStep | 'login' {
  switch (step) {
    case 'name':
      return 'login';
    case 'gst':
      return 'name';
    case 'gstin':
      return 'gst';
    case 'turnover':
      return 'gstin';
    case 'irn':
      return 'turnover';
    case 'review':
      return d.gst === 'yes' ? (d.turnover === 'd' ? 'irn' : 'turnover') : d.gst === 'composition' ? 'gstin' : 'gst';
    case 'pan':
      return 'review';
    case 'upi':
      return 'pan';
    case 'city':
      return 'upi';
    case 'sign':
      return 'city';
    default:
      return 'review';
  }
}

const GSTIN_ERROR: Record<string, string> = {
  length: 'setup.gstin.error.length',
  format: 'setup.gstin.error.format',
  'unknown-state': 'setup.gstin.error.state',
  checksum: 'setup.gstin.error.checksum',
  empty: 'setup.gstin.error.length',
};

export function SetupScreen({ step }: { step: SetupStep }) {
  const router = useRouter();
  const guide = useTour(manifest.tour);
  const [d, setD] = useDraft<SetupDraft>('setup', EMPTY);
  const [error, setError] = useState<string | null>(null);
  const patch = (p: Partial<SetupDraft>) => {
    setError(null);
    setD((cur) => ({ ...cur, ...p }));
  };
  const gstinCheck = useMemo(() => (d.gstin ? checkGstin(d.gstin) : null), [d.gstin]);
  const go = (to: SetupStep | 'home' | 'login') =>
    router.push(to === 'home' ? '/' : to === 'login' ? '/login' : `/setup/${to}`);
  const advance = (override?: Partial<SetupDraft>) => {
    const next = { ...d, ...override };
    if (step === 'name' && !next.name.trim()) {
      setError(t('setup.name.error'));
      return;
    }
    if (step === 'gstin') {
      const c = checkGstin(next.gstin);
      if (!c.ok) {
        setError(t(GSTIN_ERROR[c.problem ?? 'format'] ?? 'setup.gstin.error.format'));
        return;
      }
      next.gstin = c.normalised;
      next.pan = c.pan ?? next.pan;
      if (!next.city && c.stateName) next.city = c.stateName;
    }
    if (step === 'pan' && next.pan && !checkPan(next.pan).ok) {
      setError(t('setup.pan.error'));
      return;
    }
    const derived = step === 'gstin' ? { gstin: next.gstin, pan: next.pan, city: next.city } : {};
    if (override || step === 'gstin') patch({ ...override, ...derived });
    go(nextStep(step, next));
  };
  const skip = () => go(nextStep(step, d));

  const stepIndex = ['name', 'gst', 'gstin', 'turnover', 'irn', 'review'].indexOf(step);
  const total = d.gst === 'yes' ? (d.turnover === 'd' ? 6 : 5) : d.gst === 'composition' ? 4 : 3;

  return (
    <main className="eb-screen">
      <header className="eb-topbar">
        <div className="eb-topbar__left">
          <IconButton name="back" label={t('action.back')} data-guide="back" onClick={() => go(prevStep(step, d))} />
          {stepIndex >= 0 ? (
            <div className="eb-topbar__sub">{t('setup.step', { n: Math.min(stepIndex + 1, total), total })}</div>
          ) : null}
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
        {step === 'name' ? (
          <>
            <section className="eb-question" data-guide="hello">
              <Meta>{t('setup.hello')}</Meta>
              <Display as="h1">{t('setup.name.q')}</Display>
            </section>
            <Field id="name" label={t('profile.name')} hint={t('setup.name.hint')} error={error}>
              <div data-guide="answer">
                <Input
                  id="name"
                  large
                  autoFocus
                  value={d.name}
                  onChange={(e) => patch({ name: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && advance()}
                  maxLength={120}
                />
              </div>
            </Field>
            <div className="eb-sticky eb-sticky--bare">
              <PrimaryCTA data-guide="next" onClick={() => advance()}>
                {t('action.next')}
              </PrimaryCTA>
            </div>
          </>
        ) : null}

        {step === 'gst' ? (
          <>
            <section className="eb-question">
              <Display as="h1">{t('setup.gst.q')}</Display>
            </section>
            <ChoiceList
              guide="answer"
              label={t('setup.gst.q')}
              value={d.gst}
              onChoose={(v) => advance({ gst: v })}
              choices={[
                { value: 'yes', label: t('setup.gst.yes') },
                { value: 'composition', label: t('setup.gst.composition') },
                { value: 'no', label: t('setup.gst.no') },
                { value: 'unknown', label: t('setup.gst.unknown'), sub: t('setup.gst.unknown.note') },
              ]}
            />
          </>
        ) : null}

        {step === 'gstin' ? (
          <>
            <section className="eb-question">
              <Display as="h1">{t('setup.gstin.q')}</Display>
            </section>
            <Field
              id="gstin"
              label={t('profile.gst')}
              hint={
                gstinCheck?.ok
                  ? t('setup.gstin.ok', { state: gstinCheck.stateName ?? '', pan: gstinCheck.pan ?? '' })
                  : t('setup.gstin.hint')
              }
              error={error}
            >
              <div data-guide="answer">
                <Input
                  id="gstin"
                  large
                  autoFocus
                  autoCapitalize="characters"
                  value={d.gstin}
                  onChange={(e) => patch({ gstin: e.target.value.toUpperCase() })}
                  onKeyDown={(e) => e.key === 'Enter' && advance()}
                  maxLength={15}
                />
              </div>
            </Field>
            <div className="eb-sticky eb-sticky--bare">
              <PrimaryCTA data-guide="next" onClick={() => advance()}>
                {t('action.next')}
              </PrimaryCTA>
            </div>
          </>
        ) : null}

        {step === 'turnover' ? (
          <>
            <section className="eb-question">
              <Display as="h1">{t('setup.turnover.q')}</Display>
            </section>
            <ChoiceList
              guide="answer"
              label={t('setup.turnover.q')}
              value={d.turnover}
              onChoose={(v) => advance({ turnover: v })}
              choices={[
                { value: 'a', label: t('setup.turnover.a') },
                { value: 'b', label: t('setup.turnover.b') },
                { value: 'c', label: t('setup.turnover.c') },
                { value: 'd', label: t('setup.turnover.d') },
              ]}
            />
          </>
        ) : null}

        {step === 'irn' ? (
          <>
            <section className="eb-question">
              <Display as="h1">{t('setup.irn.q')}</Display>
            </section>
            <ChoiceList
              guide="answer"
              label={t('setup.irn.q')}
              value={d.irn}
              onChoose={(v) => advance({ irn: v })}
              choices={[
                { value: 'yes', label: t('setup.irn.yes') },
                { value: 'no', label: t('setup.irn.no') },
                { value: 'unknown', label: t('setup.irn.unknown') },
              ]}
            />
          </>
        ) : null}

        {step === 'pan' ? (
          <>
            <section className="eb-question">
              <Display as="h1">{t('setup.pan.q')}</Display>
            </section>
            <Field id="pan" label={t('setup.review.row.pan')} hint={t('setup.pan.hint')} error={error}>
              <div data-guide="answer">
                <Input
                  id="pan"
                  large
                  autoFocus
                  autoCapitalize="characters"
                  value={d.pan}
                  onChange={(e) => patch({ pan: e.target.value.toUpperCase() })}
                  onKeyDown={(e) => e.key === 'Enter' && advance()}
                  maxLength={10}
                />
              </div>
            </Field>
            <div className="eb-actions eb-actions--stack eb-sticky eb-sticky--bare">
              <PrimaryCTA data-guide="next" onClick={() => advance()}>
                {t('action.next')}
              </PrimaryCTA>
              <GhostButton data-guide="skip" onClick={skip}>
                {t('action.skip')}
              </GhostButton>
            </div>
          </>
        ) : null}

        {step === 'upi' ? (
          <>
            <section className="eb-question">
              <Display as="h1">{t('setup.upi.q')}</Display>
            </section>
            <Field id="upi" label={t('profile.upi')} hint={t('setup.upi.hint')}>
              <div data-guide="answer">
                <Input
                  id="upi"
                  large
                  autoFocus
                  value={d.upi}
                  placeholder="naam@bank"
                  onChange={(e) => patch({ upi: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && advance()}
                  maxLength={60}
                />
              </div>
            </Field>
            <div className="eb-actions eb-actions--stack eb-sticky eb-sticky--bare">
              <PrimaryCTA data-guide="next" onClick={() => advance()}>
                {t('action.next')}
              </PrimaryCTA>
              <GhostButton data-guide="skip" onClick={skip}>
                {t('action.skip')}
              </GhostButton>
            </div>
          </>
        ) : null}

        {step === 'city' ? (
          <>
            <section className="eb-question">
              <Display as="h1">{t('setup.city.q')}</Display>
            </section>
            <Field
              id="city"
              label={t('profile.city')}
              hint={
                gstinCheck?.ok ? t('setup.city.prefilled', { state: gstinCheck.stateName ?? '' }) : t('setup.city.hint')
              }
            >
              <div data-guide="answer">
                <Input
                  id="city"
                  large
                  autoFocus
                  value={d.city}
                  onChange={(e) => patch({ city: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && advance()}
                  maxLength={80}
                />
              </div>
            </Field>
            <div className="eb-actions eb-actions--stack eb-sticky eb-sticky--bare">
              <PrimaryCTA data-guide="next" onClick={() => advance()}>
                {t('action.next')}
              </PrimaryCTA>
              <GhostButton data-guide="skip" onClick={skip}>
                {t('action.skip')}
              </GhostButton>
            </div>
          </>
        ) : null}

        {step === 'sign' ? (
          <>
            <section className="eb-question">
              <Display as="h1">{t('setup.sign.q')}</Display>
            </section>
            <div data-guide="answer">
              <SignaturePad
                onChange={(png) => patch({ signature: png })}
                clearLabel={t('setup.sign.clear')}
                hint={t('setup.sign.hint')}
              />
            </div>
            <div className="eb-actions eb-actions--stack eb-sticky eb-sticky--bare">
              <PrimaryCTA data-guide="next" onClick={() => advance()}>
                {t('action.next')}
              </PrimaryCTA>
              <GhostButton data-guide="skip" onClick={skip}>
                {t('action.skip')}
              </GhostButton>
            </div>
          </>
        ) : null}

        {step === 'review' ? (
          <>
            <section className="eb-question">
              <Display as="h1">{t('setup.review.q')}</Display>
              <Meta>{t('setup.enough.sub')}</Meta>
            </section>
            <SettingGroup guide="answer">
              <SettingRow
                label={t('setup.review.row.name')}
                value={d.name || t('setup.review.empty')}
                onClick={() => go('name')}
              />
              <SettingRow
                label={t('setup.review.row.gst')}
                value={
                  d.gst === 'yes'
                    ? d.gstin
                    : d.gst === 'composition'
                      ? `${t('setup.gst.composition')} · ${d.gstin}`
                      : d.gst === 'no'
                        ? t('setup.gst.no')
                        : t('setup.gst.unknown')
                }
                onClick={() => go('gst')}
              />
              {d.gst === 'yes' ? (
                <SettingRow
                  label={t('setup.review.row.turnover')}
                  value={d.turnover ? t(`setup.turnover.${d.turnover}`) : t('setup.review.empty')}
                  onClick={() => go('turnover')}
                />
              ) : null}
              <SettingRow
                label={t('setup.review.row.pan')}
                value={d.pan || t('setup.review.empty')}
                onClick={() => go('pan')}
              />
              <SettingRow
                label={t('setup.review.row.upi')}
                value={d.upi || t('setup.review.empty')}
                onClick={() => go('upi')}
              />
              <SettingRow
                label={t('setup.review.row.city')}
                value={d.city || t('setup.review.empty')}
                onClick={() => go('city')}
              />
              <SettingRow
                label={t('setup.review.row.sign')}
                value={d.signature ? t('action.done') : t('setup.review.empty')}
                onClick={() => go('sign')}
              />
            </SettingGroup>
            <div className="eb-actions eb-actions--stack eb-sticky eb-sticky--bare">
              <PrimaryCTA data-guide="go" onClick={() => go('home')}>
                {t('setup.go')}
              </PrimaryCTA>
              {!d.upi || !d.signature ? (
                <GhostButton data-guide="more" onClick={() => go('pan')}>
                  {t('setup.enough.more')}
                </GhostButton>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
      <GuideHighlight step={guide.step} onDone={guide.next} />
    </main>
  );
}
