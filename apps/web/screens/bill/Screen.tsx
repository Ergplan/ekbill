'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { t } from '@ekbill/copy';
import { checkGstin } from '@ekbill/engine';
import {
  AccentButton,
  AddLineButton,
  CheckStrip,
  ChoiceList,
  Field,
  FilterChips,
  Input,
  LineItemCard,
  MakeBar,
  Meta,
  Money,
  RepeatCard,
  Segmented,
  Sheet,
  TotalCard,
  type CheckItem,
  type LineValue,
} from '@ekbill/ui';

import { useDraft, writeDraft } from '../draft';
import { withAs } from '../links';
import { rupees } from '../money';
import { AppShell, type ShellViewer } from '../shell/AppShell';
import { businessFromSetup, compute, ratesFor, type BillDraft, type SetupAnswers } from './compute';
import { manifest } from './manifest';
import type { BillFormData } from './data';

interface NewCustomerDraft {
  name: string;
  phone: string;
  gstin: string;
  lang: 'hi-Latn' | 'en';
}

export function BillScreen({ data, viewer }: { data: BillFormData; viewer: ShellViewer }) {
  const router = useRouter();
  const as = (href: string) => withAs(href, viewer.as);
  // A brand-new owner's business lives in the setup answers until Stage 4 saves it.
  const [setup] = useDraft<SetupAnswers | null>('setup', null);
  const business = useMemo(
    () => (data.business.name ? data.business : businessFromSetup(setup, data.business)),
    [data.business, setup],
  );
  // The customer just added on /customers/new, for the "new-customer" mode.
  const [newCustomer] = useDraft<NewCustomerDraft | null>(`${viewer.personId}:new-customer`, null);
  const initial = useMemo<BillDraft>(() => {
    if (
      data.mode !== 'new-customer' ||
      !newCustomer ||
      (data.initial.customerName && data.initial.customerName !== newCustomer.name)
    )
      return data.initial;
    const gst = newCustomer.gstin ? checkGstin(newCustomer.gstin) : null;
    return {
      ...data.initial,
      customerName: newCustomer.name,
      customerState: gst?.ok ? (gst.stateCode ?? null) : data.initial.customerState,
    };
  }, [data.initial, data.mode, newCustomer]);
  // One draft per person, bill number and customer: a half-typed bill survives a reload and never leaks to another business.
  const [d, setD] = useDraft<BillDraft>(
    `${viewer.personId}:bill:${data.initial.number}:${data.initial.customer ?? data.mode}`,
    initial,
  );
  const [filled, setFilled] = useState(false);
  const [gstOpen, setGstOpen] = useState(false);
  const [stateOpen, setStateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const patch = (p: Partial<BillDraft>) => setD((cur) => ({ ...cur, ...p }));
  const regular = business.registration === 'regular';
  const rates = useMemo(() => ratesFor(d.date), [d.date]);
  const c = useMemo(() => compute(d, business), [d, business]);

  const checks: CheckItem[] = [];
  if (regular && d.gst.on && (data.customer || d.customerName.trim()) && !d.customerState) {
    checks.push({
      id: 'state',
      text: t('bill.check.state'),
      action: (
        <AccentButton small onClick={() => setStateOpen(true)}>
          {t('bill.check.state.fix')}
        </AccentButton>
      ),
    });
  }
  if (c.overflow) checks.push({ id: 'overflow', text: t('bill.check.overflow') });
  const linesOk = c.lines.some((l) => !l.blank && l.taxablePaise > 0);
  const canMake = linesOk && checks.length === 0 && (data.mode === 'existing' || d.customerName.trim().length > 0);

  const make = () => {
    if (data.mode !== 'existing' && !d.customerName.trim()) {
      setError(t('bill.customer.error'));
      return;
    }
    if (!linesOk) {
      setError(t('bill.check.empty'));
      return;
    }
    writeDraft(`${viewer.personId}:issued`, { draft: d, computed: c, business, customer: data.customer });
    router.push(as('/bills/new/done'));
  };
  const setLine = (i: number, p: Partial<LineValue>) =>
    patch({ lines: d.lines.map((l, j) => (j === i ? { ...l, ...p } : l)) });
  const addLine = () =>
    patch({
      lines: [...d.lines, { what: '', qty: '1', rate: '' }],
      gst: { ...d.gst, perLine: [...d.gst.perLine, d.gst.rate] },
    });
  // The per-line rates travel with their lines: removing a line removes its rate, not its neighbour's.
  const removeLine = (i: number) =>
    patch({
      lines: d.lines.filter((_, j) => j !== i),
      gst: { ...d.gst, perLine: d.gst.perLine.filter((_, j) => j !== i) },
    });
  const dateLabel = new Date(`${d.date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const gstStrip = !d.gst.on
    ? t('bill.gst.strip.off')
    : d.gst.mode === 'perline'
      ? t('bill.gst.strip.perline')
      : t('bill.gst.strip', { rate: d.gst.rate });

  return (
    <AppShell
      viewer={viewer}
      tab="bills"
      back={data.customer ? '/' : '/bills/new'}
      title={data.customer ? t('bill.title', { customer: data.customer.name }) : t('bill.make')}
      sub={t('bill.number.today', { number: d.number, date: dateLabel })}
      tour={manifest.tour.filter((s) => s.target !== 'repeat' || data.previous)}
      noTabs
    >
      {data.mode !== 'existing' ? (
        <Field
          id="customer-name"
          label={t('bill.customer.name')}
          hint={t('bill.customer.hint')}
          error={error && !d.customerName.trim() ? error : undefined}
        >
          <div data-guide="customer">
            <Input
              id="customer-name"
              large
              autoFocus
              value={d.customerName}
              onChange={(e) => patch({ customerName: e.target.value })}
              maxLength={120}
            />
          </div>
        </Field>
      ) : null}

      {data.previous ? (
        <RepeatCard
          guide="repeat"
          title={t('bill.repeat')}
          summary={t('bill.repeat.summary', {
            month: data.previous.month,
            lines: data.previous.lines.map((l) => l.what).join(' + '),
            amount: rupees(data.previous.totalPaise),
          })}
          fillLabel={t('bill.repeat.fill')}
          freshLabel={t('bill.repeat.fresh')}
          doneLabel={t('bill.repeat.done')}
          filled={filled}
          onFill={() => {
            const lines = data.previous!.lines.map((l) => ({ ...l }));
            patch({ lines, gst: { ...d.gst, perLine: lines.map(() => d.gst.rate) } });
            setFilled(true);
          }}
          onFresh={() => {
            patch({ lines: [{ what: '', qty: '1', rate: '' }], gst: { ...d.gst, perLine: [d.gst.rate] } });
            setFilled(false);
          }}
        />
      ) : null}

      {d.lines.map((l, i) => (
        <LineItemCard
          key={i}
          index={i}
          guide={`line-${i}`}
          value={l}
          labels={{
            kaam: 'KAAM',
            what: t('bill.item.what'),
            whatHint: t('bill.item.what.hint'),
            qty: t('bill.item.qty'),
            rate: t('bill.item.rate'),
            amount: t('bill.item.amount'),
            remove: t('action.cancel'),
          }}
          amountPaise={c.lines[i]?.taxablePaise ?? 0}
          onChange={(p) => setLine(i, p)}
          removable={d.lines.length > 1}
          onRemove={() => removeLine(i)}
          gstSlot={
            regular && d.gst.on && d.gst.mode === 'perline' ? (
              <FilterChips<string>
                label={t('bill.gst.rate')}
                value={String(d.gst.perLine[i] ?? d.gst.rate)}
                onChange={(v) =>
                  patch({
                    gst: {
                      ...d.gst,
                      perLine: d.lines.map((_, j) => (j === i ? Number(v) : (d.gst.perLine[j] ?? d.gst.rate))),
                    },
                  })
                }
                options={rates.map((r) => ({ value: String(r), label: `${r}%` }))}
              />
            ) : undefined
          }
        />
      ))}
      <AddLineButton guide="add" onClick={addLine}>
        {t('bill.item.add')}
      </AddLineButton>

      {regular ? (
        <button type="button" className="eb-strip" data-guide="gst" onClick={() => setGstOpen(true)}>
          {gstStrip}
        </button>
      ) : business.registration === 'composition' ? (
        <Meta>{t('bill.bos.note')}</Meta>
      ) : null}

      <CheckStrip items={checks} guide="checks" />
      {error && linesOk === false ? <Meta>{error}</Meta> : null}

      <div data-guide="total">
        <TotalCard
          label={t('bill.total')}
          paise={c.totalPaise}
          count={t('bill.lines.count', { n: d.lines.length })}
          note={t('bill.english.note')}
        >
          {c.gstPaise ? (
            <dl className="eb-kv">
              <dt>{t('bill.subtotal')}</dt>
              <dd>
                <Money paise={c.subtotalPaise} />
              </dd>
              {c.heads.map((h) => (
                <div key={h.label} style={{ display: 'contents' }}>
                  <dt>{h.label}</dt>
                  <dd>
                    <Money paise={h.paise} />
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </TotalCard>
      </div>
      <MakeBar guide="make" label={t('bill.make')} paise={c.totalPaise} disabled={!canMake} onClick={make} />

      <Sheet open={gstOpen} title={t('bill.gst.q')} onClose={() => setGstOpen(false)} closeLabel={t('action.cancel')}>
        <Segmented<'yes' | 'no'>
          label={t('bill.gst.q')}
          value={d.gst.on ? 'yes' : 'no'}
          onChange={(v) => patch({ gst: { ...d.gst, on: v === 'yes' } })}
          options={[
            { value: 'yes', label: t('bill.gst.yes') },
            { value: 'no', label: t('bill.gst.no') },
          ]}
        />
        {d.gst.on ? (
          <>
            <Segmented<'one' | 'perline'>
              label={t('bill.gst.rate')}
              value={d.gst.mode}
              onChange={(v) =>
                patch({ gst: { ...d.gst, mode: v, perLine: d.lines.map((_, j) => d.gst.perLine[j] ?? d.gst.rate) } })
              }
              options={[
                { value: 'one', label: t('bill.gst.one') },
                { value: 'perline', label: t('bill.gst.perline') },
              ]}
            />
            {d.gst.mode === 'one' ? (
              <FilterChips<string>
                label={t('bill.gst.rate')}
                value={String(d.gst.rate)}
                onChange={(v) => patch({ gst: { ...d.gst, rate: Number(v) } })}
                options={rates.map((r) => ({ value: String(r), label: `${r}%` }))}
              />
            ) : null}
          </>
        ) : null}
        <AccentButton onClick={() => setGstOpen(false)}>{t('action.done')}</AccentButton>
      </Sheet>

      <Sheet
        open={stateOpen}
        title={t('bill.check.state')}
        onClose={() => setStateOpen(false)}
        closeLabel={t('action.cancel')}
      >
        <ChoiceList<string>
          label={t('bill.check.state')}
          value={d.customerState}
          onChoose={(v) => {
            patch({ customerState: v });
            setStateOpen(false);
          }}
          choices={[
            {
              value: business.stateCode ?? '27',
              label: t('bill.check.state.same', { state: business.stateName ?? '' }),
            },
            { value: 'other', label: t('bill.check.state.other'), sub: 'IGST lagega' },
          ]}
        />
      </Sheet>
    </AppShell>
  );
}
