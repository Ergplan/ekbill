'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { t } from '@ekbill/copy';
import { Display, Field, FilterChips, Input, OutlineButton, PrimaryCTA } from '@ekbill/ui';

import { withAs } from '../links';
import { AppShell, type ShellViewer } from '../shell/AppShell';
import { ratesFor } from '../bill/compute';
import type { Item } from '../fixtures';
import { manifest } from './manifest';

export function ItemScreen({
  item,
  registration,
  today,
  viewer,
}: {
  item: Item | null;
  registration: string | null;
  today: string;
  viewer: ShellViewer;
}) {
  const router = useRouter();
  const as = (href: string) => withAs(href, viewer.as);
  const [d, setD] = useState({
    name: item?.name ?? '',
    hsn: item?.hsn ?? '',
    unit: item?.unit ?? 'nos',
    rate: item ? String(item.ratePaise / 100) : '',
    gst: item?.gstRate !== null && item?.gstRate !== undefined ? String(item.gstRate) : '18',
  });
  const [saved, setSaved] = useState(false);
  const canEdit = viewer.role !== 'accountant';
  const rates = ratesFor(today);
  return (
    <AppShell viewer={viewer} tab="you" back="/items" title={item ? item.name : t('items.new')} tour={manifest.tour}>
      <section className="eb-heading">
        <Display as="h1" size="title">
          {item ? item.name : t('items.new')}
        </Display>
      </section>
      <Field id="it-name" label={t('item.name')}>
        <div data-guide="name">
          <Input
            id="it-name"
            large
            value={d.name}
            disabled={!canEdit}
            onChange={(e) => setD({ ...d, name: e.target.value })}
            maxLength={120}
          />
        </div>
      </Field>
      <Field id="it-hsn" label={t('item.hsn')} hint={t('item.hsn.hint')}>
        <div className="eb-actions" data-guide="hsn">
          <Input
            id="it-hsn"
            numeric
            value={d.hsn}
            disabled={!canEdit}
            onChange={(e) => setD({ ...d, hsn: e.target.value })}
            maxLength={8}
          />
          <OutlineButton small disabled={!canEdit}>
            {t('item.hsn.lookup')}
          </OutlineButton>
        </div>
      </Field>
      <div className="eb-line__nums" data-guide="rate">
        <Field id="it-unit" label={t('item.unit')}>
          <Input
            id="it-unit"
            value={d.unit}
            disabled={!canEdit}
            onChange={(e) => setD({ ...d, unit: e.target.value })}
            maxLength={12}
          />
        </Field>
        <Field id="it-rate" label={t('item.rate')}>
          <Input
            id="it-rate"
            numeric
            inputMode="decimal"
            value={d.rate}
            disabled={!canEdit}
            onChange={(e) => setD({ ...d, rate: e.target.value })}
            maxLength={14}
          />
        </Field>
      </div>
      {registration === 'regular' ? (
        <Field id="it-gst" label={t('item.gst')}>
          {canEdit ? (
            <FilterChips<string>
              label={t('item.gst')}
              value={d.gst}
              onChange={(v) => setD({ ...d, gst: v })}
              options={rates.map((r) => ({ value: String(r), label: `${r}%` }))}
            />
          ) : (
            <Input id="it-gst" value={`${d.gst}%`} disabled readOnly />
          )}
        </Field>
      ) : null}
      {canEdit ? (
        <div className="eb-sticky">
          <PrimaryCTA
            data-guide="save"
            icon="check"
            onClick={() => {
              setSaved(true);
              window.setTimeout(() => router.push(as('/items')), 600);
            }}
            aria-pressed={saved}
          >
            {saved ? t('item.saved') : t('item.save')}
          </PrimaryCTA>
        </div>
      ) : null}
    </AppShell>
  );
}
