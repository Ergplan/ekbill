'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { t } from '@ekbill/copy';
import { importing } from '@ekbill/engine';
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

import { commitImport } from '../../actions/people';
import { useDraft, writeDraft } from '../draft';
import { withAs } from '../links';
import { AppShell, type ShellViewer } from '../shell/AppShell';
import type { ImportData } from './data';
import { manifest } from './manifest';

export function ImportScreen({ data, viewer }: { data: ImportData; viewer: ShellViewer }) {
  const { state, preview, added, live, importId } = data;
  const router = useRouter();
  const as = (href: string) => withAs(href, viewer.as);
  // What the owner changed; a row nobody touched is ticked unless it is already a customer.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const ticked = preview.rows.map((r) => (r.exists ? false : (overrides[r.id] ?? true)));
  // The door to the files folder (PDF, CSV, Excel, photos).
  const filesDoor = useRef<HTMLInputElement>(null);
  const [tooBig, setTooBig] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [chosen] = useDraft<{ files: PickedFile[] } | null>(`${viewer.personId}:import`, null);
  const fileNames = live ? preview.files : chosen?.files.length ? chosen.files.map((f) => f.name) : preview.files;
  useEffect(() => {
    if (state !== 'reading') return;
    // A look plays the prototype; a real import waits on the worker, asking the server again until it has read.
    const id = live
      ? window.setInterval(() => router.refresh(), 1200)
      : window.setTimeout(() => router.replace(as('/customers/import?state=rows')), 1600);
    return () => (live ? window.clearInterval(id) : window.clearTimeout(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, live]);
  const n = ticked.filter(Boolean).length;
  const upload = async (files: File[]) => {
    // Checked before sending: a bigger upload is refused by the server unread (imports.ts MAX_IMPORT_TOTAL_BYTES).
    if (files.reduce((s, f) => s + f.size, 0) > importing.MAX_TOTAL_BYTES) {
      setProblem(t('import.error.too-big-total'));
      return;
    }
    const form = new FormData();
    for (const f of files) form.append('files', f, f.name);
    setBusy(true);
    try {
      const res = await fetch('/api/imports', { method: 'POST', body: form });
      const body = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !body.id) {
        setProblem(t(body.error ?? 'import.error.no-files'));
        return;
      }
      router.push(as(`/customers/import?state=reading&id=${body.id}`));
    } finally {
      setBusy(false);
    }
  };
  const add = async () => {
    if (!live || !importId) {
      router.push(as(`/customers/import?state=done&n=${n}`));
      return;
    }
    setBusy(true);
    const r = await commitImport({ importId, rowIds: preview.rows.filter((_, i) => ticked[i]).map((row) => row.id) });
    setBusy(false);
    if (!r.ok) {
      setProblem(t(r.error));
      return;
    }
    router.push(as(`/customers/import?state=done&id=${importId}&n=${r.value.added}`));
  };
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
            <PrimaryCTA data-guide="pick" icon="plus" onClick={() => filesDoor.current?.click()} disabled={busy}>
              {t('import.pick')}
            </PrimaryCTA>
          </div>
          {tooBig ? <Meta>{tooBig}</Meta> : null}
          {problem ? (
            <p className="eb-field__error" role="alert">
              {problem}
            </p>
          ) : null}
          <FileDoor
            source="files"
            multiple
            label={t('import.pick')}
            guide="files"
            doorRef={filesDoor}
            onPick={(files) => {
              if (live) {
                void upload(files);
                return;
              }
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
              <label key={r.id} className="eb-billrow" data-testid="import-row">
                <input
                  type="checkbox"
                  className="eb-check"
                  checked={ticked[i] ?? false}
                  disabled={r.exists}
                  onChange={(e) => setOverrides({ ...overrides, [r.id]: e.target.checked })}
                />
                <span className="eb-billrow__text">
                  <span className="eb-billrow__name">{r.name}</span>
                  <span className="eb-billrow__meta">{[r.phone, r.gstin].filter(Boolean).join(' · ') || '—'}</span>
                  {r.from ? <span className="eb-billrow__meta">{r.from}</span> : null}
                </span>
                <span className="eb-billrow__right">
                  {r.exists ? <StatusPill status="sent" label={t('import.exists')} /> : null}
                </span>
              </label>
            ))}
          </div>
          <div className="eb-sticky">
            <PrimaryCTA data-guide="add" icon="plus" disabled={!n || busy} onClick={() => void add()}>
              {t('import.add', { n })}
            </PrimaryCTA>
          </div>
        </>
      ) : null}
      {state === 'rows' && problem ? (
        <p className="eb-field__error" role="alert">
          {problem}
        </p>
      ) : null}
      {state === 'rows' && live && preview.rows.length && preview.summary.some((f) => f.problem === 'too-many') ? (
        <Meta>{t('import.too-many')}</Meta>
      ) : null}
      {state === 'rows' && live && !preview.rows.length ? (
        <Meta>
          {t('import.none', {
            problems: preview.summary
              .map((f) => `${f.name}: ${t(`import.problem.${f.problem ?? 'unrecognised'}`)}`)
              .join(' · '),
          })}
        </Meta>
      ) : null}
      {state === 'failed' ? (
        <>
          <p className="eb-field__error" role="alert">
            {t('import.failed')}
          </p>
          <div className="eb-actions">
            <OutlineButton onClick={() => router.push(as('/customers/import'))}>{t('import.again')}</OutlineButton>
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
