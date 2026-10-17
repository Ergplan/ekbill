'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

import { t } from '@ekbill/copy';
import { keepsMatch, looseDate, type Registration } from '@ekbill/engine';
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

import { makeBillFromPhoto } from '../../actions/bills';
import { useDraft, writeDraft } from '../draft';
import { rupees } from '../money';
import { sayRefusal } from '../refusal';
import type { LiveReading } from './data';
import { compute, photoTotalCheck } from '../bill/compute';
import { withAs } from '../links';
import { AppShell, type ShellViewer } from '../shell/AppShell';
import type { PhotoReview } from '../fixtures';
import { manifest } from './manifest';

export type PhotoState = 'pick' | 'reading' | 'review' | 'unclear' | 'notfound' | 'unavailable';

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
  /** A real reading (Stage 7): the worker's state, the match, the engine's totals; null for the prototype. */
  live: LiveReading | null;
  /** A signed-in person (not a look): a picked photo is sent to be read. */
  sendsPhotos: boolean;
  viewer: ShellViewer;
}

export function PhotoScreen({ state, review, business, today, live, sendsPhotos, viewer }: Props) {
  const router = useRouter();
  const as = (href: string) => withAs(href, viewer.as);
  const [fields, setFields] = useState(review.fields);
  // The doors to the camera and the photo library (the OS asks for permission); the picked photo lives in the draft.
  const cameraDoor = useRef<HTMLInputElement>(null);
  const photosDoor = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [tooBig, setTooBig] = useState<string | null>(null);
  const [picked] = useDraft<PickedFile | null>(`${viewer.personId}:photo`, null);
  const photoSrc = live && state !== 'reading' ? review.photo : (picked?.dataUrl ?? review.photo);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [draftId, setDraftId] = useState<string | null>(null);
  const onPick = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    writeDraft(`${viewer.personId}:photo`, await readPicked(file));
    if (!sendsPhotos) {
      router.push(as('/bills/photo?state=reading'));
      return;
    }
    // A session: the photo goes to the server, the worker reads it, the screen waits on the reading.
    setProblem(null);
    const body = new FormData();
    body.append('photo', file);
    const res = await fetch('/api/photos', { method: 'POST', body }).catch(() => null);
    const answer = (await res?.json().catch(() => null)) as { id?: string; error?: string } | null;
    if (!res || !res.ok || !answer?.id) {
      setProblem(t(answer?.error ?? 'error.generic'));
      return;
    }
    router.push(`/bills/photo?id=${answer.id}`);
  };
  const openCamera = () => {
    // A phone: the camera app through the file input. A laptop: the live camera; without one, the files folder.
    if (!hasOsCamera() && hasLiveCamera()) setCameraOpen(true);
    else cameraDoor.current?.click();
  };
  useEffect(() => {
    if (state !== 'reading') return;
    // A real reading: ask the server again until the worker has read it. The prototype: on to the review.
    if (live) {
      const id = window.setInterval(() => router.refresh(), 1500);
      return () => window.clearInterval(id);
    }
    const id = window.setTimeout(() => router.replace(as('/bills/photo?state=review')), 1600);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, live?.extractionId]);

  const lines = fields.lines.map((l) => ({ what: l.what.value, qty: l.qty.value || '1', rate: l.rate.value }));
  const gst = {
    on: business.registration === 'regular',
    mode: 'one' as const,
    rate: business.defaultRate,
    perLine: [],
  };
  const c = compute({ lines, gst, customerState: business.stateCode, date: fields.date.value || today }, business);
  const totals = photoTotalCheck(
    live?.imageTotalPaise ?? null,
    { lines, customerState: business.stateCode, date: fields.date.value || today },
    business,
  );
  const makeLive = (reading: LiveReading) => {
    const name = fields.customer.value.trim();
    // The customer the reading matched (by phone, GSTIN or name: the screen said "… se mila") stands unless the
    // owner typed another name. Stage 11 review: a phone match whose written name differed was dropped, and the
    // bill went to a new customer of that name.
    const matched =
      reading.match && keepsMatch(name, reading.modelValues.customer ?? null, reading.match.name)
        ? reading.match
        : null;
    const dateIso = fields.date.value ? looseDate(fields.date.value, today) : today;
    if (!dateIso) {
      setProblem(t('bill.check.date'));
      return;
    }
    const corrections: Array<{ field: string; modelValue: string | null; humanValue: string | null }> = [
      { field: 'customer', modelValue: reading.modelValues.customer ?? null, humanValue: name || null },
      { field: 'date', modelValue: reading.modelValues.date ?? null, humanValue: fields.date.value || null },
    ];
    fields.lines.forEach((l, i) => {
      for (const k of ['what', 'qty', 'rate'] as const)
        corrections.push({
          field: `lines.${i}.${k}`,
          modelValue: reading.modelValues[`lines.${i}.${k}`] ?? null,
          humanValue: l[k].value || null,
        });
    });
    setProblem(null);
    startTransition(async () => {
      const r = await makeBillFromPhoto({
        extractionId: reading.extractionId,
        corrections,
        id: draftId,
        customerId: matched?.customerId ?? null,
        customerName: matched?.name ?? name,
        // A kaccha bill is a counter sale: the customer's state on record, else the shop's.
        customerState: matched?.stateCode ?? business.stateCode,
        issueDate: dateIso,
        gstOn: gst.on,
        lines: lines.map((l) => ({ ...l, gstRate: gst.on ? gst.rate : null })),
      });
      if (r.ok) {
        router.push(`/bills/new/done?id=${r.value.id}`);
        return;
      }
      if (r.draftId) setDraftId(r.draftId);
      setProblem(sayRefusal(r));
    });
  };
  const make = () => {
    if (live) {
      makeLive(live);
      return;
    }
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
      topMic={state === 'review'}
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
          {problem ? (
            <p className="eb-meta" role="alert">
              {problem}
            </p>
          ) : null}
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
          <img src={photoSrc} alt={t('photo.title')} className="eb-photo" data-guide="photo" />
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
              unreadable={fields.customer.unreadable}
              onChange={(v) => setFields((f) => ({ ...f, customer: { value: v, confidence: 1 } }))}
            />
            <ConfidenceField
              id="pf-date"
              label={t('photo.field.date')}
              value={fields.date.value}
              confidence={fields.date.confidence}
              unreadable={fields.date.unreadable}
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
          {c.noRules ? <Meta>{t('bill.check.date')}</Meta> : null}
          {live?.match ? (
            <Meta>
              {t('photo.customer.match', { name: live.match.name, score: Math.round(live.match.score * 100) })}
            </Meta>
          ) : live && fields.customer.value ? (
            <Meta>{t('photo.customer.new', { name: fields.customer.value })}</Meta>
          ) : null}
          {live && totals?.differs && live.imageTotalPaise !== null ? (
            <Meta>
              {t('photo.total.differs', { read: rupees(live.imageTotalPaise), lines: rupees(totals.linesPaise) })}
            </Meta>
          ) : null}
          {problem ? (
            <p className="eb-meta" role="alert" style={{ whiteSpace: 'pre-line' }}>
              {problem}
            </p>
          ) : null}
          <MakeBar
            guide="make"
            label={pending ? t('bill.making') : t('bill.make')}
            paise={c.totalPaise}
            disabled={!c.totalPaise || pending}
            onClick={make}
          />
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

      {state === 'unavailable' ? (
        <EmptyState
          icon="file"
          title={t('photo.unavailable')}
          sub={t('photo.unavailable.sub')}
          action={
            <div className="eb-actions">
              <OutlineButton data-guide="write" onClick={() => router.push(as('/bills/new'))}>
                {t('photo.write')}
              </OutlineButton>
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
