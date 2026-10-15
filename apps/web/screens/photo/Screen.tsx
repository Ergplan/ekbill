'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { t } from '@ekbill/copy';
import type { Registration } from '@ekbill/engine';
import {
  CameraSheet,
  ChoiceList,
  ConfidenceField,
  Display,
  EmptyState,
  FileDoor,
  GhostButton,
  MakeBar,
  Meta,
  OutlineButton,
  ProgressLine,
  hasLiveCamera,
  hasOsCamera,
  readPicked,
  type PickedFile,
} from '@ekbill/ui';

import { useDraft, writeDraft } from '../draft';
import { compute } from '../bill/compute';
import { withAs } from '../links';
import { AppShell, type ShellViewer } from '../shell/AppShell';
import type { PhotoReview } from '../fixtures';
import { manifest } from './manifest';

export type PhotoState = 'pick' | 'reading' | 'review' | 'unclear' | 'notfound';

interface Props {
  state: PhotoState;
  review: PhotoReview;
  business: {
    name: string;
    registration: Registration;
    stateCode: string | null;
    gstin: string | null;
    upi: string | null;
    address: string | null;
    defaultRate: number;
    nextNumber: string;
  };
  today: string;
  viewer: ShellViewer;
}

export function PhotoScreen({ state, review, business, today, viewer }: Props) {
  const router = useRouter();
  const as = (href: string) => withAs(href, viewer.as);
  const [fields, setFields] = useState(review.fields);
  // The doors to the camera and the photo library (the OS asks for permission); the picked photo lives in the draft.
  const cameraDoor = useRef<HTMLInputElement>(null);
  const photosDoor = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [tooBig, setTooBig] = useState<string | null>(null);
  const [picked] = useDraft<PickedFile | null>(`${viewer.personId}:photo`, null);
  const photoSrc = picked?.dataUrl ?? review.photo;
  const onPick = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    writeDraft(`${viewer.personId}:photo`, await readPicked(file));
    router.push(as('/bills/photo?state=reading'));
  };
  const openCamera = () => {
    // A phone: the camera app through the file input. A laptop: the live camera; without one, the files folder.
    if (!hasOsCamera() && hasLiveCamera()) setCameraOpen(true);
    else cameraDoor.current?.click();
  };
  useEffect(() => {
    if (state !== 'reading') return;
    const id = window.setTimeout(() => router.replace(as('/bills/photo?state=review')), 1600);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const lines = fields.lines.map((l) => ({ what: l.what.value, qty: l.qty.value || '1', rate: l.rate.value }));
  const gst = {
    on: business.registration === 'regular',
    mode: 'one' as const,
    rate: business.defaultRate,
    perLine: [],
  };
  const c = compute({ lines, gst, customerState: business.stateCode, date: fields.date.value || today }, business);
  const make = () => {
    const draft = {
      customer: review.customer,
      customerName: fields.customer.value,
      customerState: business.stateCode,
      lines,
      gst,
      series: business.nextNumber.split('-')[0] ?? 'INV',
      number: business.nextNumber,
      date: fields.date.value || today,
    };
    writeDraft(`${viewer.personId}:issued`, {
      draft,
      computed: c,
      business,
      customer: { id: review.customer, name: fields.customer.value, gstin: null },
    });
    router.push(as('/bills/new/done'));
  };
  const setLine = (i: number, key: 'what' | 'qty' | 'rate', value: string) =>
    setFields((f) => ({
      ...f,
      lines: f.lines.map((l, j) =>
        j === i ? { ...l, [key]: { ...l[key], value, confidence: 1, unreadable: false } } : l,
      ),
    }));

  return (
    <AppShell
      viewer={viewer}
      tab="home"
      back="/"
      title={t('photo.title')}
      tour={state === 'review' ? manifest.tour : []}
      noTabs={state === 'review'}
    >
      {state === 'pick' ? (
        <>
          <section className="eb-heading">
            <Display as="h1" size="title">
              {t('photo.title')}
            </Display>
            <Meta>{t('photo.pick.sub')}</Meta>
          </section>
          <ChoiceList<'camera' | 'gallery'>
            label={t('photo.title')}
            onChoose={(v) => (v === 'camera' ? openCamera() : photosDoor.current?.click())}
            choices={[
              { value: 'camera', label: t('photo.camera'), icon: 'camera' },
              { value: 'gallery', label: t('photo.gallery'), icon: 'file' },
            ]}
          />
          {tooBig ? <Meta>{tooBig}</Meta> : null}
          {/* The real doors: "Photo lo" opens the camera, "Gallery se" the library; a chosen photo starts the reading. */}
          <FileDoor
            source="camera"
            label={t('photo.camera')}
            guide="camera"
            doorRef={cameraDoor}
            onPick={onPick}
            onTooBig={(f) => setTooBig(t('files.too.big', { name: f.name, mb: (f.size / 1048576).toFixed(1) }))}
          />
          <FileDoor
            source="photos"
            label={t('photo.gallery')}
            guide="gallery"
            doorRef={photosDoor}
            onPick={onPick}
            onTooBig={(f) => setTooBig(t('files.too.big', { name: f.name, mb: (f.size / 1048576).toFixed(1) }))}
          />
          <CameraSheet
            open={cameraOpen}
            onClose={() => setCameraOpen(false)}
            onCapture={(file) => {
              setCameraOpen(false);
              void onPick([file]);
            }}
            onFallback={() => {
              setCameraOpen(false);
              photosDoor.current?.click();
            }}
            labels={{
              title: t('files.camera.title'),
              asking: t('files.camera.asking'),
              denied: t('files.camera.denied'),
              shoot: t('files.camera.shoot'),
              fallback: t('files.camera.fallback'),
              close: t('action.cancel'),
            }}
          />
        </>
      ) : null}

      {state === 'reading' ? (
        <>
          <img src={photoSrc} alt="" className="eb-photo" data-guide="photo" />
          <ProgressLine label={t('photo.reading')} guide="reading" />
        </>
      ) : null}

      {state === 'review' ? (
        <>
          <img src={photoSrc} alt="Kaccha bill" className="eb-photo" data-guide="photo" />
          <section className="eb-heading">
            <Display as="h1" size="title">
              {t('photo.review.title')}
            </Display>
            <Meta>{t('photo.review.sub')}</Meta>
          </section>
          <div className="eb-card" data-guide="fields">
            <ConfidenceField
              id="pf-customer"
              label={t('photo.field.customer')}
              value={fields.customer.value}
              confidence={fields.customer.confidence}
              onChange={(v) => setFields((f) => ({ ...f, customer: { value: v, confidence: 1 } }))}
            />
            <ConfidenceField
              id="pf-date"
              label={t('photo.field.date')}
              value={fields.date.value}
              confidence={fields.date.confidence}
              onChange={(v) => setFields((f) => ({ ...f, date: { value: v, confidence: 1 } }))}
            />
            {fields.lines.map((l, i) => (
              <div key={i} className="eb-line__nums eb-line__nums--photo">
                <ConfidenceField
                  id={`pf-what-${i}`}
                  label={`${t('bill.item.what')} ${i + 1}`}
                  value={l.what.value}
                  confidence={l.what.confidence}
                  unreadable={l.what.unreadable}
                  onChange={(v) => setLine(i, 'what', v)}
                />
                <ConfidenceField
                  id={`pf-qty-${i}`}
                  label={t('bill.item.qty')}
                  value={l.qty.value}
                  confidence={l.qty.confidence}
                  unreadable={l.qty.unreadable}
                  numeric
                  onChange={(v) => setLine(i, 'qty', v)}
                />
                <ConfidenceField
                  id={`pf-rate-${i}`}
                  label={t('bill.item.rate')}
                  value={l.rate.value}
                  confidence={l.rate.confidence}
                  unreadable={l.rate.unreadable}
                  numeric
                  onChange={(v) => setLine(i, 'rate', v)}
                />
              </div>
            ))}
            <ConfidenceField
              id="pf-total"
              label={t('photo.field.total')}
              value={fields.total.value}
              confidence={fields.total.confidence}
              onChange={(v) => setFields((f) => ({ ...f, total: { value: v, confidence: 1 } }))}
              numeric
            />
          </div>
          <MakeBar guide="make" label={t('bill.make')} paise={c.totalPaise} disabled={!c.totalPaise} onClick={make} />
          <div className="eb-actions">
            <GhostButton onClick={() => router.push(as('/bills/photo?state=unclear'))}>
              {t('photo.unclear')}
            </GhostButton>
          </div>
        </>
      ) : null}

      {state === 'unclear' ? (
        <EmptyState
          icon="camera"
          title={t('photo.unclear')}
          sub={t('photo.unclear.sub')}
          action={
            <div className="eb-actions">
              <OutlineButton data-guide="retake" onClick={() => router.push(as('/bills/photo'))}>
                {t('photo.retake')}
              </OutlineButton>
              <GhostButton data-guide="write" onClick={() => router.push(as('/bills/new'))}>
                {t('photo.write')}
              </GhostButton>
            </div>
          }
        />
      ) : null}

      {state === 'notfound' ? (
        <EmptyState
          icon="file"
          title={t('photo.notfound')}
          sub={t('photo.notfound.sub')}
          action={
            <div className="eb-actions">
              <OutlineButton data-guide="write" onClick={() => router.push(as('/bills/new'))}>
                {t('photo.write')}
              </OutlineButton>
              <GhostButton data-guide="retake" onClick={() => router.push(as('/bills/photo'))}>
                {t('photo.retake')}
              </GhostButton>
            </div>
          }
        />
      ) : null}
    </AppShell>
  );
}
