'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { LOCALES, LOCALE_NAMES, t, type Locale } from '@ekbill/copy';
import {
  ANSWER_OF_REGISTRATION,
  BILL_ACCENTS,
  BILL_DESIGNS,
  BILL_PAPERS,
  GST_STATES,
  PAYMENT_TERMS,
  TURNOVER_BANDS,
  checkProfile,
  formatNumber,
  type ProfileInput,
  type SetupAnswer,
  type TurnoverBand,
} from '@ekbill/engine';
import {
  Avatar,
  Display,
  Field,
  FileDoor,
  GhostButton,
  Input,
  Meta,
  PrimaryCTA,
  FilterChips,
  Segmented,
  SettingGroup,
  SettingRow,
  Sheet,
  SignaturePad,
  ThemeSwitch,
  readPicked,
} from '@ekbill/ui';

import {
  addSeries,
  changeSeries,
  chooseDefaultSeries,
  saveLook,
  saveProfile,
  setBusinessFile,
} from '../../actions/business';
import { setLanguage, setName, setTheme } from '../../actions/user';
import { withAs } from '../links';
import { AppShell, type ShellViewer } from '../shell/AppShell';
import type { AapData, SeriesRow } from './data';
import { switchLanguage } from './langSwitch';
import { useDemo } from '../demo/DemoProvider';
import { useVoice } from '../voice/VoiceProvider';
import { manifest } from './manifest';

const TURNOVER: Record<string, string> = {
  '40l': 'setup.turnover.a',
  '40l-1.5cr': 'setup.turnover.b',
  '1.5-5cr': 'setup.turnover.c',
  '5cr+': 'setup.turnover.d',
};
const BAND_KEY: Record<TurnoverBand, string> = {
  '40l': 'setup.turnover.a',
  '40l-1.5cr': 'setup.turnover.b',
  '1.5-5cr': 'setup.turnover.c',
  '5cr+': 'setup.turnover.d',
};

/** The form the owner edits: the profile input as the action takes it, every text field a string. */
interface Form {
  legalName: string;
  tradeName: string;
  gst: SetupAnswer;
  gstin: string;
  pan: string;
  turnoverBand: TurnoverBand | '';
  eInvoicingApplies: 'yes' | 'no' | 'unknown';
  compositionLegend: string;
  phone: string;
  email: string;
  upi: string;
  address: string;
  city: string;
  pincode: string;
  stateCode: string;
  bankName: string;
  bankAccount: string;
  bankIfsc: string;
  bankHolder: string;
  defaultPaymentTermsDays: number;
  voiceOnArrival: boolean;
}
type Editing = null | 'person' | 'dukaan' | 'paise' | 'look' | 'series' | 'sign';

function formOf(p: NonNullable<AapData['profile']>): Form {
  return {
    legalName: p.legalName,
    tradeName: p.tradeName,
    gst: ANSWER_OF_REGISTRATION[p.registrationType],
    gstin: p.gstin ?? '',
    pan: p.pan ?? '',
    turnoverBand: p.turnoverBand ?? '',
    eInvoicingApplies: p.eInvoicingApplies === true ? 'yes' : p.eInvoicingApplies === false ? 'no' : 'unknown',
    compositionLegend: p.compositionLegend ?? '',
    phone: p.phone ?? '',
    email: p.email ?? '',
    upi: p.upi ?? '',
    address: p.address ?? '',
    city: p.city ?? '',
    pincode: p.pincode ?? '',
    stateCode: p.stateCode ?? '',
    bankName: p.bankName ?? '',
    bankAccount: p.bankAccount ?? '',
    bankIfsc: p.bankIfsc ?? '',
    bankHolder: p.bankHolder ?? '',
    defaultPaymentTermsDays: p.defaultPaymentTermsDays,
    voiceOnArrival: p.voiceOnArrival,
  };
}
const orNull = (v: string) => v.trim() || null;
/** The form as the action (and the engine) takes it. */
export function inputOf(f: Form): ProfileInput & { legalName: string } {
  return {
    legalName: f.legalName,
    name: f.legalName,
    tradeName: orNull(f.tradeName),
    gst: f.gst,
    gstin: orNull(f.gstin),
    pan: orNull(f.pan),
    turnoverBand: f.gst === 'yes' && f.turnoverBand ? f.turnoverBand : null,
    eInvoicingApplies:
      f.gst === 'yes' && f.turnoverBand === '5cr+'
        ? f.eInvoicingApplies === 'yes'
          ? true
          : f.eInvoicingApplies === 'no'
            ? false
            : null
        : null,
    compositionLegend: f.gst === 'composition' ? orNull(f.compositionLegend) : null,
    phone: orNull(f.phone),
    email: orNull(f.email),
    upi: orNull(f.upi),
    address: orNull(f.address),
    city: orNull(f.city),
    pincode: orNull(f.pincode),
    stateCode: orNull(f.stateCode),
    bankName: orNull(f.bankName),
    bankAccount: orNull(f.bankAccount),
    bankIfsc: orNull(f.bankIfsc),
    bankHolder: orNull(f.bankHolder),
    defaultPaymentTermsDays: f.defaultPaymentTermsDays,
    voiceOnArrival: f.voiceOnArrival,
  };
}

export function AapScreen({ data, viewer }: { data: AapData; viewer: ShellViewer }) {
  const { business, profile, build, team } = data;
  const router = useRouter();
  const demo = useDemo();
  const as = (href: string) => withAs(href, viewer.as);
  const owner = viewer.role === 'owner';
  const editable = owner && profile !== null;
  const [lang, setLang] = useState<Locale>(viewer.language ?? business.lang);
  const [form, setForm] = useState<Form | null>(profile ? formOf(profile) : null);
  const [savedForm, setSavedForm] = useState<string>(profile ? JSON.stringify(formOf(profile)) : '');
  const [editing, setEditing] = useState<Editing>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string; field?: string } | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(data.logoUrl);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(data.signatureUrl);
  const [signatureDraft, setSignatureDraft] = useState<string | null>(null);
  const [look, setLook] = useState(profile?.look ?? null);
  // The person's own name (19 Oct): Home greets them by it. "Naya user" (not said yet) shows as not told.
  const [personName, setPersonName] = useState(viewer.named ? viewer.personName : '');
  const [personDraft, setPersonDraft] = useState('');
  const [personError, setPersonError] = useState<string | undefined>(undefined);
  const openPerson = viewer.signedIn
    ? () => {
        setPersonDraft(personName);
        setPersonError(undefined);
        setEditing('person');
      }
    : undefined;
  // Home's "Apne baare mein batao" lands here with the name sheet open.
  useEffect(() => {
    if (window.location.hash === '#person') openPerson?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const keepPerson = async () => {
    const name = personDraft.trim();
    if (!name) return;
    const r = await setName({ name }).catch(() => ({ ok: false as const, error: 'error.generic' }));
    if (!r.ok) {
      setPersonError(t(r.error));
      return;
    }
    setPersonName(r.value.name);
    setEditing(null);
    router.refresh();
  };
  const logoDoor = useRef<HTMLInputElement>(null);
  const dirty = form !== null && JSON.stringify(form) !== savedForm;
  // "Saved" says so for a moment, then goes; an error stays until the owner changes something.
  useEffect(() => {
    if (notice?.kind !== 'ok') return;
    const id = window.setTimeout(() => setNotice((n) => (n?.kind === 'ok' ? null : n)), 4000);
    return () => window.clearTimeout(id);
  }, [notice]);
  const patch = (p: Partial<Form>) => {
    setNotice(null);
    setForm((cur) => (cur ? { ...cur, ...p } : cur));
  };
  // What the engine would say about the form right now, so the sheet points at the field as the owner types.
  const problem = useMemo(() => {
    if (!form) return null;
    const c = checkProfile(inputOf(form));
    return c.ok ? null : c;
  }, [form]);

  const save = useCallback(async () => {
    if (!form || saving) return;
    if (!dirty) {
      setNotice({ kind: 'ok', text: t('aap.save.nothing') });
      return;
    }
    if (problem) {
      setNotice({ kind: 'error', text: t(problem.message.key, problem.message.params), field: problem.field });
      return;
    }
    setSaving(true);
    // A save that throws (the network, the server) says so and lets go of the button: it was left disabled for good.
    let r: Awaited<ReturnType<typeof saveProfile>>;
    try {
      r = await saveProfile(inputOf(form));
    } catch {
      setSaving(false);
      setNotice({ kind: 'error', text: t('error.generic') });
      return;
    }
    setSaving(false);
    if (!r.ok) {
      setNotice({
        kind: 'error',
        text: t(r.error, 'say' in r && r.say ? r.say.params : undefined),
        field: 'field' in r ? r.field : undefined,
      });
      return;
    }
    setSavedForm(JSON.stringify(form));
    setNotice({ kind: 'ok', text: t('aap.saved') });
    router.refresh();
  }, [form, saving, dirty, problem, router]);

  const pickLogo = async (files: File[]) => {
    const file = files[0];
    if (!file?.type.startsWith('image/')) return;
    const picked = await readPicked(file, 512);
    if (!picked.dataUrl) {
      setNotice({ kind: 'error', text: t('error.file.not-a-data-url') });
      return;
    }
    const r = await setBusinessFile({ kind: 'logo', dataUrl: picked.dataUrl });
    if (!r.ok) {
      setNotice({ kind: 'error', text: t(r.error, 'say' in r && r.say ? r.say.params : undefined) });
      return;
    }
    setLogoUrl(picked.dataUrl);
    router.refresh();
  };
  const removeLogo = async () => {
    const r = await setBusinessFile({ kind: 'logo', dataUrl: null });
    if (r.ok) {
      setLogoUrl(null);
      router.refresh();
    }
  };
  const keepSignature = async () => {
    const r = await setBusinessFile({ kind: 'signature', dataUrl: signatureDraft });
    if (!r.ok) {
      setNotice({ kind: 'error', text: t(r.error, 'say' in r && r.say ? r.say.params : undefined) });
      return;
    }
    setSignatureUrl(signatureDraft);
    setSignatureDraft(null);
    setEditing(null);
    router.refresh();
  };
  const applyLook = async (next: NonNullable<typeof look>) => {
    setLook(next);
    const r = await saveLook({
      billDesign: next.design,
      billPaper: next.paper,
      billShareAs: next.shareAs,
      billAccent: next.accent,
    });
    if (!r.ok) setNotice({ kind: 'error', text: t(r.error) });
    else router.refresh();
  };

  const seriesText = data.series.length
    ? data.series
        .filter((s) => s.kind === 'bill' && s.active)
        .map((s) =>
          formatNumber(
            { prefix: s.prefix, padding: s.padding, includeFinancialYear: s.includeFy },
            s.fy ?? '2026-27',
            s.nextNumber,
          ),
        )
        .join(' · ')
    : business.series.map((s) => `${s.prefix}-${String(s.next).padStart(3, '0')}`).join(' · ');
  // The live voice is off in this version (21 Oct): its setting, and the tour's line about it, only where it runs.
  const voiceOn = Boolean(useVoice()?.available);
  const tour = manifest.tour.filter((s) => (owner || s.target !== 'save') && (voiceOn || s.target !== 'voice'));
  const gstLabel = (f: Form | null) => {
    const gst =
      f?.gst ??
      ANSWER_OF_REGISTRATION[
        business.registration === 'unregistered'
          ? 'not-registered'
          : business.registration === 'unknown'
            ? 'not-sure'
            : business.registration
      ];
    const gstin = f?.gstin || business.gstin || '';
    return gst === 'yes'
      ? gstin
      : gst === 'composition'
        ? `${t('aap.dukaan.gst.composition')} · ${gstin}`
        : gst === 'no'
          ? t('aap.dukaan.gst.none')
          : t('setup.gst.unknown');
  };
  // The owner taps a row to edit it; a fixture look (?as=, the /flow review) keeps the rows tappable as the prototype drew them.
  const openIf = (which: Editing) => (editable ? () => setEditing(which) : owner ? () => undefined : undefined);
  const fieldError = (field: string) => (notice?.kind === 'error' && notice.field === field ? notice.text : undefined);

  return (
    <AppShell viewer={viewer} tab="you" tour={tour}>
      <section className="eb-heading eb-aap__head">
        <Avatar name={form?.tradeName || business.name} index={0} size="big" />
        <Display as="h1" size="title">
          {form?.tradeName || business.name}
        </Display>
        <Meta>
          {business.ownerName} · {form?.phone || business.phone}
          {!owner ? ` · ${t('aap.staff.note')}` : ''}
        </Meta>
      </section>

      <SettingGroup title={t('nav.profile')} guide="person">
        <SettingRow label={t('aap.person')} value={personName || t('aap.person.empty')} onClick={openPerson} />
      </SettingGroup>
      {/* The language right under the person (20 Oct: "Where is language change mode?"). */}
      <SettingGroup title={t('aap.lang')} guide="lang">
        {/* Five languages, each in its own script; they wrap on a phone. A saved choice changes the words in place,
            with the new language's hello in between (switchLanguage), not a reload (19 Oct). */}
        <div className="eb-settings__block">
          <FilterChips<Locale>
            label={t('aap.lang')}
            value={lang}
            onChange={(v) => {
              const was = lang;
              setLang(v);
              // A save that fails says so and puts the choice back: the screen never shows what was not kept.
              const undo = (text: string) => {
                setLang(was);
                setNotice({ kind: 'error', text });
              };
              let refused = 'error.generic';
              void switchLanguage(
                v,
                async () => {
                  const r = await setLanguage({ language: v });
                  if (!r.ok) refused = r.error;
                  return r.ok;
                },
                () => router.refresh(),
              ).then((ok) => (ok ? undefined : undo(t(refused))));
            }}
            options={LOCALES.map((l) => ({ value: l, label: LOCALE_NAMES[l] }))}
          />
        </div>
      </SettingGroup>

      <SettingGroup title={t('aap.dukaan')} guide="dukaan">
        <SettingRow label={t('aap.dukaan.name')} value={form?.tradeName || business.name} onClick={openIf('dukaan')} />
        <SettingRow
          label={t('aap.dukaan.address')}
          value={
            [form?.address ?? business.address, form?.city ?? business.city].filter(Boolean).join(', ') ||
            t('setup.review.empty')
          }
          onClick={openIf('dukaan')}
        />
        <SettingRow
          label={t('aap.dukaan.pan')}
          value={(form ? form.pan : business.pan) || '—'}
          onClick={openIf('dukaan')}
        />
        <SettingRow label={t('aap.dukaan.gst')} value={gstLabel(form)} onClick={openIf('dukaan')} />
        <SettingRow
          label={t('aap.dukaan.state')}
          value={GST_STATES.find((st) => st.code === (form ? form.stateCode : business.stateCode))?.name ?? '—'}
          onClick={openIf('dukaan')}
        />
        {(form ? form.gst === 'yes' : business.registration === 'regular') ? (
          <SettingRow
            label={t('aap.dukaan.turnover')}
            value={t(TURNOVER[(form ? form.turnoverBand : business.turnoverBand) ?? ''] ?? 'setup.review.empty')}
            onClick={openIf('dukaan')}
          />
        ) : null}
        {(form ? form.gst === 'composition' : business.registration === 'composition') ? (
          <SettingRow label={t('aap.dukaan.gst')} value={form?.compositionLegend || t('gst.composition')} />
        ) : null}
      </SettingGroup>

      <SettingGroup title={t('aap.paise')} guide="paise">
        <SettingRow
          label={t('aap.paise.upi')}
          value={(form ? form.upi : business.upi) || t('setup.review.empty')}
          onClick={openIf('paise')}
        />
        <SettingRow
          label={t('aap.paise.bank')}
          value={
            form
              ? form.bankAccount
                ? `${form.bankName || form.bankIfsc} · XXXX${form.bankAccount.slice(-4)}`
                : t('setup.review.empty')
              : business.bank
                ? `${business.bank.name} · ${business.bank.account}`
                : t('setup.review.empty')
          }
          onClick={openIf('paise')}
        />
        {form ? (
          <SettingRow
            label={t('aap.paise.terms')}
            value={
              form.defaultPaymentTermsDays
                ? t('aap.paise.terms.days', { n: form.defaultPaymentTermsDays })
                : t('aap.paise.terms.now')
            }
            onClick={openIf('paise')}
          />
        ) : null}
      </SettingGroup>

      <SettingGroup title={t('aap.series')} guide="series">
        <SettingRow label={t('aap.series')} value={seriesText} onClick={openIf('series')} />
      </SettingGroup>

      <SettingGroup title={t('aap.look')} guide="look">
        <SettingRow
          label={t('aap.look.logo')}
          value={
            logoUrl ? (
              <img src={logoUrl} alt="" className="eb-logo-preview" />
            ) : business.look.logo ? (
              t('aap.look.logo.on')
            ) : (
              t('aap.look.logo.pick')
            )
          }
          onClick={editable ? () => logoDoor.current?.click() : undefined}
          guide="logo"
        />
        {editable ? (
          <FileDoor
            source="files"
            label={t('aap.look.logo.pick')}
            doorRef={logoDoor}
            onPick={(f) => void pickLogo(f)}
          />
        ) : null}
        {editable && logoUrl ? (
          <SettingRow label={t('aap.look.logo.remove')} value="" onClick={() => void removeLogo()} />
        ) : null}
        <SettingRow
          label={t('aap.look.sign')}
          value={
            signatureUrl ? (
              <img src={signatureUrl} alt="" className="eb-logo-preview" />
            ) : business.look.signature ? (
              t('aap.look.logo.on')
            ) : (
              t('aap.look.sign.draw')
            )
          }
          onClick={openIf('sign')}
        />
        <SettingRow
          label={t('aap.look.design')}
          value={t(`aap.look.design.${look?.design ?? business.look.design}`)}
          onClick={openIf('look')}
        />
        <SettingRow
          label={t('aap.look.colour')}
          value={
            look ? (
              <span className="eb-swatch" style={{ background: look.accent }} aria-label={look.accent} />
            ) : (
              business.look.colour
            )
          }
          onClick={openIf('look')}
        />
        <SettingRow
          label={t('aap.look.paper')}
          value={look ? t(`aap.look.paper.${look.paper}`) : business.look.paper}
          onClick={openIf('look')}
        />
        <SettingRow
          label={t('aap.look.share')}
          value={(look?.shareAs ?? business.look.share) === 'pdf' ? 'PDF' : t('done.share.jpg')}
          onClick={openIf('look')}
        />
        <SettingRow label={t('aap.look.sample')} value="" onClick={() => router.push(as('/bills/new/done'))} />
      </SettingGroup>

      <SettingGroup title={t('aap.theme')} guide="theme">
        <SettingRow
          label={t('aap.theme')}
          control={
            <ThemeSwitch
              labels={{ narangi: t('theme.narangi'), harmony: t('theme.harmony'), group: t('aap.theme') }}
              onChange={(theme) =>
                void setTheme({ theme }).then(
                  (r) => (r.ok ? undefined : setNotice({ kind: 'error', text: t(r.error) })),
                  () => setNotice({ kind: 'error', text: t('error.generic') }),
                )
              }
            />
          }
        />
      </SettingGroup>
      {voiceOn ? (
        <SettingGroup title={t('aap.voice')} guide="voice">
          <SettingRow
            label={t('aap.voice.sub')}
            control={
              <Segmented<'on' | 'off'>
                label={t('aap.voice')}
                value={(form ? form.voiceOnArrival : business.voiceOnArrival) ? 'on' : 'off'}
                onChange={(v) => (editable && form ? patch({ voiceOnArrival: v === 'on' }) : undefined)}
                options={[
                  { value: 'on', label: t('aap.voice.on') },
                  { value: 'off', label: t('aap.voice.off') },
                ]}
              />
            }
          />
        </SettingGroup>
      ) : null}

      {owner ? (
        <SettingGroup title={t('aap.team')} guide="team">
          <SettingRow label={t('aap.team')} value={t('aap.team.sub', { n: team })} href={as('/aap/team')} />
        </SettingGroup>
      ) : null}
      {viewer.role !== 'accountant' ? (
        <SettingGroup title={t('items.title')} guide="items">
          <SettingRow label={t('items.title')} value="" href={as('/items')} />
        </SettingGroup>
      ) : null}
      {data.plan ? (
        <SettingGroup title={t('aap.plan')} guide="plan">
          <SettingRow label={t('aap.plan')} value={t(data.plan.key, data.plan.params)} href={as('/aap/plan')} />
          {viewer.role !== 'accountant' ? <SettingRow label={t('aap.refer')} value="" href={as('/aap/plan')} /> : null}
        </SettingGroup>
      ) : null}
      <SettingGroup title={t('aap.ask')} guide="ask">
        {/* The app demo, again (20 Oct): new features, or to show a friend; sample data, never the owner's own. */}
        <SettingRow label={t('aap.demo')} value={t('aap.demo.sub')} onClick={() => demo?.start({ firstTime: false })} />
        <SettingRow label={t('aap.ask')} value="" href={as('/poocho')} />
        {viewer.role !== 'accountant' ? <SettingRow label={t('aap.help')} value="" href={as('/help')} /> : null}
      </SettingGroup>
      <SettingGroup title={t('aap.about')} guide="about">
        <SettingRow label={t('aap.about.version', { build })} value="" />
      </SettingGroup>

      {/* One primary on the screen (I9): while a sheet is open its Done is the one, not Save. */}
      {/* Save floats only while there is something to save: the rows that save on their own (language, colours,
          voice, the bill's look) left it on screen saying "nothing changed" or a disabled "Saved" (19 Oct). */}
      {owner && editing === null && (dirty || notice) ? (
        <div className="eb-sticky">
          {notice ? (
            <p
              className={notice.kind === 'error' ? 'eb-field__error' : 'eb-meta'}
              role="status"
              data-testid="aap-notice"
            >
              {notice.text}
            </p>
          ) : null}
          {dirty ? (
            <PrimaryCTA data-guide="save" icon="check" onClick={() => void save()} disabled={saving}>
              {t('aap.save')}
            </PrimaryCTA>
          ) : null}
        </div>
      ) : null}

      {/* --- Aapki profile: the person's own name --- */}
      <Sheet
        open={editing === 'person'}
        title={t('nav.profile')}
        onClose={() => setEditing(null)}
        closeLabel={t('aap.edit.close')}
      >
        <div className="eb-stack">
          <Field id="person" label={t('aap.person')} hint={t('aap.person.hint')} error={personError}>
            <Input
              id="person"
              value={personDraft}
              maxLength={80}
              autoComplete="name"
              onChange={(e) => {
                setPersonError(undefined);
                setPersonDraft(e.target.value);
              }}
              onKeyDown={(e) => e.key === 'Enter' && void keepPerson()}
            />
          </Field>
          <div className="eb-actions">
            <PrimaryCTA icon="check" onClick={() => void keepPerson()} disabled={!personDraft.trim()}>
              {t('aap.edit.done')}
            </PrimaryCTA>
          </div>
        </div>
      </Sheet>

      {/* --- Dukaan --- */}
      <Sheet
        open={editing === 'dukaan'}
        title={t('aap.edit.dukaan')}
        onClose={() => setEditing(null)}
        closeLabel={t('aap.edit.close')}
      >
        {form ? (
          <div className="eb-stack">
            <Field id="tradeName" label={t('aap.dukaan.tradeName')} error={fieldError('name')}>
              <Input
                id="tradeName"
                value={form.tradeName}
                maxLength={120}
                onChange={(e) => patch({ tradeName: e.target.value })}
              />
            </Field>
            <Field id="legalName" label={t('aap.dukaan.legalName')}>
              <Input
                id="legalName"
                value={form.legalName}
                maxLength={120}
                onChange={(e) => patch({ legalName: e.target.value })}
              />
            </Field>
            <Field id="gst" label={t('setup.gst.q')} error={fieldError('gst')}>
              <Segmented<SetupAnswer>
                label={t('setup.gst.q')}
                value={form.gst}
                onChange={(gst) => patch({ gst })}
                options={[
                  { value: 'yes', label: t('setup.gst.yes') },
                  { value: 'composition', label: t('setup.gst.composition') },
                  { value: 'no', label: t('setup.gst.no') },
                  { value: 'unknown', label: t('setup.gst.unknown') },
                ]}
              />
            </Field>
            {form.gst === 'yes' || form.gst === 'composition' ? (
              <Field id="gstin" label={t('profile.gst')} error={fieldError('gstin')}>
                <Input
                  id="gstin"
                  value={form.gstin}
                  maxLength={15}
                  autoCapitalize="characters"
                  onChange={(e) => patch({ gstin: e.target.value.toUpperCase() })}
                />
              </Field>
            ) : null}
            <Field id="pan" label={t('aap.dukaan.pan')} error={fieldError('pan')}>
              <Input
                id="pan"
                value={form.pan}
                maxLength={10}
                autoCapitalize="characters"
                onChange={(e) => patch({ pan: e.target.value.toUpperCase() })}
              />
            </Field>
            {form.gst === 'yes' ? (
              <Field id="turnover" label={t('aap.dukaan.turnover')} error={fieldError('turnoverBand')}>
                <Segmented<TurnoverBand | ''>
                  label={t('aap.dukaan.turnover')}
                  value={form.turnoverBand}
                  onChange={(turnoverBand) => patch({ turnoverBand })}
                  options={TURNOVER_BANDS.map((b) => ({ value: b, label: t(BAND_KEY[b]) }))}
                />
              </Field>
            ) : null}
            {form.gst === 'yes' && form.turnoverBand === '5cr+' ? (
              <Field id="irn" label={t('aap.dukaan.irn')} error={fieldError('eInvoicingApplies')}>
                <Segmented<'yes' | 'no' | 'unknown'>
                  label={t('aap.dukaan.irn')}
                  value={form.eInvoicingApplies}
                  onChange={(eInvoicingApplies) => patch({ eInvoicingApplies })}
                  options={[
                    { value: 'yes', label: t('setup.irn.yes') },
                    { value: 'no', label: t('setup.irn.no') },
                    { value: 'unknown', label: t('setup.irn.unknown') },
                  ]}
                />
              </Field>
            ) : null}
            {form.gst === 'composition' ? (
              <Field id="legend" label={t('setup.review.row.legend')} error={fieldError('compositionLegend')}>
                <Input
                  id="legend"
                  value={form.compositionLegend}
                  maxLength={200}
                  onChange={(e) => patch({ compositionLegend: e.target.value })}
                />
              </Field>
            ) : null}
            <Field id="address" label={t('aap.dukaan.address')} error={fieldError('address')}>
              <Input
                id="address"
                value={form.address}
                maxLength={200}
                onChange={(e) => patch({ address: e.target.value })}
              />
            </Field>
            <Field id="city" label={t('profile.city')} error={fieldError('city')}>
              <Input id="city" value={form.city} maxLength={80} onChange={(e) => patch({ city: e.target.value })} />
            </Field>
            <Field id="pincode" label={t('aap.dukaan.pincode')} error={fieldError('pincode')}>
              <Input
                id="pincode"
                value={form.pincode}
                maxLength={6}
                inputMode="numeric"
                onChange={(e) => patch({ pincode: e.target.value })}
              />
            </Field>
            <Field id="state" label={t('aap.dukaan.state')} error={fieldError('stateCode')}>
              <select
                id="state"
                className="eb-input"
                value={form.stateCode}
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
            <Field id="phone" label={t('aap.dukaan.phone')} error={fieldError('phone')}>
              <Input
                id="phone"
                value={form.phone}
                maxLength={20}
                inputMode="tel"
                onChange={(e) => patch({ phone: e.target.value })}
              />
            </Field>
            <Field id="email" label={t('aap.dukaan.email')} error={fieldError('email')}>
              <Input
                id="email"
                value={form.email}
                maxLength={120}
                inputMode="email"
                onChange={(e) => patch({ email: e.target.value })}
              />
            </Field>
            <div className="eb-actions">
              <PrimaryCTA icon="check" onClick={() => setEditing(null)}>
                {t('aap.edit.done')}
              </PrimaryCTA>
            </div>
          </div>
        ) : null}
      </Sheet>

      {/* --- Paise --- */}
      <Sheet
        open={editing === 'paise'}
        title={t('aap.edit.paise')}
        onClose={() => setEditing(null)}
        closeLabel={t('aap.edit.close')}
      >
        {form ? (
          <div className="eb-stack">
            <Field id="upi" label={t('aap.paise.upi')} hint={t('setup.upi.hint')} error={fieldError('upi')}>
              <Input
                id="upi"
                value={form.upi}
                maxLength={80}
                placeholder="naam@bank"
                onChange={(e) => patch({ upi: e.target.value })}
              />
            </Field>
            <Field id="terms" label={t('aap.paise.terms')} error={fieldError('defaultPaymentTermsDays')}>
              <Segmented<string>
                label={t('aap.paise.terms')}
                value={String(form.defaultPaymentTermsDays)}
                onChange={(v) => patch({ defaultPaymentTermsDays: Number(v) })}
                options={PAYMENT_TERMS.map((d) => ({
                  value: String(d),
                  label: d ? t('aap.paise.terms.days', { n: d }) : t('aap.paise.terms.now'),
                }))}
              />
            </Field>
            <Field id="bankName" label={t('aap.paise.bank.name')} error={fieldError('bankName')}>
              <Input
                id="bankName"
                value={form.bankName}
                maxLength={80}
                onChange={(e) => patch({ bankName: e.target.value })}
              />
            </Field>
            <Field id="bankAccount" label={t('aap.paise.bank.account')} error={fieldError('bankAccount')}>
              <Input
                id="bankAccount"
                value={form.bankAccount}
                maxLength={24}
                inputMode="numeric"
                onChange={(e) => patch({ bankAccount: e.target.value })}
              />
            </Field>
            <Field id="bankIfsc" label={t('aap.paise.bank.ifsc')} error={fieldError('bankIfsc')}>
              <Input
                id="bankIfsc"
                value={form.bankIfsc}
                maxLength={11}
                autoCapitalize="characters"
                onChange={(e) => patch({ bankIfsc: e.target.value.toUpperCase() })}
              />
            </Field>
            <Field id="bankHolder" label={t('aap.paise.bank.holder')}>
              <Input
                id="bankHolder"
                value={form.bankHolder}
                maxLength={120}
                onChange={(e) => patch({ bankHolder: e.target.value })}
              />
            </Field>
            <div className="eb-actions">
              <PrimaryCTA icon="check" onClick={() => setEditing(null)}>
                {t('aap.edit.done')}
              </PrimaryCTA>
            </div>
          </div>
        ) : null}
      </Sheet>

      {/* --- Look --- */}
      <Sheet
        open={editing === 'look'}
        title={t('aap.edit.look')}
        onClose={() => setEditing(null)}
        closeLabel={t('aap.edit.close')}
      >
        {look ? (
          <div className="eb-stack">
            <Field id="design" label={t('aap.look.design')}>
              <Segmented<(typeof BILL_DESIGNS)[number]>
                label={t('aap.look.design')}
                value={look.design}
                onChange={(design) => void applyLook({ ...look, design })}
                options={BILL_DESIGNS.map((d) => ({ value: d, label: t(`aap.look.design.${d}`) }))}
              />
            </Field>
            <Field id="paper" label={t('aap.look.paper')}>
              <Segmented<(typeof BILL_PAPERS)[number]>
                label={t('aap.look.paper')}
                value={look.paper}
                onChange={(paper) => void applyLook({ ...look, paper })}
                options={BILL_PAPERS.map((p) => ({ value: p, label: t(`aap.look.paper.${p}`) }))}
              />
            </Field>
            <Field id="share" label={t('aap.look.share')}>
              <Segmented<'pdf' | 'jpg'>
                label={t('aap.look.share')}
                value={look.shareAs}
                onChange={(shareAs) => void applyLook({ ...look, shareAs })}
                options={[
                  { value: 'pdf', label: 'PDF' },
                  { value: 'jpg', label: t('done.share.jpg') },
                ]}
              />
            </Field>
            <Field id="accent" label={t('aap.look.accent')}>
              <div className="eb-swatches" role="radiogroup" aria-label={t('aap.look.accent')}>
                {BILL_ACCENTS.map((accent) => (
                  <button
                    key={accent}
                    type="button"
                    role="radio"
                    aria-checked={look.accent === accent}
                    aria-label={accent}
                    className="eb-swatch eb-swatch--pick"
                    style={{ background: accent }}
                    onClick={() => void applyLook({ ...look, accent })}
                  />
                ))}
              </div>
            </Field>
            <div className="eb-actions">
              <PrimaryCTA icon="check" onClick={() => setEditing(null)}>
                {t('aap.edit.done')}
              </PrimaryCTA>
            </div>
          </div>
        ) : null}
      </Sheet>

      {/* --- Signature --- */}
      <Sheet
        open={editing === 'sign'}
        title={t('aap.edit.sign')}
        onClose={() => setEditing(null)}
        closeLabel={t('aap.edit.close')}
      >
        <div className="eb-stack">
          <SignaturePad onChange={setSignatureDraft} clearLabel={t('setup.sign.clear')} hint={t('setup.sign.hint')} />
          <div className="eb-actions eb-actions--stack">
            <PrimaryCTA icon="check" onClick={() => void keepSignature()} disabled={!signatureDraft}>
              {t('aap.edit.done')}
            </PrimaryCTA>
            {signatureUrl ? (
              <GhostButton
                onClick={() => {
                  setSignatureDraft(null);
                  void setBusinessFile({ kind: 'signature', dataUrl: null }).then((r) => {
                    setEditing(null);
                    // A refusal is said, and the signature stays (Stage 4 review: it said nothing and looked gone).
                    if (!r.ok) {
                      setNotice({ kind: 'error', text: t(r.error, 'say' in r && r.say ? r.say.params : undefined) });
                      return;
                    }
                    setSignatureUrl(null);
                    router.refresh();
                  });
                }}
              >
                {t('aap.look.sign.remove')}
              </GhostButton>
            ) : null}
          </div>
        </div>
      </Sheet>

      {/* --- Series --- */}
      <Sheet
        open={editing === 'series'}
        title={t('aap.edit.series')}
        onClose={() => setEditing(null)}
        closeLabel={t('aap.edit.close')}
      >
        <SeriesEditor
          rows={data.series}
          onChanged={() => router.refresh()}
          onError={(text) => setNotice({ kind: 'error', text })}
        />
      </Sheet>
    </AppShell>
  );
}

/** Add, rename, retire, make default: each change is saved as it is made (its own audit row). */
function SeriesEditor({
  rows,
  onChanged,
  onError,
}: {
  rows: SeriesRow[];
  onChanged: () => void;
  onError: (text: string) => void;
}) {
  const [open, setOpen] = useState<string | 'new' | null>(null);
  const blank = { name: '', prefix: '', padding: 3, includeFy: true, nextNumber: 1, kind: 'bill' as const };
  const [draft, setDraft] = useState<{
    name: string;
    prefix: string;
    padding: number;
    includeFy: boolean;
    nextNumber: number;
    kind: SeriesRow['kind'];
  }>(blank);
  const edit = (r: SeriesRow) => {
    setDraft({
      name: r.name,
      prefix: r.prefix,
      padding: r.padding,
      includeFy: r.includeFy,
      nextNumber: r.nextNumber,
      kind: r.kind,
    });
    setOpen(r.id);
  };
  const preview = formatNumber(
    { prefix: draft.prefix, padding: draft.padding, includeFinancialYear: draft.includeFy },
    '2026-27',
    draft.nextNumber,
  );
  const keep = async () => {
    const r =
      open === 'new'
        ? await addSeries(draft)
        : await changeSeries({
            id: open!,
            name: draft.name,
            prefix: draft.prefix,
            padding: draft.padding,
            includeFy: draft.includeFy,
            nextNumber: draft.nextNumber,
          });
    if (!r.ok) {
      onError(t(r.error));
      return;
    }
    setOpen(null);
    onChanged();
  };
  const toggle = async (r: SeriesRow) => {
    const res = await changeSeries({ id: r.id, active: !r.active });
    if (!res.ok) onError(t(res.error));
    else onChanged();
  };
  const makeDefault = async (r: SeriesRow) => {
    const res = await chooseDefaultSeries({ defaultSeriesId: r.id });
    if (!res.ok) onError(t(res.error));
    else onChanged();
  };
  if (open !== null) {
    return (
      <div className="eb-stack" data-testid="series-form">
        <Field id="s-name" label={t('aap.series.name')}>
          <Input
            id="s-name"
            value={draft.name}
            maxLength={40}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </Field>
        {open === 'new' ? (
          <Field id="s-kind" label={t('aap.series')}>
            <Segmented<SeriesRow['kind']>
              label={t('aap.series')}
              value={draft.kind}
              onChange={(kind) => setDraft({ ...draft, kind })}
              options={[
                { value: 'bill', label: t('bills.title') },
                { value: 'credit_note', label: t('credit.title') },
              ]}
            />
          </Field>
        ) : null}
        <Field id="s-prefix" label={t('aap.series.prefix')}>
          <Input
            id="s-prefix"
            value={draft.prefix}
            maxLength={10}
            onChange={(e) => setDraft({ ...draft, prefix: e.target.value })}
          />
        </Field>
        <Field id="s-padding" label={t('aap.series.padding')}>
          <Segmented<string>
            label={t('aap.series.padding')}
            value={String(draft.padding)}
            onChange={(v) => setDraft({ ...draft, padding: Number(v) })}
            options={[2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))}
          />
        </Field>
        <Field id="s-fy" label={t('aap.series.fy')}>
          <Segmented<'on' | 'off'>
            label={t('aap.series.fy')}
            value={draft.includeFy ? 'on' : 'off'}
            onChange={(v) => setDraft({ ...draft, includeFy: v === 'on' })}
            options={[
              { value: 'on', label: t('aap.voice.on') },
              { value: 'off', label: t('aap.voice.off') },
            ]}
          />
        </Field>
        <Field id="s-next" label={t('aap.series.next')} hint={t('aap.series.preview', { number: preview })}>
          <Input
            id="s-next"
            numeric
            value={String(draft.nextNumber)}
            inputMode="numeric"
            onChange={(e) => setDraft({ ...draft, nextNumber: Number(e.target.value.replace(/\D/g, '')) || 1 })}
          />
        </Field>
        <div className="eb-actions eb-actions--stack">
          <PrimaryCTA icon="check" onClick={() => void keep()}>
            {t('aap.edit.done')}
          </PrimaryCTA>
          <GhostButton onClick={() => setOpen(null)}>{t('action.back')}</GhostButton>
        </div>
      </div>
    );
  }
  return (
    <div className="eb-stack" data-testid="series-list">
      <SettingGroup>
        {rows.map((r) => (
          <SettingRow
            key={r.id}
            label={`${r.name}${r.kind === 'credit_note' ? ` · ${t('credit.title')}` : r.kind === 'estimate' ? ` · ${t('bill.kind.kaccha')}` : ''}${r.isDefault ? ` · ${t('aap.series.isDefault')}` : ''}${r.active ? '' : ` · ${t('aap.series.retired')}`}`}
            value={formatNumber(
              { prefix: r.prefix, padding: r.padding, includeFinancialYear: r.includeFy },
              r.fy ?? '2026-27',
              r.nextNumber,
            )}
            onClick={() => edit(r)}
          />
        ))}
      </SettingGroup>
      <div className="eb-actions eb-actions--stack">
        <PrimaryCTA
          icon="plus"
          onClick={() => {
            setDraft(blank);
            setOpen('new');
          }}
        >
          {t('aap.series.add')}
        </PrimaryCTA>
        {rows.map((r) => (
          <div key={r.id} className="eb-actions">
            {/* The default is a bill series; a credit-note series is retired and restored like any other. */}
            {r.kind === 'bill' && r.active && !r.isDefault ? (
              <GhostButton onClick={() => void makeDefault(r)}>{`${t('aap.series.default')}: ${r.name}`}</GhostButton>
            ) : null}
            {!r.isDefault ? (
              <GhostButton
                onClick={() => void toggle(r)}
              >{`${r.active ? t('aap.series.retire') : t('aap.series.restore')}: ${r.name}`}</GhostButton>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
