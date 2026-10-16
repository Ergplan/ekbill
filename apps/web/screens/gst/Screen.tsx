'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { t } from '@ekbill/copy';
import {
  Display,
  FilterChips,
  HeroPanel,
  IconChip,
  Meta,
  Money,
  MoneyHero,
  PrimaryCTA,
  Segmented,
  StatTile,
} from '@ekbill/ui';

import { rupees } from '../money';
import { billPath, withAs } from '../links';
import { AppShell, type ShellViewer } from '../shell/AppShell';
import { handoffWithFile } from '../share';
import { manifest } from './manifest';
import type { GstData } from './data';

export function GstScreen({ data, viewer }: { data: GstData; viewer: ShellViewer }) {
  const router = useRouter();
  const as = (href: string) => withAs(href, viewer.as);
  const canSend = viewer.role !== 'staff';
  const live = data.live;
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const range = live ? `from=${live.from}&to=${live.to}` : '';
  const drill = (q: string) => (live ? `/gst/docs?${range}&${q}` : '/bills');
  const sendPack = () => {
    if (!live) return;
    setSending(true);
    setProblem(null);
    void handoffWithFile({
      title: t('gst.send'),
      text: t('gst.send.text', { business: viewer.businessName ?? '', period: data.period.label }),
      file: { url: `/api/gst/pack?${range}`, name: `GST-${live.from}-${live.to}.zip`, type: 'application/zip' },
    }).then((r) => {
      setSending(false);
      if (r === 'failed') setProblem(t('done.file.error'));
    });
  };
  return (
    <AppShell viewer={viewer} tab="gst" tour={manifest.tour.filter((s) => canSend || s.target !== 'send')}>
      <section className="eb-heading">
        <Display as="h1">{t('gst.title')}</Display>
        <Meta>
          {data.period.mode === 'month'
            ? t('gst.sub.month', { month: data.period.label })
            : t('gst.sub', { quarter: data.period.label })}
        </Meta>
      </section>
      <div data-guide="period">
        <Segmented<'month' | 'quarter'>
          label={t('gst.quarter')}
          value={data.period.mode}
          onChange={(v) =>
            router.push(
              as(`${v === 'month' ? '/gst?period=month' : '/gst?period=quarter'}${live ? `&q=${live.anchor}` : ''}`),
            )
          }
          options={[
            { value: 'month', label: t('gst.period.month') },
            { value: 'quarter', label: t('gst.period.quarter') },
          ]}
        />
      </div>
      {live && live.periods.length > 1 ? (
        <FilterChips<string>
          label={t('gst.quarter')}
          value={live.anchor}
          onChange={(q) => router.push(`/gst?period=${data.period.mode}&q=${q}`)}
          options={live.periods.map((p) => ({ value: p.key, label: p.label }))}
        />
      ) : null}
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
              <th>{t('gst.igst')}</th>
            </tr>
          </thead>
          <tbody>
            {data.byRate.map((r) => (
              <tr key={r.rate} onClick={() => router.push(as(drill(`table=rate&rate=${Math.round(r.rate * 100)}`)))}>
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
                <td>
                  <Money paise={r.igstPaise} whole />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Meta>{t('gst.drill')}</Meta>
      </section>
      <section className="eb-card" data-guide="b2b">
        <h2 className="eb-card__title">{live ? <a href={drill('table=b2b')}>{t('gst.b2b')}</a> : t('gst.b2b')}</h2>
        <Meta>{t('gst.b2b.sub', { n: data.b2b.length })}</Meta>
        <div className="eb-rows">
          {data.b2b.map((r) => (
            <a key={r.number} href={as(billPath(r.number))} className="eb-billrow">
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
        {live ? (
          <a className="eb-meta" href={drill('table=b2c')}>
            {t('gst.b2c', { n: data.b2cBills })}
          </a>
        ) : (
          <Meta>{t('gst.b2c', { n: data.b2cBills })}</Meta>
        )}
      </section>
      {canSend ? (
        <div className="eb-sticky">
          <PrimaryCTA data-guide="send" icon="send" onClick={sendPack} disabled={sending}>
            {sending ? t('gst.send.making') : t('gst.send')}
          </PrimaryCTA>
        </div>
      ) : null}
      {problem ? (
        <p className="eb-meta" role="alert">
          {problem}
        </p>
      ) : null}
      <Meta>{t('gst.pack')}</Meta>
    </AppShell>
  );
}
