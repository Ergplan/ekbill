'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { t } from '@ekbill/copy';
import { parseMoney } from '@ekbill/engine';
import {
  AccentButton,
  ChoiceList,
  Display,
  Field,
  GhostButton,
  InvoicePaper,
  Input,
  Meta,
  MoneyHero,
  OutlineButton,
  PrimaryCTA,
  Segmented,
  Sheet,
  StatusPill,
} from '@ekbill/ui';

import { rupees } from '../money';
import { withAs } from '../links';
import { AppShell, type ShellViewer } from '../shell/AppShell';
import { statusKey } from '../common';
import { TODAY, shortDate } from '../fixtures';
import { manifest } from './manifest';
import type { BillViewData } from './data';

type Method = 'upi' | 'cash' | 'bank';

export function BillViewScreen({
  data,
  viewer,
  openPaid,
}: {
  data: BillViewData;
  viewer: ShellViewer;
  openPaid: boolean;
}) {
  const router = useRouter();
  const as = (href: string) => withAs(href, viewer.as);
  const { bill } = data;
  const canMoney = viewer.role !== 'accountant';
  const canFix = viewer.role === 'owner';
  const [paidOpen, setPaidOpen] = useState(openPaid && canMoney && bill.duePaise > 0);
  const [mode, setMode] = useState<'all' | 'part' | null>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(TODAY);
  const [method, setMethod] = useState<Method>('upi');
  // Every amount recorded on this screen, in order; the due is the bill's due minus all of them.
  const [recorded, setRecorded] = useState<Array<{ paise: number; method: Method; date: string }>>([]);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const recordedPaise = recorded.reduce((s, r) => s + r.paise, 0);
  const due = Math.max(0, bill.duePaise - recordedPaise);
  const status = recorded.length ? (due === 0 ? 'paid' : 'partial') : bill.status;
  const last = recorded[recorded.length - 1] ?? null;

  const record = (paise: number) => {
    setRecorded((cur) => [...cur, { paise, method, date: date || TODAY }]);
    setAmount('');
    setPaidOpen(false);
    setMode(null);
  };
  const cancelAndRedo = () => {
    router.push(as(`/bills/new?customer=${bill.customer}&redo=${bill.number}`));
  };

  return (
    <AppShell
      viewer={viewer}
      tab="bills"
      back="/bills"
      title={data.customerName}
      sub={`${bill.number} · ${shortDate(bill.date)}`}
      tour={manifest.tour}
    >
      <section className="eb-heading" data-guide="amount">
        <Display as="h1" size="title">
          {status === 'cancelled'
            ? t('view.cancelled', { reason: bill.cancelledReason ?? '' })
            : status === 'paid'
              ? t('view.paid.full')
              : t('view.due')}
        </Display>
        {status !== 'cancelled' ? <MoneyHero paise={status === 'paid' ? bill.totalPaise : due} /> : null}
        <div className="eb-actions">
          <StatusPill status={status} label={t(statusKey(status))} />
          {bill.paidOn && status !== 'cancelled' ? (
            <Meta>
              {t('view.paid.on', { date: shortDate(bill.paidOn), method: t(`view.paid.${bill.method ?? 'upi'}`) })}
            </Meta>
          ) : null}
          {last ? (
            <Meta>
              {t('view.paid.saved', {
                amount: rupees(recordedPaise),
                method: t(`view.paid.${last.method}`),
                date: shortDate(last.date),
              })}
            </Meta>
          ) : null}
          {bill.waStatus ? <Meta>{bill.waStatus === 'read' ? t('view.wa.read') : t('view.wa.sent')}</Meta> : null}
        </div>
      </section>

      {canMoney && status !== 'cancelled' && status !== 'paid' ? (
        <div className="eb-actions eb-actions--stack">
          <PrimaryCTA data-guide="paid" icon="check" onClick={() => setPaidOpen(true)}>
            {t('dues.paid')}
          </PrimaryCTA>
          <div className="eb-actions">
            <OutlineButton data-guide="remind" onClick={() => router.push(as(`/bills/${bill.number}/remind`))}>
              {t('action.remind')}
            </OutlineButton>
            <OutlineButton data-guide="wa">{t('view.wa.again')}</OutlineButton>
            <OutlineButton data-guide="download">{t('view.download')}</OutlineButton>
          </div>
        </div>
      ) : (
        <div className="eb-actions">
          {canMoney && status !== 'cancelled' ? (
            <OutlineButton data-guide="wa">{t('view.wa.again')}</OutlineButton>
          ) : null}
          <OutlineButton data-guide="download">{t('view.download')}</OutlineButton>
        </div>
      )}

      {data.creditNote ? (
        <Meta>
          {t('view.credit.note', {
            number: data.creditNote.number,
            amount: rupees(data.creditNote.amountPaise),
            reason: data.creditNote.reason,
          })}
        </Meta>
      ) : null}

      <div data-guide="paper">
        <InvoicePaper data={data.paper} />
      </div>

      {canFix && status !== 'cancelled' ? (
        <details className="eb-folded" data-guide="mistake">
          <summary>{t('view.mistake')}</summary>
          <div className="eb-folded__body">
            <OutlineButton onClick={() => setCancelOpen(true)}>{t('view.cancel')}</OutlineButton>
            <OutlineButton onClick={() => router.push(as(`/bills/${bill.number}/credit-note`))}>
              {t('view.credit')}
            </OutlineButton>
          </div>
        </details>
      ) : null}

      <Sheet
        open={paidOpen}
        title={t('view.paid.q')}
        onClose={() => setPaidOpen(false)}
        closeLabel={t('action.cancel')}
        guide="paid-sheet"
      >
        {mode !== 'part' ? (
          <ChoiceList<'all' | 'part'>
            label={t('view.paid.q')}
            value={mode}
            onChoose={(v) => (v === 'all' ? record(due) : setMode('part'))}
            choices={[
              { value: 'all', label: t('view.paid.all'), sub: rupees(due) },
              { value: 'part', label: t('view.paid.part') },
            ]}
          />
        ) : (
          <>
            <Field id="paid-amount" label={t('view.paid.amount')}>
              <Input
                id="paid-amount"
                numeric
                large
                autoFocus
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <Field id="paid-date" label={t('view.paid.date')}>
              <Input id="paid-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Segmented<Method>
              label={t('view.paid.how')}
              value={method}
              onChange={setMethod}
              options={[
                { value: 'upi', label: t('view.paid.upi') },
                { value: 'cash', label: t('view.paid.cash') },
                { value: 'bank', label: t('view.paid.bank') },
              ]}
            />
            <AccentButton
              onClick={() => {
                try {
                  const p = parseMoney(amount);
                  if (p > 0) record(Math.min(p, due));
                } catch {
                  // the field keeps focus; nothing recorded
                }
              }}
            >
              {t('view.paid.save')}
            </AccentButton>
          </>
        )}
      </Sheet>

      <Sheet
        open={cancelOpen}
        title={t('view.cancel')}
        onClose={() => setCancelOpen(false)}
        closeLabel={t('action.cancel')}
      >
        <Field id="cancel-reason" label={t('view.cancel.reason')}>
          <Input
            id="cancel-reason"
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={120}
          />
        </Field>
        <AccentButton disabled={!reason.trim()} onClick={cancelAndRedo}>
          {t('view.cancel.go')}
        </AccentButton>
        <GhostButton onClick={() => setCancelOpen(false)}>{t('action.cancel')}</GhostButton>
      </Sheet>
    </AppShell>
  );
}
