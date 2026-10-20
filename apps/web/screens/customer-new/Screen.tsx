'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { LOCALES, t } from '@ekbill/copy';
import { checkCustomer, checkGstin, offerLanguage } from '@ekbill/engine';
import { Display, FilterChips, Field, Input, Meta, PrimaryCTA } from '@ekbill/ui';

import { saveCustomer } from '../../actions/people';
import { writeDraft } from '../draft';
import { withAs } from '../links';
import { AppShell, type ShellViewer } from '../shell/AppShell';
import { manifest } from './manifest';

export interface NewCustomerDraft {
  name: string;
  phone: string;
  gstin: string;
  /** One of the app's five languages, or the customer's own (Stage 5: offered from their name or place). */
  lang: string;
}

export function CustomerNewScreen({
  viewer,
  initial,
  id = null,
  live = false,
  kaccha = false,
}: {
  viewer: ShellViewer;
  initial: NewCustomerDraft | null;
  /** The row being edited (Stage 5); null for a new customer. */
  id?: string | null;
  /** A real session writes the row; a look (?as=) plays the prototype. */
  live?: boolean;
  /** Added on the way to a kaccha bill (20 Oct): the form it opens is an estimate. */
  kaccha?: boolean;
}) {
  const router = useRouter();
  const as = (href: string) => withAs(href, viewer.as);
  const k = kaccha ? '&kaccha=1' : '';
  const [d, setD] = useState<NewCustomerDraft>(initial ?? { name: '', phone: '', gstin: '', lang: 'hi-Latn' });
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ field: string; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const gst = useMemo(() => (d.gstin ? checkGstin(d.gstin) : null), [d.gstin]);
  // The language offered from the name (or the GSTIN's state); the owner chooses, nothing is applied on its own.
  const offer = useMemo(
    () =>
      d.name.trim().length > 2 ? offerLanguage({ name: d.name, stateCode: gst?.ok ? gst.stateCode : null }) : null,
    [d.name, gst],
  );
  const add = async () => {
    if (!d.name.trim()) {
      setError(t('bill.customer.error'));
      return;
    }
    if (d.gstin && !gst?.ok) {
      setError(t('setup.gstin.error.format'));
      return;
    }
    if (!live) {
      writeDraft(`${viewer.personId}:new-customer`, d);
      router.push(as(`/bills/new?new=1&name=${encodeURIComponent(d.name.trim())}${k}`));
      return;
    }
    const input = {
      id,
      name: d.name,
      phone: d.phone || null,
      gstin: d.gstin || null,
      language: d.lang,
      languageSource: offer && offer.language === d.lang ? ('guess' as const) : ('owner' as const),
    };
    const local = checkCustomer(input);
    if (!local.ok) {
      setFieldError({ field: local.field, text: t(local.message.key, local.message.params) });
      return;
    }
    setSaving(true);
    const r = await saveCustomer(input);
    setSaving(false);
    if (!r.ok) {
      setFieldError({
        field: ('field' in r && r.field) || 'name',
        text: t(r.error, 'say' in r && r.say ? r.say.params : undefined),
      });
      return;
    }
    if (id) {
      router.push(as(`/customers/${id}`));
      return;
    }
    writeDraft(`${viewer.personId}:new-customer`, { ...d, id: r.value.id });
    router.push(as(`/bills/new?new=1&name=${encodeURIComponent(d.name.trim())}&customer=${r.value.id}${k}`));
  };
  const errorFor = (field: string) => (fieldError?.field === field ? fieldError.text : undefined);
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
      <Field id="nc-name" label={t('newcust.name')} hint={t('newcust.name.hint')} error={error ?? errorFor('name')}>
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
            onKeyDown={(e) => e.key === 'Enter' && void add()}
            maxLength={120}
          />
        </div>
      </Field>
      <details className="eb-folded" data-guide="more" open={Boolean(initial)}>
        <summary>
          {t('newcust.phone')} · {t('newcust.gstin')}
        </summary>
        <div className="eb-folded__body">
          <Field
            id="nc-phone"
            label={t('newcust.phone')}
            hint={t('newcust.phone.hint')}
            error={errorFor('phone') ?? errorFor('phone-taken')}
          >
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
            error={d.gstin && gst && !gst.ok ? t('setup.gstin.error.format') : (errorFor('gstin') ?? errorFor('pan'))}
          >
            <Input
              id="nc-gstin"
              autoCapitalize="characters"
              value={d.gstin}
              onChange={(e) => setD({ ...d, gstin: e.target.value.toUpperCase() })}
              maxLength={15}
            />
          </Field>
          {/* The five languages a reminder can be written in, and the one offered from the name when it is another. */}
          <FilterChips<string>
            label={t('newcust.lang')}
            value={d.lang}
            onChange={(v) => setD({ ...d, lang: v })}
            options={[
              ...LOCALES.map((l) => ({
                value: l as string,
                label:
                  l === 'hi-Latn' ? t('customer.lang.hi') : l === 'en' ? t('customer.lang.en') : t(`lang.name.${l}`),
              })),
              ...(live && offer && !(LOCALES as readonly string[]).includes(offer.language)
                ? [{ value: offer.language, label: t(`lang.name.${offer.language}`) }]
                : !(LOCALES as readonly string[]).includes(d.lang)
                  ? [{ value: d.lang, label: t(`lang.name.${d.lang}`) }]
                  : []),
            ]}
          />
          <Meta>
            {live && offer && offer.language !== 'en' && d.lang !== offer.language
              ? t('newcust.lang.offer', { language: t(`lang.name.${offer.language}`), because: offer.because })
              : t('newcust.lang')}
          </Meta>
        </div>
      </details>
      <div className="eb-sticky">
        <PrimaryCTA data-guide="add" icon="plus" onClick={() => void add()} disabled={saving}>
          {initial ? t('action.save') : t('newcust.add')}
        </PrimaryCTA>
      </div>
    </AppShell>
  );
}
