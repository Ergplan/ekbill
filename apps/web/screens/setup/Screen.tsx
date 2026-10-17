'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { t } from '@ekbill/copy';
import {
  GST_STATES,
  checkGstin,
  checkPan,
  compositionRule,
  todayIst,
  type ProfileField,
  type TurnoverBand,
} from '@ekbill/engine';
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

import { finishSetup, setBusinessFile } from '../../actions/business';
import { clearDraft, useDraft } from '../draft';
import { useVoice } from '../voice/VoiceProvider';
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
  stateCode: string;
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
  stateCode: '',
  signature: null,
};

const BAND: Record<NonNullable<SetupDraft['turnover']>, TurnoverBand> = {
  a: '40l',
  b: '40l-1.5cr',
  c: '1.5-5cr',
  d: '5cr+',
};
/** Which step a refused field is answered on, so the owner lands where the fix is. */
const STEP_OF_FIELD: Partial<Record<ProfileField, SetupStep>> = {
  name: 'name',
  gst: 'gst',
  gstin: 'gstin',
  pan: 'pan',
  turnoverBand: 'turnover',
  eInvoicingApplies: 'irn',
  compositionLegend: 'gst',
  upi: 'upi',
  city: 'city',
  stateCode: 'city',
};

/** The answers as the server takes them (the engine checks them again there). */
export function profileOfDraft(d: SetupDraft, legend: string | null) {
  return {
    legalName: d.name.trim(),
    tradeName: null,
    gst: d.gst ?? 'unknown',
    gstin: d.gstin.trim() || null,
    pan: d.pan.trim() || null,
    turnoverBand: d.gst === 'yes' && d.turnover ? BAND[d.turnover] : null,
    eInvoicingApplies: d.turnover === 'd' ? (d.irn === 'yes' ? true : d.irn === 'no' ? false : null) : null,
    compositionLegend: d.gst === 'composition' ? legend : null,
    upi: d.upi.trim() || null,
    city: d.city.trim() || null,
    stateCode: d.stateCode || null,
  };
}

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
  const [saving, setSaving] = useState(false);
  // The legend a composition business prints, from the pack as of today.
  const legend = useMemo(() => compositionRule(todayIst(new Date()))?.legend ?? null, []);
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
      next.stateCode = c.stateCode ?? next.stateCode;
    }
    if (step === 'pan' && next.pan && !checkPan(next.pan).ok) {
      setError(t('setup.pan.error'));
      return;
    }
    const derived = step === 'gstin' ? { gstin: next.gstin, pan: next.pan, stateCode: next.stateCode } : {};
    if (override || step === 'gstin') patch({ ...override, ...derived });
    go(nextStep(step, next));
  };
  const skip = () => go(nextStep(step, d));
  /** "Chalo, shuru karte hain": the business is made (or re-saved) with these answers; the signature follows. */
  const finish = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    const r = await finishSetup(profileOfDraft(d, legend));
    if (!r.ok) {
      setSaving(false);
      setError(t(r.error, 'say' in r && r.say ? r.say.params : undefined));
      const at = 'field' in r && r.field ? STEP_OF_FIELD[r.field as ProfileField] : undefined;
      if (at && at !== step) go(at);
      return;
    }
    // The business is made; a refused signature is said here, before Home (Stage 4 review: it was lost), and Shuru
    // karo again saves the profile on the same business and tries without it.
    if (d.signature) {
      const f = await setBusinessFile({ kind: 'signature', dataUrl: d.signature });
      if (!f.ok) {
        setSaving(false);
        patch({ signature: null });
        setError(t(f.error, 'say' in f && f.say ? f.say.params : undefined));
        return;
      }
    }
    clearDraft('setup');
    router.push('/');
  };

  // The voice walks the questions too (Stage 9): the mic starts it here, before there is a tab bar.
  const voice = useVoice();
  const stepIndex = ['name', 'gst', 'gstin', 'turnover', 'irn', 'review'].indexOf(step);
  const total = d.gst === 'yes' ? (d.turnover === 'd' ? 6 : 5) : d.gst === 'composition' ? 4 : 3;

  return (
    <main className="eb-screen">
      <header className="eb-topbar">
        <div className="eb-topbar__left">
          <IconButton
            name="back"
            label={t('action.back')}
            data-guide="back"
            data-voice="safe"
            onClick={() => go(prevStep(step, d))}
          />
          {stepIndex >= 0 ? (
            <div className="eb-topbar__sub">{t('setup.step', { n: Math.min(stepIndex + 1, total), total })}</div>
          ) : null}
        </div>
        <div className="eb-topbar__right">
          {voice?.available ? (
            <IconButton name="mic" label={t('action.mic')} data-guide="mic" data-voice="owner" onClick={voice.toggle} />
          ) : null}
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
              <PrimaryCTA data-guide="next" data-voice="safe" onClick={() => advance()}>
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
              <PrimaryCTA data-guide="next" data-voice="safe" onClick={() => advance()}>
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
              <PrimaryCTA data-guide="next" data-voice="safe" onClick={() => advance()}>
                {t('action.next')}
              </PrimaryCTA>
              <GhostButton data-guide="skip" data-voice="safe" onClick={skip}>
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
              <PrimaryCTA data-guide="next" data-voice="safe" onClick={() => advance()}>
                {t('action.next')}
              </PrimaryCTA>
              <GhostButton data-guide="skip" data-voice="safe" onClick={skip}>
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
            <Field id="state" label={t('setup.review.row.state')} hint={gstinCheck?.ok ? null : t('setup.state.q')}>
              <select
                id="state"
                className="eb-input"
                value={d.stateCode}
                disabled={Boolean(gstinCheck?.ok)}
                onChange={(e) => patch({ stateCode: e.target.value })}
              >
                <option value="">—</option>
                {GST_STATES.map((st) => (
                  <option key={st.code} value={st.code}>
                    {st.code} · {st.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="eb-actions eb-actions--stack eb-sticky eb-sticky--bare">
              <PrimaryCTA data-guide="next" data-voice="safe" onClick={() => advance()}>
                {t('action.next')}
              </PrimaryCTA>
              <GhostButton data-guide="skip" data-voice="safe" onClick={skip}>
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
              <PrimaryCTA data-guide="next" data-voice="safe" onClick={() => advance()}>
                {t('action.next')}
              </PrimaryCTA>
              <GhostButton data-guide="skip" data-voice="safe" onClick={skip}>
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
              {d.gst === 'yes' && d.turnover === 'd' ? (
                <SettingRow
                  label={t('setup.review.row.irn')}
                  value={d.irn ? t(`setup.irn.${d.irn}`) : t('setup.review.empty')}
                  onClick={() => go('irn')}
                />
              ) : null}
              {d.gst === 'composition' && legend ? (
                <SettingRow label={t('setup.review.row.legend')} value={legend} locked />
              ) : null}
              <SettingRow
                label={t('setup.review.row.city')}
                value={d.city || t('setup.review.empty')}
                onClick={() => go('city')}
              />
              <SettingRow
                label={t('setup.review.row.state')}
                value={GST_STATES.find((st) => st.code === d.stateCode)?.name ?? t('setup.review.empty')}
                onClick={() => go('city')}
              />
              <SettingRow
                label={t('setup.review.row.sign')}
                value={d.signature ? t('action.done') : t('setup.review.empty')}
                onClick={() => go('sign')}
              />
            </SettingGroup>
            {error ? (
              <p className="eb-field__error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="eb-actions eb-actions--stack eb-sticky eb-sticky--bare">
              <PrimaryCTA data-guide="go" onClick={() => void finish()} disabled={saving}>
                {saving ? t('setup.saving') : t('setup.go')}
              </PrimaryCTA>
              {!d.upi || !d.signature ? (
                <GhostButton data-guide="more" data-voice="safe" onClick={() => go('pan')}>
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
