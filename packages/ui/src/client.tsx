'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';

/* --------------------------------------------------------- GuideHighlight --- */

export interface GuideStep {
  /** The data-guide id to light up. */
  target: string;
  /** The words, shown in the caption and spoken by the voice. */
  say: string;
}

/**
 * The glow ring and caption that the voice and the tour move from section to
 * section (rule 17). Positioned over the element with the matching
 * data-guide; scrolls it into view; follows resizes.
 */
export function GuideHighlight({ step, onDone }: { step: GuideStep | null; onDone?: () => void }) {
  const [box, setBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const place = useCallback(() => {
    if (!step) {
      setBox(null);
      return;
    }
    const el = document.querySelector<HTMLElement>(`[data-guide="${CSS.escape(step.target)}"]`);
    if (!el) {
      setBox(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setBox({
      top: r.top + window.scrollY - 6,
      left: r.left + window.scrollX - 6,
      width: r.width + 12,
      height: r.height + 12,
    });
  }, [step]);
  useLayoutEffect(() => {
    if (!step) return;
    const el = document.querySelector<HTMLElement>(`[data-guide="${CSS.escape(step.target)}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    // Placed on the next frame, and again once the scroll has settled.
    const frame = window.requestAnimationFrame(place);
    const id = window.setTimeout(place, 350);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(id);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place);
    };
  }, [step, place]);
  if (!step || !box) return null;
  return (
    <>
      <div className="eb-guide__ring" style={box} aria-hidden="true" />
      <div
        className="eb-guide__caption"
        role="status"
        style={{ top: box.top + box.height + 10, left: Math.max(12, box.left) }}
      >
        <span>{step.say}</span>
        {onDone ? (
          <button type="button" className="eb-guide__next" onClick={onDone}>
            →
          </button>
        ) : null}
      </div>
    </>
  );
}

/** Walks a list of steps with a next button; the voice drives the same component directly. */
export function useTour(steps: GuideStep[]) {
  const [at, setAt] = useState<number | null>(null);
  const start = () => setAt(0);
  const next = () => setAt((i) => (i === null || i + 1 >= steps.length ? null : i + 1));
  const stop = () => setAt(null);
  return { step: at === null ? null : (steps[at] ?? null), start, next, stop, running: at !== null };
}

/* ----------------------------------------------------------- SignaturePad --- */

/**
 * Draw with a finger or stylus. Exports a transparent PNG trimmed to the
 * strokes. "Phir se" clears; the parent decides when it is kept.
 */
export function SignaturePad({
  onChange,
  clearLabel,
  hint,
  height = 180,
}: {
  onChange: (dataUrl: string | null) => void;
  clearLabel: string;
  hint: ReactNode;
  height?: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.clientWidth * dpr;
    c.height = height * dpr;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = getComputedStyle(c).color;
  }, [height]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = e.currentTarget.getContext('2d');
    if (ctx) ctx.strokeStyle = getComputedStyle(e.currentTarget).color; // the theme at the moment of the stroke
    const p = pos(e);
    ctx?.beginPath();
    ctx?.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext('2d');
    const p = pos(e);
    ctx?.lineTo(p.x, p.y);
    ctx?.stroke();
    if (empty) setEmpty(false);
  };
  const up = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(trimmed(e.currentTarget));
  };
  const clear = () => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (c && ctx) ctx.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
    onChange(null);
  };

  return (
    <div className="eb-sigpad">
      <canvas
        ref={canvas}
        className="eb-sigpad__canvas"
        style={{ height }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        aria-label="Signature"
      />
      <div className="eb-sigpad__foot">
        <span className="eb-sigpad__hint">{hint}</span>
        <button type="button" className="eb-btn eb-btn--ghost eb-btn--small" onClick={clear} disabled={empty}>
          {clearLabel}
        </button>
      </div>
    </div>
  );
}

/** The strokes only, with a small margin, as a PNG data URL; null when nothing was drawn. */
function trimmed(c: HTMLCanvasElement): string | null {
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const { width, height } = c;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const pad = 8;
  const out = document.createElement('canvas');
  out.width = maxX - minX + 1 + pad * 2;
  out.height = maxY - minY + 1 + pad * 2;
  out
    .getContext('2d')
    ?.drawImage(c, minX, minY, maxX - minX + 1, maxY - minY + 1, pad, pad, maxX - minX + 1, maxY - minY + 1);
  return out.toDataURL('image/png');
}

/* -------------------------------------------------------- ConfidenceField --- */

/** A field read from a photo: coloured by how sure the model was; tap to fix. */
export function ConfidenceField({
  id,
  label,
  value,
  confidence,
  unreadable,
  onChange,
  numeric,
}: {
  id: string;
  label: ReactNode;
  value: string;
  confidence: number;
  unreadable?: boolean;
  onChange: (v: string) => void;
  numeric?: boolean;
}) {
  const level = unreadable ? 'none' : confidence >= 0.85 ? 'high' : confidence >= 0.6 ? 'mid' : 'low';
  return (
    <div className={`eb-field eb-conf eb-conf--${level}`}>
      <label className="eb-label" htmlFor={id}>
        {label}
        <span className="eb-conf__dot" aria-hidden="true" />
      </label>
      <input
        id={id}
        className={`eb-input${numeric ? ' eb-input--num eb-num' : ''}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={numeric ? 'decimal' : undefined}
        aria-describedby={`${id}-conf`}
      />
      <span id={`${id}-conf`} className="eb-conf__hint">
        {unreadable ? '—' : `${Math.round(confidence * 100)}%`}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------ ThemeSwitch --- */

type ThemeName = 'narangi' | 'harmony';

/** The theme on <html>, as a store React can subscribe to; the server always says narangi. */
function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}
const readTheme = (): ThemeName =>
  document.documentElement.getAttribute('data-theme') === 'harmony' ? 'harmony' : 'narangi';
const serverTheme = (): ThemeName => 'narangi';

/** The theme on <html>, live: follows the switch without a reload. */
export function useTheme(fallback: ThemeName = 'narangi'): ThemeName {
  return useSyncExternalStore(subscribeTheme, readTheme, () => fallback);
}

/** Set the theme for this page and remember it in the cookie the layout reads before paint (the user's row holds it too, Stage 2). */
function persistTheme(t: ThemeName) {
  document.documentElement.setAttribute('data-theme', t);
  try {
    document.cookie = `eb-theme=${t}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    // No cookie: the attribute still applies for this page.
  }
}

export function ThemeSwitch({
  labels,
  onChange,
}: {
  labels: { narangi: string; harmony: string; group: string };
  /** Called after the page switched, so the owner can persist it (Stage 2: on the user). */
  onChange?: (theme: ThemeName) => void;
}) {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, serverTheme);
  return (
    <div className="eb-seg" role="radiogroup" aria-label={labels.group}>
      {(['narangi', 'harmony'] as const).map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={theme === t}
          className="eb-seg__opt"
          onClick={() => {
            persistTheme(t);
            onChange?.(t);
          }}
        >
          <span className={`eb-swatch eb-swatch--${t}`} aria-hidden="true" />
          {labels[t]}
        </button>
      ))}
    </div>
  );
}

export function Stack({ children, gap = 'stack' }: { children: ReactNode; gap?: 'stack' | 'row' }) {
  return <div className={`eb-stack eb-stack--${gap}`}>{children}</div>;
}
