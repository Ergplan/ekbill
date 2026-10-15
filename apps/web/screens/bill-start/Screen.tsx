'use client';

import { useState } from 'react';

import { t } from '@ekbill/copy';
import { ClientChip, Display, Meta, NewCustomerChip, SearchInput } from '@ekbill/ui';

import { withAs } from '../links';
import { AppShell, type ShellViewer } from '../shell/AppShell';
import { manifest } from './manifest';

export function BillStartScreen({
  pick,
  viewer,
}: {
  pick: Array<{ id: string; name: string; index: number }>;
  viewer: ShellViewer;
}) {
  const as = (href: string) => withAs(href, viewer.as);
  const [q, setQ] = useState('');
  const rows = pick.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <AppShell viewer={viewer} tab="bills" back="/" title={t('billstart.title')} tour={manifest.tour}>
      <section className="eb-heading">
        <Display as="h1" size="title">
          {t('billstart.title')}
        </Display>
        <Meta>{t('billstart.sub')}</Meta>
      </section>
      <SearchInput
        value={q}
        onChange={setQ}
        placeholder={t('home.bill.search')}
        label={t('action.search')}
        guide="search"
      />
      <div className="eb-hero__chips eb-card" data-guide="pick">
        {rows.map((c) => (
          <ClientChip key={c.id} name={c.name} index={c.index} href={as(`/bills/new?customer=${c.id}`)} />
        ))}
        <NewCustomerChip label={t('home.bill.new')} href={as('/customers/new')} guide="new" />
      </div>
    </AppShell>
  );
}
