'use client';

import { t } from '@ekbill/copy';
import { Display, Meta, Money } from '@ekbill/ui';

import { AppShell, type ShellViewer } from '../shell/AppShell';
import { billPath, withAs } from '../links';
import type { DrillData } from './data';

/** The documents behind one GST figure; the total at the foot is the figure on the GST tab. */
export function GstDrillScreen({ data, viewer }: { data: DrillData; viewer: ShellViewer }) {
  const as = (href: string) => withAs(href, viewer.as);
  return (
    <AppShell viewer={viewer} tab="gst" back="/gst" title={t('gst.title')} tour={[]}>
      <section className="eb-heading">
        <Display as="h1" size="title">
          {data.title}
        </Display>
        <Meta>{t('gst.drill.sub', { n: data.rows.length, from: data.from, to: data.to })}</Meta>
      </section>
      <div className="eb-card eb-rows" data-guide="docs">
        {data.rows.map((r) => (
          <a key={r.number} href={as(billPath(r.number, '', r.fy))} className="eb-billrow" data-testid="drill-row">
            <span className="eb-billrow__text">
              <span className="eb-billrow__name">{r.name}</span>
              <span className="eb-billrow__meta">
                {r.number} · {r.date}
                {r.credit ? ` · ${t('gst.drill.credit')}` : ''}
              </span>
            </span>
            <span className="eb-billrow__right">
              <Money paise={r.taxablePaise} />
              <span className="eb-billrow__meta">
                GST <Money paise={r.taxPaise} />
              </span>
            </span>
          </a>
        ))}
      </div>
      <section className="eb-card" data-guide="sum">
        <dl className="eb-kv">
          <dt>{t('gst.taxable')}</dt>
          <dd data-testid="drill-taxable">
            <Money paise={data.taxablePaise} />
          </dd>
          <dt>GST</dt>
          <dd data-testid="drill-tax">
            <Money paise={data.taxPaise} />
          </dd>
        </dl>
      </section>
    </AppShell>
  );
}
