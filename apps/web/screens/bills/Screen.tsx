'use client';

import { useState } from 'react';

import { t } from '@ekbill/copy';
import { BillRow, Display, EmptyState, FilterChips, Meta, SearchInput } from '@ekbill/ui';

import { billPath, withAs } from '../links';
import { AppShell, type ShellViewer } from '../shell/AppShell';
import { statusKey } from '../common';
import { manifest } from './manifest';
import type { BillsData } from './data';

type Filter = 'all' | 'due' | 'paid' | 'cancelled';

export function BillsScreen({ data, viewer }: { data: BillsData; viewer: ShellViewer }) {
  const as = (href: string) => withAs(href, viewer.as);
  const [filter, setFilter] = useState<Filter>('all');
  const [series, setSeries] = useState<string>('all');
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const rows = data.rows.filter((r) => {
    if (filter === 'due' && !(r.status === 'due' || r.status === 'partial')) return false;
    if (filter === 'paid' && r.status !== 'paid') return false;
    if (filter === 'cancelled' && r.status !== 'cancelled') return false;
    if (series !== 'all' && !r.number.startsWith(`${series}-`)) return false;
    if (needle && !r.name.toLowerCase().includes(needle) && !r.number.toLowerCase().includes(needle)) return false;
    return true;
  });
  return (
    <AppShell viewer={viewer} tab="bills" tour={manifest.tour}>
      <section className="eb-heading">
        <Display as="h1">{t('bills.title')}</Display>
        <Meta>{t('bills.count', { n: data.rows.length })}</Meta>
      </section>
      <SearchInput
        value={q}
        onChange={setQ}
        placeholder={t('bills.search')}
        label={t('action.search')}
        guide="search"
      />
      <div data-guide="filters">
        <FilterChips<Filter>
          label={t('bills.title')}
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: t('bills.filter.all') },
            { value: 'due', label: t('bills.filter.due') },
            { value: 'paid', label: t('bills.filter.paid') },
            { value: 'cancelled', label: t('bills.filter.cancelled') },
          ]}
        />
      </div>
      {data.series.length > 1 ? (
        <div className="eb-chips" role="radiogroup" aria-label={t('aap.series')} data-guide="series">
          {['all', ...data.series].map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={series === s}
              className="eb-chip"
              onClick={() => setSeries(s)}
            >
              {s === 'all' ? t('bills.series.all') : s}
            </button>
          ))}
        </div>
      ) : null}
      <div className="eb-card eb-rows" data-guide="list">
        {rows.length ? (
          rows.map((r) => (
            <BillRow
              key={r.number}
              name={r.name}
              index={r.index}
              meta={`${r.number} · ${r.date.slice(8)}/${r.date.slice(5, 7)}`}
              amountPaise={r.totalPaise}
              status={r.status}
              statusLabel={t(statusKey(r.status))}
              href={as(billPath(r.number, '', r.fy))}
            />
          ))
        ) : (
          <EmptyState title={t('bills.none')} />
        )}
      </div>
    </AppShell>
  );
}
