'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { t } from '@ekbill/copy';
import { Avatar, Display, EmptyState, Meta, Money, OutlineButton, PrimaryCTA, SearchInput } from '@ekbill/ui';

import { AppShell, type ShellViewer } from '../shell/AppShell';
import { manifest } from './manifest';
import type { CustomerRow } from './data';

export function CustomersScreen({ rows, viewer }: { rows: CustomerRow[]; viewer: ShellViewer }) {
  const router = useRouter();
  const as = (href: string) => (viewer.as ? `${href}?as=${viewer.as}` : href);
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const list = rows.filter(
    (r) =>
      !needle ||
      r.name.toLowerCase().includes(needle) ||
      (r.phone ?? '').includes(needle) ||
      (r.gstin ?? '').toLowerCase().includes(needle),
  );
  const canAdd = viewer.role !== 'accountant';
  return (
    <AppShell
      viewer={viewer}
      tab="home"
      back="/"
      title={t('customers.title')}
      tour={manifest.tour.filter((s) => canAdd || s.target !== 'import')}
    >
      <section className="eb-heading">
        <Display as="h1" size="title">
          {t('customers.title')}
        </Display>
        <Meta>{t('home.bill.count', { n: rows.length })}</Meta>
      </section>
      <SearchInput
        value={q}
        onChange={setQ}
        placeholder={t('customers.search')}
        label={t('action.search')}
        guide="search"
      />
      <div className="eb-card eb-rows" data-guide="list">
        {list.length ? (
          list.map((r) => (
            <a key={r.id} href={as(`/customers/${r.id}`)} className="eb-billrow">
              <Avatar name={r.name} index={r.index} />
              <span className="eb-billrow__text">
                <span className="eb-billrow__name">{r.name}</span>
                <span className="eb-billrow__meta">{r.phone ?? r.gstin ?? '—'}</span>
              </span>
              <span className="eb-billrow__right">{r.duePaise ? <Money paise={r.duePaise} whole /> : null}</span>
            </a>
          ))
        ) : (
          <EmptyState icon="users" title={t('customers.none')} />
        )}
      </div>
      {canAdd ? (
        <div className="eb-actions eb-actions--stack eb-sticky">
          <PrimaryCTA data-guide="new" icon="plus" onClick={() => router.push(as('/customers/new'))}>
            {t('home.bill.new')}
          </PrimaryCTA>
          <OutlineButton data-guide="import" onClick={() => router.push(as('/customers/import'))}>
            {t('customers.import')}
          </OutlineButton>
        </div>
      ) : null}
    </AppShell>
  );
}
