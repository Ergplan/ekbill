'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { t } from '@ekbill/copy';
import { Display, EmptyState, Meta, Money, PrimaryCTA, SearchInput } from '@ekbill/ui';

import { withAs } from '../links';
import { AppShell, type ShellViewer } from '../shell/AppShell';
import type { Item } from '../fixtures';
import { manifest } from './manifest';

export function ItemsScreen({ items, viewer }: { items: Item[]; viewer: ShellViewer }) {
  const router = useRouter();
  const as = (href: string) => withAs(href, viewer.as);
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const list = items.filter((i) => !needle || i.name.toLowerCase().includes(needle) || i.hsn.includes(needle));
  const canAdd = viewer.role !== 'accountant';
  return (
    <AppShell
      viewer={viewer}
      tab="you"
      back="/aap"
      title={t('items.title')}
      tour={manifest.tour.filter((s) => canAdd || s.target !== 'new')}
    >
      <section className="eb-heading">
        <Display as="h1" size="title">
          {t('items.title')}
        </Display>
        <Meta>{items.length}</Meta>
      </section>
      <SearchInput
        value={q}
        onChange={setQ}
        placeholder={t('items.search')}
        label={t('action.search')}
        guide="search"
      />
      <div className="eb-card eb-rows" data-guide="list">
        {list.length ? (
          list.map((i) => (
            <a key={i.id} href={as(`/items/${i.id}`)} className="eb-billrow">
              <span className="eb-billrow__text">
                <span className="eb-billrow__name">{i.name}</span>
                <span className="eb-billrow__meta">
                  HSN {i.hsn} · {i.unit}
                  {i.gstRate !== null ? ` · GST ${i.gstRate}%` : ''}
                </span>
              </span>
              <span className="eb-billrow__right">
                <Money paise={i.ratePaise} whole />
              </span>
            </a>
          ))
        ) : (
          <EmptyState title={t('items.none')} />
        )}
      </div>
      {canAdd ? (
        <div className="eb-sticky">
          <PrimaryCTA data-guide="new" icon="plus" onClick={() => router.push(as('/items/new'))}>
            {t('items.new')}
          </PrimaryCTA>
        </div>
      ) : null}
    </AppShell>
  );
}
