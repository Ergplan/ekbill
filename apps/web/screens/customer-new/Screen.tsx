'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { t } from '@ekbill/copy';
import { checkGstin } from '@ekbill/engine';
import { Display, Field, Input, Meta, PrimaryCTA, Segmented } from '@ekbill/ui';

import { writeDraft } from '../draft';
import { withAs } from '../links';
import { AppShell, type ShellViewer } from '../shell/AppShell';
import { manifest } from './manifest';

export interface NewCustomerDraft {
  name: string;
  phone: string;
  gstin: string;
  lang: 'hi-Latn' | 'en';
}

export function CustomerNewScreen({ viewer, initial }: { viewer: ShellViewer; initial: NewCustomerDraft | null }) {
  const router = useRouter();
  const as = (href: string) => withAs(href, viewer.as);
  const [d, setD] = useState<NewCustomerDraft>(initial ?? { name: '', phone: '', gstin: '', lang: 'hi-Latn' });
  const [error, setError] = useState<string | null>(null);
  const gst = useMemo(() => (d.gstin ? checkGstin(d.gstin) : null), [d.gstin]);
  const add = () => {
    if (!d.name.trim()) {
      setError(t('bill.customer.error'));
      return;
    }
    if (d.gstin && !gst?.ok) {
      setError(t('setup.gstin.error.format'));
      return;
    }
    writeDraft(`${viewer.personId}:new-customer`, d);
    router.push(as(`/bills/new?new=1&name=${encodeURIComponent(d.name.trim())}`));
  };
  return (
    <AppShell
      viewer={viewer}
      tab="home"
      back="/customers"
      title={initial ? t('action.change') : t('newcust.title')}
      tour={manifest.tour}
    >
      <section className="eb-heading">
        <Display as="h1" size="title">
          {initial ? d.name : t('newcust.title')}
        </Display>
      </section>
      <Field id="nc-name" label={t('newcust.name')} hint={t('newcust.name.hint')} error={error}>
        <div data-guide="name">
          <Input
            id="nc-name"
            large
            autoFocus
            value={d.name}
            onChange={(e) => {
              setD({ ...d, name: e.target.value });
              setError(null);
            }}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            maxLength={120}
          />
        </div>
      </Field>
      <details className="eb-folded" data-guide="more" open={Boolean(initial)}>
        <summary>
          {t('newcust.phone')} · {t('newcust.gstin')}
        </summary>
        <div className="eb-folded__body">
          <Field id="nc-phone" label={t('newcust.phone')} hint={t('newcust.phone.hint')}>
            <Input
              id="nc-phone"
              numeric
              inputMode="tel"
              value={d.phone}
              onChange={(e) => setD({ ...d, phone: e.target.value })}
              maxLength={14}
            />
          </Field>
          <Field
            id="nc-gstin"
            label={t('newcust.gstin')}
            hint={
              gst?.ok
                ? t('newcust.gstin.ok', { state: gst.stateName ?? '', pan: gst.pan ?? '' })
                : t('newcust.gstin.hint')
            }
            error={d.gstin && gst && !gst.ok ? t('setup.gstin.error.format') : undefined}
          >
            <Input
              id="nc-gstin"
              autoCapitalize="characters"
              value={d.gstin}
              onChange={(e) => setD({ ...d, gstin: e.target.value.toUpperCase() })}
              maxLength={15}
            />
          </Field>
          <Segmented<'hi-Latn' | 'en'>
            label={t('newcust.lang')}
            value={d.lang}
            onChange={(v) => setD({ ...d, lang: v })}
            options={[
              { value: 'hi-Latn', label: t('customer.lang.hi') },
              { value: 'en', label: t('customer.lang.en') },
            ]}
          />
          <Meta>{t('newcust.lang')}</Meta>
        </div>
      </details>
      <div className="eb-sticky">
        <PrimaryCTA data-guide="add" icon="plus" onClick={add}>
          {initial ? t('action.save') : t('newcust.add')}
        </PrimaryCTA>
      </div>
    </AppShell>
  );
}
