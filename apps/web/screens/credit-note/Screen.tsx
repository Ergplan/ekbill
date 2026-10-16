'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { t } from '@ekbill/copy';
import { parseMoney } from '@ekbill/engine';
import { Display, Field, GhostButton, Input, Meta, MoneyHero, PrimaryCTA, SuccessHeader } from '@ekbill/ui';

import { makeCreditNote } from '../../actions/bills';
import { rupees } from '../money';
import { sayRefusal } from '../refusal';
import { billPath, withAs } from '../links';
import { AppShell, type ShellViewer } from '../shell/AppShell';
import { manifest } from './manifest';
import type { CreditNoteData } from './data';

export function CreditNoteScreen({ bill, viewer }: { bill: CreditNoteData; viewer: ShellViewer }) {
  const router = useRouter();
  const as = (href: string) => withAs(href, viewer.as);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [madeNumber, setMadeNumber] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const make = () => {
    let p: number;
    try {
      p = parseMoney(amount);
    } catch {
      setError(t('credit.error.amount'));
      return;
    }
    if (p <= 0 || p > bill.creditablePaise) {
      setError(t('credit.error.amount'));
      return;
    }
    if (!reason.trim()) return;
    if (bill.documentId) {
      const linkedDocumentId = bill.documentId;
      startTransition(async () => {
        const r = await makeCreditNote({ linkedDocumentId, amount, notes: reason });
        if (!r.ok) {
          setError(sayRefusal(r));
          return;
        }
        setMadeNumber(r.value.number);
        setDone(p);
      });
      return;
    }
    setDone(p);
  };
  if (done !== null) {
    return (
      <AppShell viewer={viewer} tab="bills" tour={[]} noTabs>
        <SuccessHeader
          title={t('credit.done', { number: madeNumber ?? bill.nextNumber })}
          sub={`${bill.number} · ${rupees(done)} · ${reason}`}
        />
        <div className="eb-actions eb-actions--stack">
          <PrimaryCTA onClick={() => router.push(as(billPath(bill.number)))}>{t('action.done')}</PrimaryCTA>
        </div>
      </AppShell>
    );
  }
  return (
    <AppShell
      viewer={viewer}
      tab="bills"
      back={billPath(bill.number)}
      title={t('credit.title')}
      sub={`${bill.number} · ${bill.customerName}`}
      tour={manifest.tour}
    >
      <section className="eb-heading">
        <Display as="h1" size="title">
          {t('credit.title')}
        </Display>
        <MoneyHero paise={bill.totalPaise} />
        <Meta>{t('credit.sub', { number: bill.number })}</Meta>
      </section>
      <Field id="cn-amount" label={t('credit.amount')} error={error}>
        <div data-guide="amount">
          <Input
            id="cn-amount"
            numeric
            large
            autoFocus
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setError(null);
            }}
          />
        </div>
      </Field>
      <Field id="cn-reason" label={t('credit.reason')}>
        <div data-guide="reason">
          <Input id="cn-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={120} />
        </div>
      </Field>
      <div className="eb-sticky eb-sticky--bare eb-actions eb-actions--stack">
        <PrimaryCTA data-guide="make" onClick={make} disabled={!amount || !reason.trim() || pending}>
          {t('credit.make')}
        </PrimaryCTA>
        <GhostButton onClick={() => router.push(as(billPath(bill.number)))}>{t('action.cancel')}</GhostButton>
      </div>
    </AppShell>
  );
}
