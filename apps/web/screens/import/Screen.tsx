'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { t } from '@ekbill/copy';
import { Display, Meta, OutlineButton, PrimaryCTA, ProgressLine, StatusPill, SuccessHeader } from '@ekbill/ui';

import { AppShell, type ShellViewer } from '../shell/AppShell';
import type { Fixture } from '../fixtures';
import { manifest } from './manifest';

type State = 'pick' | 'reading' | 'rows' | 'done';

export function ImportScreen({
  state,
  preview,
  viewer,
}: {
  state: State;
  preview: Fixture['importPreview'];
  viewer: ShellViewer;
}) {
  const router = useRouter();
  const as = (href: string) => (viewer.as ? `${href}${href.includes('?') ? '&' : '?'}as=${viewer.as}` : href);
  const [ticked, setTicked] = useState<boolean[]>(preview.rows.map((r) => !r.exists));
  useEffect(() => {
    if (state !== 'reading') return;
    const id = window.setTimeout(() => router.replace(as('/customers/import?state=rows')), 1600);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  const n = ticked.filter(Boolean).length;
  return (
    <AppShell
      viewer={viewer}
      tab="home"
      back="/customers"
      title={t('import.title')}
      tour={state === 'rows' ? manifest.tour : []}
    >
      {state === 'pick' ? (
        <>
          <section className="eb-heading">
            <Display as="h1" size="title">
              {t('import.title')}
            </Display>
            <Meta>{t('import.sub')}</Meta>
          </section>
          <div className="eb-sticky eb-sticky--bare">
            <PrimaryCTA
              data-guide="pick"
              icon="plus"
              onClick={() => router.push(as('/customers/import?state=reading'))}
            >
              {t('import.pick')}
            </PrimaryCTA>
          </div>
        </>
      ) : null}
      {state === 'reading' ? (
        <ProgressLine label={t('import.reading', { n: preview.files.length })} guide="reading" />
      ) : null}
      {state === 'rows' ? (
        <>
          <section className="eb-heading">
            <Display as="h1" size="title">
              {t('import.found', { n: preview.rows.length })}
            </Display>
            <Meta>{preview.files.join(' · ')}</Meta>
          </section>
          <div className="eb-card eb-rows" data-guide="rows">
            {preview.rows.map((r, i) => (
              <label key={r.name} className="eb-billrow">
                <input
                  type="checkbox"
                  className="eb-check"
                  checked={ticked[i] ?? false}
                  disabled={r.exists}
                  onChange={(e) => setTicked(ticked.map((v, j) => (j === i ? e.target.checked : v)))}
                />
                <span className="eb-billrow__text">
                  <span className="eb-billrow__name">{r.name}</span>
                  <span className="eb-billrow__meta">{[r.phone, r.gstin].filter(Boolean).join(' · ') || '—'}</span>
                </span>
                <span className="eb-billrow__right">
                  {r.exists ? <StatusPill status="sent" label={t('import.exists')} /> : null}
                </span>
              </label>
            ))}
          </div>
          <div className="eb-sticky">
            <PrimaryCTA
              data-guide="add"
              icon="plus"
              disabled={!n}
              onClick={() => router.push(as(`/customers/import?state=done&n=${n}`))}
            >
              {t('import.add', { n })}
            </PrimaryCTA>
          </div>
        </>
      ) : null}
      {state === 'done' ? (
        <>
          <SuccessHeader title={t('import.done', { n })} />
          <div className="eb-actions">
            <OutlineButton onClick={() => router.push(as('/customers'))}>{t('customers.title')}</OutlineButton>
          </div>
        </>
      ) : null}
    </AppShell>
  );
}
