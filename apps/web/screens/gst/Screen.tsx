'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { t } from '@ekbill/copy';
import { Display, HeroPanel, IconChip, Meta, Money, MoneyHero, PrimaryCTA, Segmented, StatTile } from '@ekbill/ui';

import { rupees } from '../money';
import { AppShell, type ShellViewer } from '../shell/AppShell';
import { manifest } from './manifest';
import type { GstData } from './data';

export function GstScreen({ data, viewer }: { data: GstData; viewer: ShellViewer }) {
  const router = useRouter();
  const as = (href: string) => (viewer.as ? `${href}?as=${viewer.as}` : href);
  const [mode, setMode] = useState<'month' | 'quarter'>(data.period.mode);
  const canSend = viewer.role !== 'staff';
  return (
    <AppShell viewer={viewer} tab="gst" tour={manifest.tour.filter((s) => canSend || s.target !== 'send')}>
      <section className="eb-heading">
        <Display as="h1">{t('gst.title')}</Display>
        <Meta>{t('gst.sub', { quarter: data.period.label })}</Meta>
      </section>
      <div data-guide="period">
        <Segmented<'month' | 'quarter'>
          label={t('gst.quarter')}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'month', label: t('gst.period.month') },
            { value: 'quarter', label: t('gst.period.quarter') },
          ]}
        />
      </div>
      <HeroPanel tone="gst" eyebrow={t('gst.quarter')} title={data.period.label} sub={t('gst.sales')}>
        <MoneyHero paise={data.taxablePaise} />
        <div className="eb-tiles" data-guide="tiles">
          <StatTile
            title={t('gst.tile.bills')}
            value={String(data.bills)}
            sub={t('gst.quarter').toLowerCase()}
            icon={<IconChip name="receipt" />}
          />
          <StatTile title={t('gst.tile.gst')} value={rupees(data.gstPaise)} icon={<IconChip name="percent" />} />
        </div>
      </HeroPanel>
      <section className="eb-card" data-guide="rates">
        <h2 className="eb-card__title">{t('gst.byrate')}</h2>
        <table className="eb-table">
          <thead>
            <tr>
              <th>{t('gst.rate')}</th>
              <th>{t('gst.taxable')}</th>
              <th>{t('gst.cgst')}</th>
              <th>{t('gst.sgst')}</th>
            </tr>
          </thead>
          <tbody>
            {data.byRate.map((r) => (
              <tr key={r.rate} onClick={() => router.push(as('/bills'))}>
                <td>{r.rate}%</td>
                <td>
                  <Money paise={r.taxablePaise} whole />
                </td>
                <td>
                  <Money paise={r.cgstPaise} whole />
                </td>
                <td>
                  <Money paise={r.sgstPaise} whole />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Meta>{t('gst.drill')}</Meta>
      </section>
      <section className="eb-card" data-guide="b2b">
        <h2 className="eb-card__title">{t('gst.b2b')}</h2>
        <Meta>{t('gst.b2b.sub', { n: data.b2b.length })}</Meta>
        <div className="eb-rows">
          {data.b2b.map((r) => (
            <a key={r.number} href={as(`/bills/${r.number}`)} className="eb-billrow">
              <span className="eb-billrow__text">
                <span className="eb-billrow__name">{r.name}</span>
                <span className="eb-billrow__meta">
                  {r.number} · {r.gstin}
                </span>
              </span>
              <span className="eb-billrow__right">
                <Money paise={r.totalPaise} whole />
                <span className="eb-billrow__meta">GST {rupees(r.gstPaise)}</span>
              </span>
            </a>
          ))}
        </div>
        <Meta>{t('gst.b2c', { n: data.b2cBills })}</Meta>
      </section>
      {canSend ? (
        <div className="eb-sticky">
          <PrimaryCTA data-guide="send" icon="send" onClick={() => undefined}>
            {t('gst.send')}
          </PrimaryCTA>
        </div>
      ) : null}
      <Meta>{t('gst.pack')}</Meta>
    </AppShell>
  );
}
