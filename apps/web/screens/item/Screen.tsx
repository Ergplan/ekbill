'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { t } from '@ekbill/copy';
import { checkItem, lookupHsnSac, parseMoney, type HsnHit } from '@ekbill/engine';
import {
  Display,
  Field,
  FilterChips,
  Input,
  OutlineButton,
  PrimaryCTA,
  SettingGroup,
  SettingRow,
  Sheet,
} from '@ekbill/ui';

import { saveItem } from '../../actions/people';
import { withAs } from '../links';
import { AppShell, type ShellViewer } from '../shell/AppShell';
import { ratesFor } from '../bill/compute';
import type { Item } from '../fixtures';
import { manifest } from './manifest';

export function ItemScreen({
  item,
  registration,
  today,
  live = false,
  viewer,
}: {
  item: Item | null;
  registration: string | null;
  today: string;
  /** A real session saves the row (Stage 5); a look plays the prototype. */
  live?: boolean;
  viewer: ShellViewer;
}) {
  const router = useRouter();
  const as = (href: string) => withAs(href, viewer.as);
  const [d, setD] = useState({
    name: item?.name ?? '',
    hsn: item?.hsn ?? '',
    unit: item?.unit ?? 'nos',
    rate: item ? String(item.ratePaise / 100) : '',
    // A new item starts at 18 %; a saved item with no rate keeps none (its bill's rate applies), never 18 by surprise.
    gst: item ? (item.gstRate !== null && item.gstRate !== undefined ? String(item.gstRate) : '') : '18',
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<{ field: string; text: string } | null>(null);
  const [lookup, setLookup] = useState<string | null>(null);
  const hits: HsnHit[] = lookup !== null ? lookupHsnSac(lookup || d.name) : [];
  const errorFor = (field: string) => (error?.field === field ? error.text : undefined);
  const save = async () => {
    if (!live) {
      setSaved(true);
      window.setTimeout(() => router.push(as('/items')), 600);
      return;
    }
    let ratePaise: number | null;
    try {
      ratePaise = d.rate.trim() ? parseMoney(d.rate) : null;
    } catch {
      setError({ field: 'defaultRatePaise', text: t('error.amount') });
      return;
    }
    const input = {
      id: item?.id ?? null,
      name: d.name,
      hsnSac: d.hsn || null,
      unit: d.unit || null,
      defaultRatePaise: ratePaise,
      // Only a regular business sees the rate; for the others it is left as stored (undefined), not cleared.
      defaultTaxBp: registration === 'regular' ? (d.gst !== '' ? Math.round(Number(d.gst) * 100) : null) : undefined,
    };
    const local = checkItem(input, today);
    if (!local.ok) {
      setError({ field: local.field, text: t(local.message.key, local.message.params) });
      return;
    }
    const r = await saveItem(input);
    if (!r.ok) {
      setError({
        field: ('field' in r && r.field) || 'name',
        text: t(r.error, 'say' in r && r.say ? r.say.params : undefined),
      });
      return;
    }
    setSaved(true);
    router.push(as('/items'));
  };
  const canEdit = viewer.role !== 'accountant';
  const rates = ratesFor(today);
  return (
    <AppShell viewer={viewer} tab="you" back="/items" title={item ? item.name : t('items.new')} tour={manifest.tour}>
      <section className="eb-heading">
        <Display as="h1" size="title">
          {item ? item.name : t('items.new')}
        </Display>
      </section>
      <Field id="it-name" label={t('item.name')} error={errorFor('name') ?? errorFor('name-taken')}>
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
      <Field id="it-hsn" label={t('item.hsn')} hint={t('item.hsn.hint')} error={errorFor('hsnSac')}>
        <div className="eb-actions" data-guide="hsn">
          <Input
            id="it-hsn"
            numeric
            value={d.hsn}
            disabled={!canEdit}
            onChange={(e) => setD({ ...d, hsn: e.target.value })}
            maxLength={8}
          />
          <OutlineButton small disabled={!canEdit} onClick={() => setLookup(d.hsn || d.name)}>
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
        <Field id="it-rate" label={t('item.rate')} error={errorFor('defaultRatePaise')}>
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
            <Input id="it-gst" value={d.gst ? `${d.gst}%` : '—'} disabled readOnly />
          )}
        </Field>
      ) : null}
      {canEdit ? (
        <div className="eb-sticky">
          <PrimaryCTA data-guide="save" icon="check" onClick={() => void save()} aria-pressed={saved}>
            {saved ? t('item.saved') : t('item.save')}
          </PrimaryCTA>
        </div>
      ) : null}
      <Sheet
        open={lookup !== null}
        title={t('item.hsn.lookup')}
        onClose={() => setLookup(null)}
        closeLabel={t('aap.edit.close')}
      >
        <div className="eb-stack">
          <Field id="hsn-q" label={t('item.hsn.search')}>
            <Input id="hsn-q" value={lookup ?? ''} onChange={(e) => setLookup(e.target.value)} maxLength={40} />
          </Field>
          <SettingGroup>
            {hits.length ? (
              hits.map((h) => (
                <SettingRow
                  key={`${h.kind}-${h.code}`}
                  label={`${h.kind === 'sac' ? 'SAC' : 'HSN'} ${h.code}`}
                  value={h.heading}
                  onClick={() => {
                    setD({ ...d, hsn: h.code });
                    setLookup(null);
                  }}
                />
              ))
            ) : (
              <SettingRow label={t('item.hsn.none')} value="" />
            )}
          </SettingGroup>
        </div>
      </Sheet>
    </AppShell>
  );
}
