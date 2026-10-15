'use client';

import { useRouter } from 'next/navigation';

import { t } from '@ekbill/copy';
import {
  AccentButton,
  Display,
  HeroPanel,
  Meta,
  MoneyHero,
  OutlineButton,
  PrimaryCTA,
  SettingGroup,
  SettingRow,
  StatusPill,
  TimelineEntry,
} from '@ekbill/ui';

import { rupees } from '../money';
import { withAs } from '../links';
import { AppShell, type ShellViewer } from '../shell/AppShell';
import { statusKey } from '../common';
import { shortDate } from '../fixtures';
import { manifest } from './manifest';
import type { CustomerData } from './data';

export function CustomerScreen({ data, viewer }: { data: CustomerData; viewer: ShellViewer }) {
  const router = useRouter();
  const as = (href: string) => withAs(href, viewer.as);
  const c = data.customer;
  const canBill = viewer.role !== 'accountant';
  return (
    <AppShell
      viewer={viewer}
      tab="home"
      back="/customers"
      title={c.name}
      sub={c.phone ?? c.gstin ?? ''}
      tour={manifest.tour.filter((s) => canBill || s.target !== 'bill')}
    >
      <HeroPanel
        tone="panel"
        eyebrow={t('customer.period')}
        title={c.name}
        guide="folder"
        peeks={data.peeks.map((p) => ({ title: p.title, sub: shortDate(p.sub), amount: rupees(p.amountPaise) }))}
      >
        <MoneyHero paise={data.yearPaise} />
        <Meta>{data.duePaise ? t('customer.due', { amount: rupees(data.duePaise) }) : t('status.paid')}</Meta>
        <div className="eb-ratio" aria-hidden="true">
          <span className="eb-ratio__fill" style={{ width: `${Math.round(data.paidRatio * 100)}%` }} />
        </div>
      </HeroPanel>
      <section className="eb-heading">
        <Display as="h2" size="title">
          {t('customer.timeline')}
        </Display>
      </section>
      <ol className="eb-timeline eb-card" data-guide="timeline">
        {data.timeline.length ? (
          data.timeline.map((r, i) => (
            <TimelineEntry
              key={r.number}
              latest={i === 0}
              paid={r.status === 'paid'}
              title={
                <a href={as(`/bills/${r.number}`)}>
                  {r.number} · {rupees(r.totalPaise)}
                </a>
              }
              meta={
                <>
                  {shortDate(r.date)} ·{' '}
                  {r.status === 'paid'
                    ? t('customer.paid.upi').replace('UPI', (r.method ?? 'upi').toUpperCase())
                    : r.waStatus === 'read'
                      ? t('customer.wa.read')
                      : t('customer.wa.sent')}
                </>
              }
            >
              {i === 0 ? (
                <div className="eb-actions">
                  <StatusPill status={r.status} label={t(statusKey(r.status))} />
                  {r.duePaise && canBill ? (
                    <AccentButton
                      small
                      data-guide="remind"
                      onClick={() => router.push(as(`/bills/${r.number}/remind`))}
                    >
                      {t('action.remind')}
                    </AccentButton>
                  ) : null}
                </div>
              ) : null}
            </TimelineEntry>
          ))
        ) : (
          <li className="eb-meta">{t('customer.none')}</li>
        )}
      </ol>
      <details className="eb-folded" data-guide="details">
        <summary>{t('customer.details')}</summary>
        <div className="eb-folded__body">
          <SettingGroup>
            <SettingRow label={t('customer.phone')} value={c.phone ?? '—'} />
            <SettingRow label={t('customer.gstin')} value={c.gstin ?? '—'} />
            <SettingRow label={t('customer.pan')} value={c.pan ?? '—'} />
            <SettingRow label={t('customer.state')} value={c.stateName ?? '—'} />
            <SettingRow
              label={t('customer.lang')}
              value={
                c.language && c.language !== 'hi-Latn' && c.language !== 'en'
                  ? t(`lang.name.${c.language}`)
                  : c.lang === 'en'
                    ? t('customer.lang.en')
                    : t('customer.lang.hi')
              }
            />
            <SettingRow label={t('customer.notes')} value={c.notes ?? '—'} />
          </SettingGroup>
          {canBill ? (
            <OutlineButton onClick={() => router.push(as(`/customers/new?edit=${c.id}`))}>
              {t('action.change')}
            </OutlineButton>
          ) : null}
        </div>
      </details>
      {canBill ? (
        <div className="eb-sticky">
          <PrimaryCTA data-guide="bill" onClick={() => router.push(as(`/bills/new?customer=${c.id}`))}>
            {t('customer.bill')}
          </PrimaryCTA>
        </div>
      ) : null}
    </AppShell>
  );
}
