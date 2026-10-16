'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';

import { t } from '@ekbill/copy';
import {
  GST_STATES,
  assessDocument,
  checkGstin,
  explain,
  findDuplicate,
  rateOddities,
  type Blocker,
  type Notice,
} from '@ekbill/engine';
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

import { issueBill } from '../../actions/bills';
import { clearDraft, useDraft, writeDraft } from '../draft';
import { sayRefusal } from '../refusal';
import { withAs } from '../links';
import { rupees } from '../money';
import { AppShell, type ShellViewer } from '../shell/AppShell';
import { PREFILL_EVENT, takePrefill } from './prefill';
import {
  assessLinesOf,
  businessFromSetup,
  compute,
  ratesFor,
  renamed,
  type BillDraft,
  type SetupAnswers,
} from './compute';
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
  // The brand-new owner's registration comes from the setup answers too: a regular business starts with GST on.
  const base = useMemo<BillDraft>(
    () =>
      data.business.name
        ? data.initial
        : { ...data.initial, gst: { ...data.initial.gst, on: business.registration === 'regular' } },
    [data.business.name, data.initial, business.registration],
  );
  const newGst = useMemo(() => (newCustomer?.gstin ? checkGstin(newCustomer.gstin) : null), [newCustomer]);
  const initial = useMemo<BillDraft>(() => {
    if (data.mode !== 'new-customer' || !newCustomer || (base.customerName && base.customerName !== newCustomer.name))
      return base;
    return {
      ...base,
      customerName: newCustomer.name,
      customerState: newGst?.ok ? (newGst.stateCode ?? null) : base.customerState,
    };
  }, [base, data.mode, newCustomer, newGst]);
  // One draft per person, bill number, customer (an existing one by id, a new one by name) and redo: a half-typed
  // bill survives a reload, never leaks to another business and never bleeds into a different new customer's bill.
  // The State the added customer's GSTIN gave, only while the bill is still in their name (Stage 6 review).
  const lent = useMemo(
    () =>
      data.mode === 'new-customer' && newCustomer && newGst?.ok
        ? { name: newCustomer.name, stateCode: newGst.stateCode ?? null }
        : null,
    [data.mode, newCustomer, newGst],
  );
  const draftKey = `${viewer.personId}:bill:${data.initial.number}:${data.initial.customer ?? `${data.mode}:${initial.customerName}`}${
    data.redo ? `:redo-${data.redo}` : ''
  }`;
  const [d, setD] = useDraft<BillDraft>(draftKey, initial);
  const [filled, setFilled] = useState(false);
  const [gstOpen, setGstOpen] = useState(false);
  const [stateOpen, setStateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // The draft a refused attempt left on the server: the next attempt updates it (one bill, one draft).
  const [draftId, setDraftId] = useState<string | null>(null);
  const [dupOpen, setDupOpen] = useState(false);
  const [stateOther, setStateOther] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const patch = (p: Partial<BillDraft>) => setD((cur) => ({ ...cur, ...p }));
  // Lines handed over once (Stage 9): what the voice heard, or the contract helper's working, with its GST.
  // On arrival, and again whenever lines are handed over while this form is open (the voice asked for this same
  // bill): the lines are placed here, never left in storage for whichever form opens next (Stage 9 review).
  useEffect(() => {
    const place = () => {
      const p = takePrefill();
      if (!p) return;
      setD((cur) => {
        const rate = p.gstRate ?? cur.gst.rate;
        return {
          ...cur,
          lines: p.lines,
          gst: { ...cur.gst, on: p.gstOn === false ? false : cur.gst.on, rate, perLine: p.lines.map(() => rate) },
        };
      });
    };
    place();
    window.addEventListener(PREFILL_EVENT, place);
    return () => window.removeEventListener(PREFILL_EVENT, place);
  }, [setD]);
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
  // Stage 6 guards (engine bill-guard): a rate four times off what this customer paid last time is shown, not blocked.
  const odd = data.live
    ? rateOddities(
        d.lines.map((l, i) => ({ id: String(i), what: l.what, qty: l.qty, rate: l.rate })),
        data.live.lastLines,
      )
    : [];
  // Stage 8: the issue's own checks (assess), as the owner types, each with "Kyun?" from the rule pack.
  const gstOnNow = regular && d.gst.on;
  const assessment = data.live
    ? assessDocument({
        business: data.live.seller,
        customer: {
          name: data.customer?.name ?? d.customerName,
          gstin: data.customer?.gstin ?? (newGst?.ok ? newGst.normalised : null),
          stateCode: d.customerState,
          // The address the issue will use (Stage 8 review: the form passed none, and blocked a ₹50,000 bill the
          // server would have issued).
          address: data.customer?.address ?? null,
        },
        document: {
          kind: 'bill',
          dateIso: d.date,
          gstOn: gstOnNow,
          placeOfSupplyStateCode: d.customerState ?? (gstOnNow ? null : business.stateCode),
          lines: assessLinesOf(
            d,
            gstOnNow,
            (what) => data.items.find((it) => it.name.toLowerCase() === what.trim().toLowerCase())?.hsn ?? null,
          ),
          flags: [],
          totals: { totalPaise: c.totalPaise, supply: c.supply },
        },
        today: data.live.today,
      })
    : null;
  const whyButton = (ruleId: string | null) =>
    ruleId && explain(ruleId) ? (
      <AccentButton small onClick={() => setWhy(ruleId)}>
        {t('check.why')}
      </AccentButton>
    ) : undefined;
  const asItem = (x: Blocker | Notice): CheckItem => ({
    id: `assess-${x.code}`,
    text: t(x.message.key, x.message.params),
    action: whyButton(x.ruleId),
  });
  // The state is asked by the strip above; an empty form is not yet a bill to judge.
  const covered = new Set(['missing-place-of-supply', 'no-lines']);
  if (assessment && linesOkForChecks(d))
    for (const b of assessment.blockers.filter((x) => !covered.has(x.code))) checks.push(asItem(b));
  const notes: CheckItem[] = odd.map((o) => ({
    id: `odd-${o.what}`,
    text: t('bill.rate.odd', { what: o.what, last: rupees(o.lastRatePaise), now: rupees(o.nowRatePaise) }),
  }));
  if (c.noRules) checks.push({ id: 'date', text: t('bill.check.date') });
  if (assessment && linesOkForChecks(d))
    for (const n of assessment.notices.filter((x) => !covered.has(x.code))) notes.push(asItem(n));
  const linesOk = c.lines.some((l) => !l.blank && l.taxablePaise > 0);
  const canMake = linesOk && checks.length === 0 && (data.mode === 'existing' || d.customerName.trim().length > 0);

  const rateOf = (i: number) => (d.gst.mode === 'perline' ? (d.gst.perLine[i] ?? d.gst.rate) : d.gst.rate);
  const issueLive = (confirmedDuplicate: boolean) => {
    const live = data.live!;
    if (!confirmedDuplicate) {
      const dup = findDuplicate(
        {
          customerId: data.customer?.id ?? null,
          customerName: d.customerName,
          totalPaise: c.totalPaise,
          today: live.today,
        },
        live.recent,
      );
      if (dup) {
        setDupOpen(true);
        return;
      }
    }
    setDupOpen(false);
    setError(null);
    const gstOn = regular && d.gst.on;
    // The customer just added on /customers/new lends their GSTIN, phone and language only to their own bill: a
    // draft left in the tab from an earlier customer must not dress a different name in them.
    const added = newCustomer && newCustomer.name.trim() === d.customerName.trim() ? newCustomer : null;
    const addedGst = added?.gstin ? checkGstin(added.gstin) : null;
    startTransition(async () => {
      const r = await issueBill({
        id: draftId,
        seriesId: live.seriesId,
        customerId: data.customer?.id ?? null,
        customerName: data.customer?.name ?? d.customerName.trim(),
        customerGstin: data.customer ? null : addedGst?.ok ? addedGst.normalised : null,
        customerPhone: data.customer ? null : added?.phone.trim() || null,
        customerState: d.customerState,
        customerLanguage: data.customer ? null : (added?.lang ?? null),
        issueDate: d.date,
        gstOn,
        lines: d.lines.map((l, i) => ({ what: l.what, qty: l.qty, rate: l.rate, gstRate: gstOn ? rateOf(i) : null })),
      });
      if (r.ok) {
        clearDraft(draftKey);
        if (added) clearDraft(`${viewer.personId}:new-customer`);
        router.push(as(`/bills/new/done?id=${r.value.id}`));
        return;
      }
      if (r.draftId) setDraftId(r.draftId);
      setError(sayRefusal(r));
    });
  };
  const duplicate = data.live
    ? findDuplicate(
        {
          customerId: data.customer?.id ?? null,
          customerName: d.customerName,
          totalPaise: c.totalPaise,
          today: data.live.today,
        },
        data.live.recent,
      )
    : null;

  const make = () => {
    if (data.mode !== 'existing' && !d.customerName.trim()) {
      setError(t('bill.customer.error'));
      return;
    }
    if (!linesOk) {
      setError(t('bill.check.empty'));
      return;
    }
    if (data.live) {
      issueLive(false);
      return;
    }
    const customer =
      data.customer ??
      (d.customerName.trim()
        ? {
            id: null,
            name: d.customerName.trim(),
            gstin: newGst?.ok ? newGst.normalised : null,
            phone: newCustomer?.phone.trim() || null,
          }
        : null);
    writeDraft(`${viewer.personId}:issued`, { draft: d, computed: c, business, customer });
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
              onChange={(e) => {
                const name = e.target.value;
                setD((cur) => renamed(cur, name, lent, base.customerState));
              }}
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
            // The last bill's own rates: per line when they differed, so a 5 % and an 18 % line stay so.
            const rates = data.previous!.gstRates;
            patch({
              lines,
              gst: rates.length
                ? { ...d.gst, mode: 'perline', rate: rates[0]!, perLine: rates }
                : { ...d.gst, perLine: lines.map(() => d.gst.rate) },
            });
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
        <button type="button" className="eb-strip" data-guide="gst" data-voice="safe" onClick={() => setGstOpen(true)}>
          {gstStrip}
        </button>
      ) : business.registration === 'composition' ? (
        <Meta>{t('bill.bos.note')}</Meta>
      ) : null}

      <CheckStrip items={[...checks, ...notes]} guide="checks" />
      {error && (linesOk === false || data.live) ? (
        <p className="eb-meta" role="alert" style={{ whiteSpace: 'pre-line' }}>
          {error}
        </p>
      ) : null}

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
      <MakeBar
        guide="make"
        label={pending ? t('bill.making') : t('bill.make')}
        paise={c.totalPaise}
        disabled={!canMake || pending}
        onClick={make}
      />

      <Sheet open={dupOpen} title={t('bill.dup.go')} onClose={() => setDupOpen(false)} closeLabel={t('bill.dup.back')}>
        {duplicate ? (
          <Meta>
            {t('bill.dup', {
              customer: d.customerName || data.customer?.name || '',
              amount: rupees(duplicate.totalPaise),
              number: duplicate.number,
              days: Math.max(
                0,
                Math.round((Date.parse(data.live!.today) - Date.parse(duplicate.issueDate)) / 86_400_000),
              ),
            })}
          </Meta>
        ) : null}
        <AccentButton onClick={() => issueLive(true)}>{t('bill.dup.go')}</AccentButton>
        <AccentButton onClick={() => setDupOpen(false)}>{t('bill.dup.back')}</AccentButton>
      </Sheet>

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
            if (v === 'other') {
              setStateOther(true);
              return;
            }
            patch({ customerState: v });
            setStateOpen(false);
          }}
          choices={[
            {
              value: business.stateCode ?? '27',
              label: t('bill.check.state.same', { state: business.stateName ?? '' }),
            },
            { value: 'other', label: t('bill.check.state.other'), sub: t('bill.check.state.other.sub') },
          ]}
        />
        {stateOther ? (
          <Field id="bill-state" label={t('bill.check.state.pick')}>
            <select
              id="bill-state"
              className="eb-input"
              value={d.customerState ?? ''}
              onChange={(e) => {
                patch({ customerState: e.target.value || null });
                if (e.target.value) {
                  setStateOther(false);
                  setStateOpen(false);
                }
              }}
            >
              <option value="">—</option>
              {GST_STATES.map((st) => (
                <option key={st.code} value={st.code}>
                  {st.code} · {st.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
      </Sheet>
      <Sheet
        open={why !== null}
        title={t('check.why.title')}
        onClose={() => setWhy(null)}
        closeLabel={t('action.done')}
      >
        {why ? (
          <>
            <p className="eb-body" data-testid="why-text">
              {explain(why)?.['hi-Latn']}
            </p>
            <Meta>{t('check.source', { source: explain(why)?.source ?? '' })}</Meta>
          </>
        ) : null}
        <AccentButton onClick={() => setWhy(null)}>{t('action.done')}</AccentButton>
      </Sheet>
    </AppShell>
  );
}

/** The checks speak once the form holds a line with something in it. */
function linesOkForChecks(d: BillDraft): boolean {
  return d.lines.some((l) => l.what.trim() && l.rate.trim());
}
