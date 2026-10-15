'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { t } from '@ekbill/copy';
import { Avatar, Display, Meta, PrimaryCTA, Segmented, SettingGroup, SettingRow, ThemeSwitch } from '@ekbill/ui';

import { AppShell, type ShellViewer } from '../shell/AppShell';
import type { Business } from '../fixtures';
import { manifest } from './manifest';

const TURNOVER: Record<string, string> = {
  '40l': 'setup.turnover.a',
  '40l-1.5cr': 'setup.turnover.b',
  '1.5-5cr': 'setup.turnover.c',
  '5cr+': 'setup.turnover.d',
};

export function AapScreen({
  business,
  team,
  build,
  viewer,
}: {
  business: Business;
  team: number;
  build: string;
  viewer: ShellViewer;
}) {
  const router = useRouter();
  const as = (href: string) => (viewer.as ? `${href}?as=${viewer.as}` : href);
  const owner = viewer.role === 'owner';
  const [lang, setLang] = useState<'hi-Latn' | 'en'>(business.lang);
  const [voice, setVoice] = useState(business.voiceOnArrival);
  const [saved, setSaved] = useState(false);
  const series = business.series.map((s) => `${s.prefix}-${String(s.next).padStart(3, '0')}`).join(' · ');
  const tour = manifest.tour.filter((s) => owner || s.target !== 'save');
  return (
    <AppShell viewer={viewer} tab="you" tour={tour}>
      <section className="eb-heading eb-aap__head">
        <Avatar name={business.name} index={0} size="big" />
        <Display as="h1" size="title">
          {business.name}
        </Display>
        <Meta>
          {business.ownerName} · {business.phone}
          {!owner ? ` · ${t('aap.staff.note')}` : ''}
        </Meta>
      </section>

      <SettingGroup title={t('aap.dukaan')} guide="dukaan">
        <SettingRow label={t('aap.dukaan.name')} value={business.name} onClick={owner ? () => undefined : undefined} />
        <SettingRow
          label={t('aap.dukaan.address')}
          value={[business.address, business.city].filter(Boolean).join(', ')}
          onClick={owner ? () => undefined : undefined}
        />
        <SettingRow
          label={t('aap.dukaan.pan')}
          value={business.pan ?? '—'}
          onClick={owner ? () => undefined : undefined}
        />
        <SettingRow
          label={t('aap.dukaan.gst')}
          value={
            business.registration === 'regular'
              ? business.gstin
              : business.registration === 'composition'
                ? `${t('aap.dukaan.gst.composition')} · ${business.gstin}`
                : t('aap.dukaan.gst.none')
          }
          onClick={owner ? () => undefined : undefined}
        />
        <SettingRow label={t('aap.dukaan.state')} value={business.stateName ?? '—'} />
        {business.registration === 'regular' ? (
          <SettingRow
            label={t('aap.dukaan.turnover')}
            value={t(TURNOVER[business.turnoverBand ?? ''] ?? 'setup.review.empty')}
            onClick={owner ? () => undefined : undefined}
          />
        ) : null}
        {business.registration === 'composition' ? (
          <SettingRow label={t('aap.dukaan.gst')} value={t('gst.composition')} />
        ) : null}
      </SettingGroup>

      <SettingGroup title={t('aap.paise')} guide="paise">
        <SettingRow
          label={t('aap.paise.upi')}
          value={business.upi ?? t('setup.review.empty')}
          onClick={owner ? () => undefined : undefined}
        />
        <SettingRow
          label={t('aap.paise.bank')}
          value={business.bank ? `${business.bank.name} · ${business.bank.account}` : t('setup.review.empty')}
          onClick={owner ? () => undefined : undefined}
        />
      </SettingGroup>

      <SettingGroup title={t('aap.series')} guide="series">
        <SettingRow label={t('aap.series')} value={series} onClick={owner ? () => undefined : undefined} />
      </SettingGroup>

      <SettingGroup title={t('aap.look')} guide="look">
        <SettingRow
          label={t('aap.look.logo')}
          value={business.look.logo ? t('aap.look.logo.on') : t('aap.look.logo.off')}
          onClick={owner ? () => undefined : undefined}
        />
        <SettingRow
          label={t('aap.look.sign')}
          value={business.look.signature ? t('aap.look.logo.on') : t('aap.look.logo.off')}
          onClick={owner ? () => undefined : undefined}
        />
        <SettingRow
          label={t('aap.look.design')}
          value={t(`aap.look.design.${business.look.design}`)}
          onClick={owner ? () => undefined : undefined}
        />
        <SettingRow
          label={t('aap.look.colour')}
          value={business.look.colour}
          onClick={owner ? () => undefined : undefined}
        />
        <SettingRow
          label={t('aap.look.paper')}
          value={business.look.paper}
          onClick={owner ? () => undefined : undefined}
        />
        <SettingRow
          label={t('aap.look.share')}
          value={business.look.share === 'pdf' ? 'PDF' : t('done.share.jpg')}
          onClick={owner ? () => undefined : undefined}
        />
        <SettingRow label={t('aap.look.sample')} value="" onClick={() => router.push(as('/bills/new/done'))} />
      </SettingGroup>

      <SettingGroup title={t('aap.theme')} guide="theme">
        <SettingRow
          label={t('aap.theme')}
          control={
            <ThemeSwitch labels={{ narangi: t('theme.narangi'), harmony: t('theme.harmony'), group: t('aap.theme') }} />
          }
        />
      </SettingGroup>
      <SettingGroup title={t('aap.lang')} guide="lang">
        <SettingRow
          label={t('aap.lang')}
          control={
            <Segmented<'hi-Latn' | 'en'>
              label={t('aap.lang')}
              value={lang}
              onChange={setLang}
              options={[
                { value: 'hi-Latn', label: t('aap.lang.hi') },
                { value: 'en', label: t('aap.lang.en') },
              ]}
            />
          }
        />
      </SettingGroup>
      <SettingGroup title={t('aap.voice')} guide="voice">
        <SettingRow
          label={t('aap.voice.sub')}
          control={
            <Segmented<'on' | 'off'>
              label={t('aap.voice')}
              value={voice ? 'on' : 'off'}
              onChange={(v) => setVoice(v === 'on')}
              options={[
                { value: 'on', label: t('aap.voice.on') },
                { value: 'off', label: t('aap.voice.off') },
              ]}
            />
          }
        />
      </SettingGroup>

      {owner ? (
        <SettingGroup title={t('aap.team')} guide="team">
          <SettingRow label={t('aap.team')} value={t('aap.team.sub', { n: team })} href={as('/aap/team')} />
        </SettingGroup>
      ) : null}
      {viewer.role !== 'accountant' ? (
        <SettingGroup title={t('items.title')} guide="items">
          <SettingRow label={t('items.title')} value="" href={as('/items')} />
        </SettingGroup>
      ) : null}
      <SettingGroup title={t('aap.about')} guide="about">
        <SettingRow label={t('aap.about.version', { build })} value="" />
      </SettingGroup>

      {owner ? (
        <div className="eb-sticky">
          <PrimaryCTA data-guide="save" icon="check" onClick={() => setSaved(true)} aria-pressed={saved}>
            {saved ? t('aap.saved') : t('aap.save')}
          </PrimaryCTA>
        </div>
      ) : null}
    </AppShell>
  );
}
