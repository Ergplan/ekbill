'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { t } from '@ekbill/copy';
import {
  Display,
  FileDoor,
  Meta,
  OutlineButton,
  PrimaryCTA,
  ProgressLine,
  StatusPill,
  SuccessHeader,
  type PickedFile,
} from '@ekbill/ui';

import { useDraft, writeDraft } from '../draft';
import { withAs } from '../links';
import { AppShell, type ShellViewer } from '../shell/AppShell';
import type { Fixture } from '../fixtures';
import { manifest } from './manifest';

type State = 'pick' | 'reading' | 'rows' | 'done';

export function ImportScreen({
  state,
  preview,
  added,
  viewer,
}: {
  state: State;
  preview: Fixture['importPreview'];
  /** How many the rows step added (from the URL), shown on the done step. */
  added: number;
  viewer: ShellViewer;
}) {
  const router = useRouter();
  const as = (href: string) => withAs(href, viewer.as);
  const [ticked, setTicked] = useState<boolean[]>(preview.rows.map((r) => !r.exists));
  // The door to the files folder (PDF, CSV, Excel, photos); the chosen names live in the draft until Stage 8 reads them.
  const filesDoor = useRef<HTMLInputElement>(null);
  const [tooBig, setTooBig] = useState<string | null>(null);
  const [chosen] = useDraft<{ files: PickedFile[] } | null>(`${viewer.personId}:import`, null);
  const fileNames = chosen?.files.length ? chosen.files.map((f) => f.name) : preview.files;
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
            <PrimaryCTA data-guide="pick" icon="plus" onClick={() => filesDoor.current?.click()}>
              {t('import.pick')}
            </PrimaryCTA>
          </div>
          {tooBig ? <Meta>{tooBig}</Meta> : null}
          <FileDoor
            source="files"
            multiple
            label={t('import.pick')}
            guide="files"
            doorRef={filesDoor}
            onPick={(files) => {
              writeDraft(`${viewer.personId}:import`, {
                files: files.map((f) => ({ name: f.name, type: f.type, size: f.size, dataUrl: null })),
              });
              router.push(as('/customers/import?state=reading'));
            }}
            onTooBig={(f) => setTooBig(t('files.too.big', { name: f.name, mb: (f.size / 1048576).toFixed(1) }))}
          />
        </>
      ) : null}
      {state === 'reading' ? (
        <ProgressLine label={t('import.reading', { n: fileNames.length })} guide="reading" />
      ) : null}
      {state === 'rows' ? (
        <>
          <section className="eb-heading">
            <Display as="h1" size="title">
              {t('import.found', { n: preview.rows.length })}
            </Display>
            <Meta>{fileNames.join(' · ')}</Meta>
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
          <SuccessHeader title={t('import.done', { n: added })} />
          <div className="eb-actions">
            <OutlineButton onClick={() => router.push(as('/customers'))}>{t('customers.title')}</OutlineButton>
          </div>
        </>
      ) : null}
    </AppShell>
  );
}
