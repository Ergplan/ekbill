'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

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

import { cancelBill, recordMoney, reverseMoney } from '../../actions/bills';
import { rupees } from '../money';
import { sayRefusal } from '../refusal';
import { billFileUrl, handoffWithFile } from '../share';
import { billFileName, billPath, withAs } from '../links';
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
  const live = data.live;
  const [date, setDate] = useState(live?.today ?? TODAY);
  const [pending, startTransition] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustNote, setAdjustNote] = useState('');
  const [reverseId, setReverseId] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [method, setMethod] = useState<Method>('upi');
  // Every amount recorded on this screen, in order; the due is the bill's due minus all of them.
  const [recorded, setRecorded] = useState<Array<{ paise: number; method: Method; date: string }>>([]);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const recordedPaise = recorded.reduce((s, r) => s + r.paise, 0);
  const due = Math.max(0, bill.duePaise - recordedPaise);
  const status = recorded.length ? (due === 0 ? 'paid' : 'partial') : bill.status;
  const last = recorded[recorded.length - 1] ?? null;
  const fileName = billFileName(bill.number, data.share);

  /** A server write, then the page again from the server (the balance is never kept on the phone). */
  const act = (
    run: () => Promise<{ ok: true } | ({ ok: false } & Parameters<typeof sayRefusal>[0])>,
    after?: () => void,
  ) => {
    setProblem(null);
    startTransition(async () => {
      const r = await run();
      if (!r.ok) {
        setProblem(sayRefusal(r));
        return;
      }
      after?.();
      router.refresh();
    });
  };
  const record = (paise: number) => {
    if (live) {
      act(
        () =>
          recordMoney({
            documentId: live.documentId,
            kind: 'payment',
            amount: (paise / 100).toFixed(2),
            date,
            method,
          }),
        () => {
          setAmount('');
          setPaidOpen(false);
          setMode(null);
        },
      );
      return;
    }
    setRecorded((cur) => [...cur, { paise, method, date }]);
    setAmount('');
    setPaidOpen(false);
    setMode(null);
  };
  const redoHref = () =>
    bill.customer
      ? `/bills/new?customer=${bill.customer}&redo=${encodeURIComponent(bill.number)}`
      : `/bills/new?new=1&name=${encodeURIComponent(data.customerName)}&redo=${encodeURIComponent(bill.number)}`;
  const cancelAndRedo = () => {
    if (live) {
      act(
        () => cancelBill({ id: live.documentId, cancelledReason: reason }),
        () => router.push(as(redoHref())),
      );
      return;
    }
    router.push(as(redoHref()));
  };
  const shareAgain = () => {
    if (!live) return;
    void handoffWithFile({
      phone: data.customerPhone,
      title: `${data.paper.title} ${bill.number}`,
      text: t('done.wa.text', {
        customer: data.customerName,
        business: data.paper.seller.name,
        title: data.paper.title,
        number: bill.number,
        amount: rupees(bill.totalPaise),
      }),
      file: {
        url: billFileUrl(live.documentId, data.share, live.paperSize),
        name: fileName,
        type: data.share === 'pdf' ? 'application/pdf' : 'image/jpeg',
      },
    }).then((r) => {
      if (r === 'failed') setProblem(t('done.file.error'));
    });
  };
  const download = live ? (
    <a
      className="eb-btn eb-btn--ghost"
      data-guide="download"
      href={billFileUrl(live.documentId, data.share, live.paperSize, true)}
      download={fileName}
    >
      {t('view.download')}
    </a>
  ) : (
    <OutlineButton data-guide="download">{t('view.download')}</OutlineButton>
  );

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
              {t('view.paid.saved', { amount: rupees(recordedPaise), method: t(`view.paid.${last.method}`) })} ·{' '}
              {t('view.paid.on', { date: shortDate(last.date) })}
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
            <OutlineButton data-guide="remind" onClick={() => router.push(as(billPath(bill.number, '/remind')))}>
              {t('action.remind')}
            </OutlineButton>
            <OutlineButton data-guide="wa" onClick={shareAgain}>
              {t('view.wa.again')}
            </OutlineButton>
            {download}
          </div>
          {live && canFix ? (
            <GhostButton data-guide="adjust" onClick={() => setAdjustOpen(true)}>
              {t('view.adjust')}
            </GhostButton>
          ) : null}
        </div>
      ) : (
        <div className="eb-actions">
          {canMoney && status !== 'cancelled' ? (
            <OutlineButton data-guide="wa" onClick={shareAgain}>
              {t('view.wa.again')}
            </OutlineButton>
          ) : null}
          {download}
        </div>
      )}
      {problem ? (
        <p className="eb-meta" role="alert" style={{ whiteSpace: 'pre-line' }}>
          {problem}
        </p>
      ) : null}
      {live && live.reminders > 0 ? <Meta>{t('view.reminded', { n: live.reminders })}</Meta> : null}

      {live && live.entries.length ? (
        <section className="eb-card eb-rows" data-guide="entries" aria-label={t('view.entries')}>
          <h2 className="eb-meta">{t('view.entries')}</h2>
          {live.entries.map((e) => (
            <div key={e.id} className="eb-billrow">
              <span style={e.reversed ? { textDecoration: 'line-through' } : undefined}>
                {e.kind === 'payment'
                  ? t('view.entry.payment', {
                      amount: rupees(e.amountPaise),
                      date: shortDate(e.date),
                      method: t(`view.paid.${e.method ?? 'other'}`),
                    })
                  : t('view.entry.adjustment', { amount: rupees(e.amountPaise), date: shortDate(e.date) })}
              </span>
              {e.reversed ? (
                <Meta>{t('view.entry.reversed', { reason: e.reversalReason ?? '' })}</Meta>
              ) : canFix && status !== 'cancelled' ? (
                <GhostButton onClick={() => setReverseId(e.id)}>{t('view.entry.reverse')}</GhostButton>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

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
            {data.creditNote ? null : (
              // A bill with a credit note is corrected already; it is not cancelled on top (the engine refuses).
              <OutlineButton onClick={() => setCancelOpen(true)}>{t('view.cancel')}</OutlineButton>
            )}
            <OutlineButton onClick={() => router.push(as(billPath(bill.number, '/credit-note')))}>
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
              disabled={pending}
              onClick={() => {
                try {
                  const p = parseMoney(amount);
                  // A look clamps to what is due; a real bill lets the engine say "more than due".
                  if (p > 0) record(live ? p : Math.min(p, due));
                } catch {
                  setProblem(t('pay.error.amount'));
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
        <AccentButton disabled={!reason.trim() || pending} onClick={cancelAndRedo}>
          {t('view.cancel.go')}
        </AccentButton>
        <GhostButton onClick={() => setCancelOpen(false)}>{t('action.cancel')}</GhostButton>
      </Sheet>

      {live ? (
        <Sheet
          open={adjustOpen}
          title={t('view.adjust.q')}
          onClose={() => setAdjustOpen(false)}
          closeLabel={t('action.cancel')}
        >
          <Field id="adjust-amount" label={t('view.paid.amount')}>
            <Input
              id="adjust-amount"
              numeric
              large
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field id="adjust-note" label={t('view.adjust.note')}>
            <Input
              id="adjust-note"
              value={adjustNote}
              onChange={(e) => setAdjustNote(e.target.value)}
              maxLength={200}
            />
          </Field>
          {problem ? (
            <p className="eb-meta" role="alert">
              {problem}
            </p>
          ) : null}
          <AccentButton
            disabled={!amount.trim() || pending}
            onClick={() =>
              act(
                () =>
                  recordMoney({
                    documentId: live.documentId,
                    kind: 'adjustment',
                    amount,
                    date,
                    note: adjustNote || null,
                  }),
                () => {
                  setAmount('');
                  setAdjustNote('');
                  setAdjustOpen(false);
                },
              )
            }
          >
            {t('view.adjust.save')}
          </AccentButton>
        </Sheet>
      ) : null}

      {live ? (
        <Sheet
          open={reverseId !== null}
          title={t('view.entry.reverse.q')}
          onClose={() => setReverseId(null)}
          closeLabel={t('action.cancel')}
        >
          <Field id="reverse-reason" label={t('view.entry.reverse.q')}>
            <Input
              id="reverse-reason"
              autoFocus
              value={reverseReason}
              onChange={(e) => setReverseReason(e.target.value)}
              maxLength={200}
            />
          </Field>
          {problem ? (
            <p className="eb-meta" role="alert">
              {problem}
            </p>
          ) : null}
          <AccentButton
            disabled={!reverseReason.trim() || pending}
            onClick={() =>
              act(
                () => reverseMoney({ id: reverseId, reversalReason: reverseReason }),
                () => {
                  setReverseId(null);
                  setReverseReason('');
                },
              )
            }
          >
            {t('view.entry.reverse.go')}
          </AccentButton>
        </Sheet>
      ) : null}
    </AppShell>
  );
}
