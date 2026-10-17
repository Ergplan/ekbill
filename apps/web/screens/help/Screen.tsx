'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { t } from '@ekbill/copy';
import {
  Card,
  ChoiceList,
  Display,
  Field,
  FilterChips,
  GhostButton,
  Input,
  Meta,
  OutlineButton,
  PrimaryCTA,
  Segmented,
} from '@ekbill/ui';

import { writePrefill } from '../bill/prefill';
import { withAs } from '../links';
import { rupees } from '../money';
import { AppShell, type ShellViewer } from '../shell/AppShell';
import type { HelpData } from './data';
import { manifest } from './manifest';
import { PRESETS, emptyForm, fromText, milestonesOf, planFrom, prefillOf, type HelpForm, type HelpKind } from './plan';

/**
 * "Mera bill thoda complex hai" (Stage 9; the MVP's contract helper,
 * restyled): which kind of deal, then its terms (typed, or read from the
 * contract's pasted text), then the working for this one bill. "Is hisaab se
 * bill banao" opens the bill form for the customer with the line filled;
 * nothing is saved until the owner taps Bill banao there.
 */
export function HelpScreen({ data, kind, viewer }: { data: HelpData; kind: HelpKind | null; viewer: ShellViewer }) {
  const router = useRouter();
  const [choice, setChoice] = useState<HelpKind | null>(kind);
  // The page keys this screen by ?kind=, so the back arrow (to /help) starts again from the choices.
  const [form, setForm] = useState<HelpForm | null>(() =>
    kind ? emptyForm(kind, data.chargesGst, data.defaultRate) : null,
  );
  const [paste, setPaste] = useState('');
  const [pasteNote, setPasteNote] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const patch = (p: Partial<HelpForm>) => setForm((f) => (f ? { ...f, ...p } : f));
  const plan = useMemo(
    () =>
      form
        ? planFrom(form, {
            chargesGst: data.chargesGst,
            allowedRates: data.rates,
            at: {
              dateIso: data.today,
              sellerStateCode: data.stateCode,
              customerStateCode: data.customers.find((c) => c.id === form.customer)?.stateCode ?? null,
            },
          })
        : null,
    [form, data.chargesGst, data.rates, data.today, data.stateCode, data.customers],
  );
  const error = (field: string) =>
    tried && plan && !plan.ok && plan.field === field ? t(plan.message.key, plan.message.params) : undefined;

  if (!form)
    return (
      <AppShell viewer={viewer} tab="home" back="/" title={t('help.title')} tour={manifest.tour}>
        <section className="eb-heading">
          <Display as="h1" size="title">
            {t('help.title')}
          </Display>
          <Meta>{t('help.sub')}</Meta>
        </section>
        <ChoiceList<HelpKind>
          guide="choices"
          label={t('help.title')}
          value={choice}
          onChoose={setChoice}
          choices={data.help.choices.map((c) => ({
            value: c.id as HelpKind,
            label: c.title,
            sub: c.sub,
          }))}
        />
        <div className="eb-sticky">
          <PrimaryCTA
            data-guide="next"
            data-voice="safe"
            disabled={!choice}
            onClick={() => choice && router.push(withAs(`/help?kind=${choice}`, viewer.as))}
          >
            {t('help.next')}
          </PrimaryCTA>
        </div>
      </AppShell>
    );

  const ms = milestonesOf(form);
  const make = () => {
    setTried(true);
    if (!plan?.ok || !form.customer) return;
    writePrefill(prefillOf(plan));
    router.push(withAs(`/bills/new?customer=${encodeURIComponent(form.customer)}`, viewer.as));
  };

  return (
    <AppShell viewer={viewer} tab="home" back="/help" title={t('help.title')} tour={manifest.tour}>
      <section className="eb-heading">
        <Display as="h1" size="title">
          {t('help.terms')}
        </Display>
        <Meta>{data.help.choices.find((c) => c.id === form.kind)?.title}</Meta>
      </section>

      <div data-guide="paste">
        <Field id="help-paste" label={t('help.paste')} hint={pasteNote ?? undefined}>
          <textarea
            id="help-paste"
            className="eb-input"
            rows={3}
            value={paste}
            maxLength={20000}
            onChange={(e) => setPaste(e.target.value)}
          />
        </Field>
        <OutlineButton
          data-voice="safe"
          disabled={!paste.trim()}
          onClick={() => {
            const r = fromText(form, paste, data.rates);
            setForm(r.form);
            setPasteNote(r.found ? t('help.paste.found', { n: r.found }) : t('help.paste.none'));
          }}
        >
          {t('help.paste.read')}
        </OutlineButton>
      </div>

      <div data-guide="terms" className="eb-stack eb-stack--stack">
        <Field id="help-customer" label={t('help.customer')} error={error('customer')}>
          <select
            id="help-customer"
            className="eb-input"
            value={form.customer ?? ''}
            onChange={(e) => patch({ customer: e.target.value || null })}
          >
            <option value="">{t('help.customer.pick')}</option>
            {data.customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="help-name" label={t('help.name')} error={error('name')}>
          <Input
            id="help-name"
            value={form.name}
            placeholder={t('help.name.ph')}
            maxLength={120}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </Field>
        <Field id="help-total" label={t('help.total')} error={error('totalPaise')}>
          <Input
            id="help-total"
            value={form.total}
            placeholder={t('help.total.ph')}
            inputMode="decimal"
            maxLength={40}
            onChange={(e) => patch({ total: e.target.value })}
          />
        </Field>
        {data.chargesGst ? (
          <>
            <Segmented<HelpForm['gstMode']>
              label={t('help.gst')}
              value={form.gstMode}
              onChange={(v) => patch({ gstMode: v, gstRate: v === 'none' ? null : (form.gstRate ?? data.defaultRate) })}
              options={[
                { value: 'extra', label: t('help.gst.extra') },
                { value: 'included', label: t('help.gst.included') },
                { value: 'none', label: t('help.gst.none') },
              ]}
            />
            {form.gstMode !== 'none' ? (
              <FilterChips<string>
                label={t('help.ask.rate')}
                value={String(form.gstRate ?? '')}
                onChange={(v) => patch({ gstRate: Number(v) })}
                options={data.rates.map((r) => ({ value: String(r), label: `${r}%` }))}
              />
            ) : null}
          </>
        ) : null}
      </div>

      {form.kind === 'percent' ? (
        <Card title={t('help.ms')} className="eb-stack eb-stack--stack">
          <div data-guide="milestones" className="eb-stack eb-stack--stack">
            <FilterChips<string>
              label={t('help.ms.presets')}
              value=""
              onChange={(k) => patch({ milestones: PRESETS[k]!.map((m) => ({ ...m })), billed: [], billIndex: 0 })}
              options={Object.keys(PRESETS).map((k) => ({ value: k, label: k }))}
            />
            {form.milestones.map((m, i) => (
              <div key={i} className="eb-actions">
                <Input
                  aria-label={`${t('help.ms.label')} ${i + 1}`}
                  value={m.label}
                  maxLength={80}
                  onChange={(e) =>
                    patch({
                      milestones: form.milestones.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                    })
                  }
                />
                <Input
                  aria-label={`% ${i + 1}`}
                  value={m.pct}
                  inputMode="decimal"
                  maxLength={6}
                  onChange={(e) =>
                    patch({ milestones: form.milestones.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)) })
                  }
                />
              </div>
            ))}
            {form.milestones.length < 12 ? (
              <GhostButton
                data-voice="safe"
                onClick={() => patch({ milestones: [...form.milestones, { label: '', pct: '' }] })}
              >
                {t('help.ms.add')}
              </GhostButton>
            ) : null}
            {error('milestones') ? (
              <p className="eb-meta" role="alert">
                {error('milestones')}
              </p>
            ) : null}
          </div>
        </Card>
      ) : null}

      {form.kind === 'instalments' ? (
        <Field id="help-count" label={t('help.count')} error={error('milestones')}>
          <Input
            id="help-count"
            value={form.count}
            inputMode="numeric"
            maxLength={2}
            onChange={(e) => patch({ count: e.target.value, billed: [], billIndex: 0 })}
          />
        </Field>
      ) : null}

      {form.kind !== 'running' && ms.length ? (
        <Card title={t('help.which')}>
          <div data-guide="which" className="eb-stack eb-stack--stack">
            <ChoiceList<string>
              label={t('help.which')}
              value={String(form.billIndex)}
              onChoose={(v) => patch({ billIndex: Number(v) })}
              choices={ms.map((m, i) => ({
                value: String(i),
                label: `${i + 1}. ${m.label || '—'}`,
                sub: form.billed[i] ? t('help.billed') : `${(m.pctBp / 100).toString()}%`,
              }))}
            />
            <FilterChips<string>
              label={t('help.billed')}
              value=""
              onChange={(v) => {
                const i = Number(v);
                const billed = ms.map((_, j) => Boolean(form.billed[j]));
                billed[i] = !billed[i];
                patch({ billed });
              }}
              options={ms.map((m, i) => ({
                value: String(i),
                label: `${form.billed[i] ? '✓ ' : ''}${t('help.billed')}: ${i + 1}`,
              }))}
            />
          </div>
        </Card>
      ) : null}

      {form.kind === 'running' ? (
        <div data-guide="progress" className="eb-stack eb-stack--stack">
          <Field id="help-done" label={t('help.done')} error={error('donePct')}>
            <Input
              id="help-done"
              value={form.donePct}
              inputMode="decimal"
              maxLength={6}
              onChange={(e) => patch({ donePct: e.target.value })}
            />
          </Field>
          <Field id="help-before" label={t('help.before')} error={error('before')}>
            <Input
              id="help-before"
              value={form.before}
              placeholder="0"
              maxLength={40}
              onChange={(e) => patch({ before: e.target.value })}
            />
          </Field>
        </div>
      ) : null}

      <Field id="help-retention" label={t('help.retention')} error={error('retentionBp')}>
        <Input
          id="help-retention"
          value={form.retention}
          placeholder="0"
          inputMode="decimal"
          maxLength={5}
          onChange={(e) => patch({ retention: e.target.value })}
        />
      </Field>

      {plan?.ok ? (
        <Card title={t('help.plan')} className="eb-answer">
          <div data-guide="plan" data-testid="help-plan">
            <p>{plan.bill.description}</p>
            {plan.bill.working.map((w, i) => (
              <Meta key={i}>{t(w.key, w.params)}</Meta>
            ))}
            <p>
              <strong>{rupees(plan.bill.totalPaise)}</strong>
            </p>
          </div>
        </Card>
      ) : tried &&
        plan &&
        !plan.ok &&
        !['customer', 'name', 'totalPaise', 'milestones', 'donePct', 'before', 'retentionBp'].includes(plan.field) ? (
        <p className="eb-meta" role="alert">
          {t(plan.message.key, plan.message.params)}
        </p>
      ) : null}

      <div className="eb-sticky">
        <PrimaryCTA data-guide="make" data-voice="safe" onClick={make}>
          {t('help.make')}
        </PrimaryCTA>
      </div>
    </AppShell>
  );
}
