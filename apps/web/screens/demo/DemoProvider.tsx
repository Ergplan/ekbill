'use client';

import { usePathname, useRouter } from 'next/navigation';
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { LOCALES, LOCALE_NAMES, t, type Locale } from '@ekbill/copy';
import { FilterChips, GhostButton, GuideHighlight, PrimaryCTA, type GuideStep } from '@ekbill/ui';

import { markDemoSeen, setLanguage } from '../../actions/user';
import { switchLanguage } from '../aap/langSwitch';
import { fillItem } from '../voice/dom';
import { DEMO_END, DEMO_STEPS, type DemoStep } from './script';

/**
 * The app demo (20 Oct): lives above the screens (the root layout), like the voice, so one run walks several
 * screens. A first-timer is offered it on Home after sign-in ("Namaste, EkBill mein aapka swagat hai. Ek chhota sa
 * app tour chalega?" Haan / Na); Haan asks the language, then about 45 seconds across the sample business, each line
 * spoken (OpenAI's recording, made once and kept; else the caption alone, never the phone's own voice) and its place lit. "Demo band karo"
 * stops it anywhere and goes Home. Someone already billing starts it from Aap or a "naya kya hai" card; a visitor
 * from the welcome screen. It never touches the viewer's own records: every screen is the ?as=owner look.
 */
type Phase = 'idle' | 'intro' | 'lang' | 'playing';
type Ending = keyof typeof DEMO_END;

interface DemoApi {
  phase: Phase;
  /** Offer the demo to a first-timer: the greeting and Haan / Na. */
  offer: () => void;
  /** Start from a button (Aap, the card, the welcome screen): the language, then the walk. */
  start: (opts: { firstTime: boolean; visitor?: boolean }) => void;
  stop: () => void;
}

const DemoContext = createContext<DemoApi | null>(null);
export function useDemo(): DemoApi | null {
  return use(DemoContext);
}

const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

/** Until the screen has the item the ring is to light (a navigation's new screen), or `ms` have gone. */
async function present(target: string, ms = 5000): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (document.querySelector(`[data-guide="${CSS.escape(target)}"]`)) return true;
    await wait(80);
  }
  return false;
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>('idle');
  const [locale, setLocale] = useState<Locale>('hi-Latn');
  const [step, setStep] = useState<GuideStep | null>(null);
  const [index, setIndex] = useState(0);
  const mode = useRef<{ firstTime: boolean; visitor: boolean }>({ firstTime: false, visitor: false });
  // Each run has a number; a stop or a new run makes the old one's awaits give up.
  const run = useRef(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const skip = useRef<(() => void) | null>(null);
  // No recordings here (the build, no key): stop asking after the first miss.
  const noRecordings = useRef(false);

  const hush = useCallback(() => {
    audio.current?.pause();
    audio.current = null;
    skip.current?.();
    skip.current = null;
  }, []);

  /**
   * Speaks one line: the recording (OpenAI's voice, made once and kept), else time to read the caption. Never the
   * phone's own voice (20 Oct, the operator: "in demo some weird voice is there"). Resolves when done.
   */
  const say = useCallback(async (key: string, lang: Locale, mine: number): Promise<void> => {
    const text = t(key, undefined, lang);
    const skipped = new Promise<void>((r) => (skip.current = r));
    const reading = wait(Math.max(3500, text.split(/\s+/).length * 420));
    const spoken = (async () => {
      if (!noRecordings.current) {
        const a = new Audio(`/api/demo/audio?locale=${encodeURIComponent(lang)}&line=${encodeURIComponent(key)}`);
        audio.current = a;
        const ok = await new Promise<boolean>((resolve) => {
          a.addEventListener('ended', () => resolve(true), { once: true });
          a.addEventListener('error', () => resolve(false), { once: true });
          a.play().catch(() => resolve(false));
        });
        if (ok) return;
        if (a.error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) noRecordings.current = true;
      }
      if (run.current !== mine) return;
      await reading;
    })();
    await Promise.race([spoken, skipped]);
    skip.current = null;
  }, []);

  const showAt = useCallback(
    async (s: DemoStep, lang: Locale, mine: number) => {
      const here = `${window.location.pathname}${window.location.search}`;
      if (here !== s.path) router.push(s.path);
      await present(s.target);
      if (run.current !== mine) return;
      setStep({ target: s.target, say: t(s.key, undefined, lang) });
      const timers = (s.fill ?? []).map((f) => window.setTimeout(() => fillItem(f.item, f.value), f.afterMs));
      await say(s.key, lang, mine);
      timers.forEach((id) => window.clearTimeout(id));
    },
    [router, say],
  );

  const finish = useCallback(async () => {
    run.current += 1;
    hush();
    setStep(null);
    setPhase('idle');
    delete document.documentElement.dataset.demo;
  }, [hush]);

  const stop = useCallback(() => {
    void finish();
    router.push(mode.current.visitor ? '/welcome' : '/');
  }, [finish, router]);

  const play = useCallback(
    async (lang: Locale) => {
      const mine = ++run.current;
      setPhase('playing');
      document.documentElement.dataset.demo = 'on';
      for (let i = 0; i < DEMO_STEPS.length; i++) {
        if (run.current !== mine) return;
        setIndex(i);
        await showAt(DEMO_STEPS[i]!, lang, mine);
        if (run.current !== mine) return;
        await wait(300);
      }
      if (run.current !== mine) return;
      // The end: a first-timer at "Apne baare mein batao", lit until they tap it; someone billing at the star.
      const ending: Ending = mode.current.visitor ? 'visitor' : mode.current.firstTime ? 'first' : 'again';
      const end = DEMO_END[ending];
      setIndex(DEMO_STEPS.length);
      await showAt({ ...end }, lang, mine);
      if (run.current !== mine) return;
      setPhase('idle');
      delete document.documentElement.dataset.demo;
    },
    [showAt],
  );

  const begin = useCallback(
    async (lang: Locale) => {
      hush();
      setLocale(lang);
      // A first-timer's choice is their language too (their first): the app changes to it, then the walk begins.
      const current = document.documentElement.dataset.locale as Locale | undefined;
      if (mode.current.firstTime && lang !== current) {
        await switchLanguage(
          lang,
          async () => (await setLanguage({ language: lang }).catch(() => ({ ok: false }))).ok,
          () => router.refresh(),
        );
      }
      await play(lang);
    },
    [hush, play, router],
  );

  const offer = useCallback(() => {
    mode.current = { firstTime: true, visitor: false };
    const lang = (document.documentElement.dataset.locale as Locale | undefined) ?? 'hi-Latn';
    setLocale(lang);
    setPhase('intro');
    const mine = ++run.current;
    void say('demo.intro', lang, mine);
  }, [say]);

  const start = useCallback((opts: { firstTime: boolean; visitor?: boolean }) => {
    mode.current = { firstTime: opts.firstTime, visitor: opts.visitor ?? false };
    setLocale((document.documentElement.dataset.locale as Locale | undefined) ?? 'hi-Latn');
    setPhase('lang');
    // Seen: it is not offered again (a "naya kya hai" card, a first-timer's greeting).
    void markDemoSeen().catch(() => undefined);
  }, []);

  const answer = useCallback(
    (yes: boolean) => {
      hush();
      void markDemoSeen().catch(() => undefined);
      if (!yes) {
        setPhase('idle');
        return;
      }
      setPhase('lang');
      const mine = ++run.current;
      void say('demo.lang', locale, mine);
    },
    [hush, locale, say],
  );

  // Leaving for sign-in or setup stops a run; after the end, moving on puts the last ring away. A tab or link the
  // owner taps during a run is not stopped: the ring follows the script.
  useEffect(() => {
    const leaving = phase === 'playing' && (pathname.startsWith('/login') || pathname.startsWith('/setup'));
    const stale =
      phase === 'idle' && step !== null && !document.querySelector(`[data-guide="${CSS.escape(step.target)}"]`);
    if (!leaving && !stale) return;
    const id = window.setTimeout(() => (leaving ? void finish() : setStep(null)), 0);
    return () => window.clearTimeout(id);
  }, [pathname, phase, step, finish]);

  useEffect(() => () => hush(), [hush]);

  const api = useMemo<DemoApi>(() => ({ phase, offer, start, stop }), [phase, offer, start, stop]);
  const total = DEMO_STEPS.length;

  return (
    <DemoContext value={api}>
      {children}
      {phase === 'intro' || phase === 'lang' ? (
        <div
          className="eb-demo"
          role="dialog"
          aria-modal="true"
          aria-labelledby="eb-demo-title"
          data-testid="demo-dialog"
        >
          <div className="eb-demo__card">
            {phase === 'intro' ? (
              <>
                <p className="eb-demo__hello" id="eb-demo-title">
                  {t('demo.intro', undefined, locale)}
                </p>
                <div className="eb-demo__answers">
                  <PrimaryCTA onClick={() => answer(true)} data-testid="demo-yes">
                    {t('demo.yes')}
                  </PrimaryCTA>
                  <GhostButton onClick={() => answer(false)} data-testid="demo-no">
                    {t('demo.no')}
                  </GhostButton>
                </div>
              </>
            ) : (
              <>
                <p className="eb-demo__hello" id="eb-demo-title">
                  {t('demo.lang', undefined, locale)}
                </p>
                <FilterChips<Locale>
                  label={t('demo.lang', undefined, locale)}
                  value={locale}
                  onChange={setLocale}
                  options={LOCALES.map((l) => ({ value: l, label: LOCALE_NAMES[l] }))}
                />
                <div className="eb-demo__answers">
                  <PrimaryCTA onClick={() => void begin(locale)} data-testid="demo-start">
                    {t('demo.start', undefined, locale)}
                  </PrimaryCTA>
                  <GhostButton
                    onClick={() => {
                      hush();
                      setPhase('idle');
                    }}
                  >
                    {t('demo.no', undefined, locale)}
                  </GhostButton>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
      {phase === 'playing' ? (
        <div className="eb-demo-bar" data-testid="demo-bar">
          <span className="eb-demo-bar__label">
            {t('demo.label', { n: Math.min(index + 1, total), total }, locale)}
            <span className="eb-demo-bar__sample">{t('demo.sample', undefined, locale)}</span>
          </span>
          <button type="button" className="eb-demo-bar__stop" onClick={stop} data-testid="demo-stop">
            {t('demo.stop', undefined, locale)}
          </button>
        </div>
      ) : null}
      {step ? (
        <GuideHighlight
          step={step}
          onDone={() => {
            // The arrow on the caption moves on; at the end it puts the ring away.
            if (phase === 'playing') skip.current?.();
            else setStep(null);
          }}
        />
      ) : null}
    </DemoContext>
  );
}
