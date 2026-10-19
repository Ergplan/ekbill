'use client';

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react';

import { Icon } from './Icon';
import { alphaBounds, dataUrlBytes, nextScale } from './trim';

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
    // Screen coordinates on a fixed ring: page coordinates put it below the field whenever the page scrolled in a box
    // of its own or while a smooth scroll was still moving (19 Oct, the bill form's name field).
    const r = el.getBoundingClientRect();
    setBox({ top: r.top - 6, left: r.left - 6, width: r.width + 12, height: r.height + 12 });
  }, [step]);
  useLayoutEffect(() => {
    if (!step) return;
    const el = document.querySelector<HTMLElement>(`[data-guide="${CSS.escape(step.target)}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    // Placed every frame while the scroll into view settles, then on any scroll (of the page or of a box: capture)
    // and resize.
    let frame = 0;
    const until = performance.now() + 900;
    const follow = () => {
      place();
      if (performance.now() < until) frame = window.requestAnimationFrame(follow);
    };
    frame = window.requestAnimationFrame(follow);
    window.addEventListener('resize', place);
    document.addEventListener('scroll', place, { passive: true, capture: true });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', place);
      document.removeEventListener('scroll', place, { capture: true });
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
  // The steps whose thing is on the screen when the tour starts: a step of another state (setup's "hello" on its
  // later questions) is skipped, never waited on with nothing lit.
  const [run, setRun] = useState<{ list: GuideStep[]; at: number } | null>(null);
  const start = () => {
    const list = steps.filter((s) => document.querySelector(`[data-guide="${CSS.escape(s.target)}"]`));
    setRun(list.length ? { list, at: 0 } : null);
  };
  const next = () => setRun((r) => (!r || r.at + 1 >= r.list.length ? null : { ...r, at: r.at + 1 }));
  const stop = () => setRun(null);
  return { step: run ? (run.list[run.at] ?? null) : null, start, next, stop, running: run !== null };
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

/** The signature file cap (the engine's FILE_LIMITS.signature says the same number to the server). */
export const SIGNATURE_MAX_BYTES = 60 * 1024;

/**
 * The strokes only, with a small margin, as a transparent PNG data URL no
 * larger than the cap (scaled down by steps when a long signature is over
 * it); null when nothing was drawn.
 */
function trimmed(c: HTMLCanvasElement): string | null {
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const { width, height } = c;
  const box = alphaBounds(ctx.getImageData(0, 0, width, height).data, width, height);
  if (!box) return null;
  let scale: number | null = 1;
  while (scale !== null) {
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(box.width * scale));
    out.height = Math.max(1, Math.round(box.height * scale));
    const octx = out.getContext('2d');
    if (!octx) return null;
    octx.drawImage(c, box.x, box.y, box.width, box.height, 0, 0, out.width, out.height);
    const url = out.toDataURL('image/png');
    if (dataUrlBytes(url) <= SIGNATURE_MAX_BYTES) return url;
    scale = nextScale(scale);
  }
  return null;
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

/** The two looks in one tap, for the top bar: a sun on Narangi, a moon on Harmony (19 Oct: "colour modes top right"). */
export function ThemeToggle({ label, onChange }: { label: string; onChange?: (theme: ThemeName) => void }) {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, serverTheme);
  const next: ThemeName = theme === 'harmony' ? 'narangi' : 'harmony';
  return (
    <button
      type="button"
      className="eb-iconbtn"
      aria-label={label}
      aria-pressed={theme === 'harmony'}
      data-guide="theme-toggle"
      data-voice="safe"
      onClick={() => {
        persistTheme(next);
        onChange?.(next);
      }}
    >
      <Icon name={theme === 'harmony' ? 'moon' : 'sun'} size={20} />
    </button>
  );
}

// The hello plays once a page load: coming back to Home from another tab finds it already said.
let greeted = false;

/**
 * The hello on arrival (19 Oct: "Namaste Sharma ji, like an animation"): the words rise in one after another, the
 * name last and in the accent. Without a name ("Apne baare mein batao" has not been answered) it is the hello alone.
 * Reduced motion shows the line still.
 */
export function Greeting({ hello, name }: { hello: string; name?: string | null }) {
  const [play] = useState(() => !greeted);
  useEffect(() => {
    greeted = true;
  }, []);
  const words = hello.split(/\s+/).filter(Boolean);
  const named = name ? name.split(/\s+/).filter(Boolean) : [];
  const all = [...words.map((w) => ({ w, emph: false })), ...named.map((w) => ({ w, emph: true }))];
  // Real spaces between the words, so a screen reader and a copy say "Namaste, Sharma ji", not "Namaste,Sharmaji".
  return (
    <h1 className={`eb-display eb-greet${play ? ' eb-greet--play' : ''}`} data-testid="greeting">
      {all.map(({ w, emph }, i) => (
        <Fragment key={`${i}-${w}`}>
          {i > 0 ? ' ' : null}
          <span className={`eb-greet__w${emph ? ' eb-emph' : ''}`} style={{ '--eb-greet-i': i } as CSSProperties}>
            {w}
          </span>
        </Fragment>
      ))}
    </h1>
  );
}

export function Stack({ children, gap = 'stack' }: { children: ReactNode; gap?: 'stack' | 'row' }) {
  return <div className={`eb-stack eb-stack--${gap}`}>{children}</div>;
}
