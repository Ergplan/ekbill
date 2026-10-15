'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

import { Icon } from './Icon';
import { Sheet } from './flow';
import { AccentButton, Meta, OutlineButton } from './primitives';

/**
 * The three doors to the person's own things, each the OS's own door, so
 * the OS (not EkBill) asks for permission the first time and remembers it:
 *   camera  — on a phone the camera app (capture=environment); on a laptop
 *             the live camera through getUserMedia (CameraSheet), or the
 *             files folder where there is no camera;
 *   photos  — the photo library;
 *   files   — the files folder (PDF, CSV, Excel, images).
 * Nothing is uploaded here: the chosen file is read in the browser and
 * handed to the screen as a PickedFile (images downscaled to a JPEG data
 * URL so a draft can hold them). A later stage sends it to the model.
 */
export type FileSource = 'camera' | 'photos' | 'files';

export interface PickedFile {
  name: string;
  type: string;
  size: number;
  /** Images: a JPEG data URL downscaled to fit `maxPx`; other files: null (Stage 7/8 read them server-side). */
  dataUrl: string | null;
}

export const ACCEPT: Record<FileSource, string> = {
  camera: 'image/*',
  photos: 'image/*',
  files:
    'image/*,.pdf,.csv,.xls,.xlsx,application/pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** 10 MB per file: a phone photo is 2–5 MB; a scanned PDF of old bills seldom more. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Read a chosen file for the draft. Images are drawn to a canvas no larger than `maxPx` and kept as JPEG. */
export async function readPicked(file: File, maxPx = 1600): Promise<PickedFile> {
  const base = { name: file.name, type: file.type, size: file.size, dataUrl: null as string | null };
  if (!file.type.startsWith('image/')) return base;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return base;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return { ...base, dataUrl: canvas.toDataURL('image/jpeg', 0.85) };
  } catch {
    return base;
  }
}

/** True on a phone or tablet, where the file input's `capture` opens the camera app; false on a laptop. */
export function hasOsCamera(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
}
/** True where the browser can show the live camera (a laptop with a webcam, a phone browser without `capture`). */
export function hasLiveCamera(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function';
}

/**
 * The hidden file input a screen opens with `doorRef.current?.click()`.
 * It stays in the DOM (so a test can set its files) and carries the guide id.
 * Files over the limit are reported through `onTooBig` and dropped.
 */
export function FileDoor({
  source,
  multiple,
  label,
  guide,
  doorRef,
  onPick,
  onTooBig,
}: {
  source: FileSource;
  multiple?: boolean;
  label: string;
  guide?: string;
  doorRef: RefObject<HTMLInputElement | null>;
  onPick: (files: File[]) => void;
  onTooBig?: (file: File) => void;
}) {
  return (
    <input
      ref={doorRef}
      type="file"
      accept={ACCEPT[source]}
      multiple={multiple}
      capture={source === 'camera' ? 'environment' : undefined}
      data-guide={guide}
      data-source={source}
      aria-label={label}
      className="eb-filedoor"
      onChange={(e) => {
        const all = Array.from(e.target.files ?? []);
        const ok = all.filter((f) => {
          if (f.size <= MAX_FILE_BYTES) return true;
          onTooBig?.(f);
          return false;
        });
        e.target.value = '';
        if (ok.length) onPick(ok);
      }}
    />
  );
}

/**
 * The live camera for a laptop (or a phone browser without `capture`):
 * asks the browser for the camera (its own permission prompt), shows the
 * preview, "Kheencho" takes a JPEG. A refusal shows the words and the
 * gallery door instead; nothing is retried behind the person's back.
 */
export function CameraSheet({
  open,
  onClose,
  onCapture,
  onFallback,
  labels,
}: {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
  onFallback: () => void;
  labels: { title: string; asking: string; denied: string; shoot: string; fallback: string; close: string };
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [state, setState] = useState<'asking' | 'streaming' | 'live' | 'denied'>('asking');
  // Each opening starts from "asking" (state adjusted during render, the React way, not in the effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setState('asking');
  }
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } }, audio: false })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = s;
        if (video.current) video.current.srcObject = s;
        setState('streaming'); // 'live' once the first frame is decoded, so "Kheencho" never shoots a blank
      })
      .catch(() => {
        if (!cancelled) setState('denied');
      });
    return () => {
      cancelled = true;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, [open]);
  const shoot = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d')?.drawImage(v, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) onCapture(new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.9,
    );
  };
  return (
    <Sheet open={open} title={labels.title} onClose={onClose} closeLabel={labels.close} guide="camera-live">
      <div className="eb-camera" data-state={state}>
        <video
          ref={video}
          className="eb-camera__video"
          autoPlay
          playsInline
          muted
          hidden={state === 'asking' || state === 'denied'}
          onLoadedData={() => setState((cur) => (cur === 'streaming' ? 'live' : cur))}
        />
        {state === 'asking' ? (
          <p className="eb-camera__note">
            <Icon name="camera" size={20} /> {labels.asking}
          </p>
        ) : null}
        {state === 'denied' ? <Meta>{labels.denied}</Meta> : null}
      </div>
      {state === 'live' ? (
        <AccentButton onClick={shoot} data-guide="shoot">
          {labels.shoot}
        </AccentButton>
      ) : null}
      {state === 'denied' ? <OutlineButton onClick={onFallback}>{labels.fallback}</OutlineButton> : null}
    </Sheet>
  );
}
