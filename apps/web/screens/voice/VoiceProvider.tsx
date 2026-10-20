'use client';

import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { t } from '@ekbill/copy';
import { GuideHighlight, type GuideStep } from '@ekbill/ui';

import { voiceAsk, voiceRemind, voiceStartBill, voiceWhoOwes } from '../../actions/voice';
import { saveBusinessDetail } from '../../actions/business';
import { announceBusinessDetail, writePrefill } from '../bill/prefill';
import { SCREENS } from '../registry';
import { localTour } from '../tour';
import type { ScreenManifest } from '../types';
import { fillItem, findItem, ownerOnly, snapshot, tapItem } from './dom';

/**
 * The voice for the whole app (Stage 9; the MVP's VoiceProvider, on v2):
 * one Realtime connection that survives moving between screens. It is also
 * the guide: when a screen opens it is told what is on it (the manifest's
 * purpose and the data-guide items, with the OWNER-ONLY ones marked), it
 * moves the same ring the tour uses, fills fields from what the owner says,
 * and presses only safe items (dom.ts). Commits stay the owner's tap.
 *
 * The session is minted by /api/voice/session. Under the build's stand-in
 * (fake: true) no connection opens; window.__ekbillVoice runs the same tools
 * so the journeys can drive them.
 */
type State = 'idle' | 'connecting' | 'live' | 'error';

export interface VoiceApi {
  /** A session can be minted here (a model and a key, or the stand-in). */
  available: boolean;
  state: State;
  note: string | null;
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

const VoiceContext = createContext<VoiceApi | null>(null);
export const useVoice = () => useContext(VoiceContext);

// The hint by the mic ("Main yahan hoon…"), once a session; the voice itself starts only on a tap (19 Oct).
const HINT_KEY = 'ekbill.voice.hint';
/** Silence this long after the voice has finished and nobody is speaking or tapping ends the session (cost). */
export const IDLE_MS = 3000;

const HREF: Record<string, string> = {
  home: '/',
  new_bill: '/bills/new',
  bills: '/bills',
  dues: '/dues',
  customers: '/customers',
  ask: '/poocho',
  help: '/help',
  you: '/aap',
  gst: '/gst',
  photo: '/bills/photo',
};

/**
 * The manifest of the screen at a path: static routes before ones with a
 * [param]. /bills/new is two screens: the customer picker, and the form once
 * a customer (or a new one) is chosen.
 */
export function manifestFor(pathname: string, search = ''): ScreenManifest | null {
  const ranked = [...SCREENS].sort((a, b) => (a.route.match(/\[/g)?.length ?? 0) - (b.route.match(/\[/g)?.length ?? 0));
  const matches = ranked.filter((m) => new RegExp(`^${m.route.replace(/\[[^\]]+\]/g, '[^/]+')}/?$`).test(pathname));
  if (matches.length > 1 && pathname === '/bills/new') {
    const q = new URLSearchParams(search);
    const form = q.has('customer') || q.get('new') === '1' || q.get('first') === '1';
    return matches.find((m) => m.id === (form ? 'bill' : 'bill-start')) ?? matches[0]!;
  }
  return matches[0] ?? null;
}

/** "[screen] …": what the model is told when a screen opens. */
export function describeScreen(pathname: string, reason: string): string {
  const m = manifestFor(pathname, window.location.search);
  const items = snapshot(document.querySelector('main') ?? document)
    .map(
      (i) =>
        `${i.id} | ${i.kind} | ${i.label}${i.value ? ` | value: ${i.value}` : ''}${i.ownerOnly ? ' | OWNER-ONLY' : ''}`,
    )
    .join('\n');
  return `[screen] ${m?.id ?? 'other'} (${reason}). ${m?.purpose ?? ''}\nItems (id | kind | label):\n${items || '(nothing on screen)'}`;
}

interface FakeHook {
  sent: unknown[];
  run: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

export function VoiceProvider({ available, children }: { available: boolean; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const [state, setState] = useState<State>('idle');
  const [note, setNote] = useState<string | null>(null);
  const [step, setStep] = useState<GuideStep | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const channel = useRef<RTCDataChannel | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const fake = useRef<FakeHook | null>(null);
  const openedByVoice = useRef<string | null>(null);
  const speaking = useRef('');
  const [hint, setHint] = useState(false);
  // What is going on in the conversation, for the idle timer: a reply being made, audio playing, a tool running,
  // the owner speaking. Silence is all four at rest.
  const responding = useRef(false);
  const playing = useRef(false);
  const tools = useRef(0);
  const listening = useRef(false);
  const idle = useRef<number | null>(null);
  const clearIdle = useCallback(() => {
    if (idle.current !== null) window.clearTimeout(idle.current);
    idle.current = null;
  }, []);

  const send = useCallback((event: unknown) => {
    if (fake.current) fake.current.sent.push(event);
    else if (channel.current?.readyState === 'open') channel.current.send(JSON.stringify(event));
  }, []);

  // Each start is one attempt; stop() ends the current one, and a start still awaiting (the session, the mic
  // prompt, OpenAI's answer) sees it ended and lets go of what it opened (Stage 9 review: a tap on stop while
  // connecting left the mic streaming once the connection came up).
  const attempt = useRef(0);
  const stop = useCallback(() => {
    attempt.current += 1;
    if (idle.current !== null) window.clearTimeout(idle.current);
    idle.current = null;
    responding.current = false;
    playing.current = false;
    tools.current = 0;
    listening.current = false;
    channel.current?.close();
    pc.current?.getSenders().forEach((s) => s.track?.stop());
    pc.current?.close();
    channel.current = null;
    pc.current = null;
    fake.current = null;
    delete (window as { __ekbillVoice?: FakeHook }).__ekbillVoice;
    delete document.documentElement.dataset.voice;
    setStep(null);
    setState('idle');
  }, []);
  useEffect(() => () => stop(), [stop]);
  const armIdle = useCallback(() => {
    clearIdle();
    if (responding.current || playing.current || tools.current > 0 || listening.current) return;
    idle.current = window.setTimeout(() => stop(), IDLE_MS);
  }, [clearIdle, stop]);

  const tellScreen = useCallback(
    (reason: string) =>
      send({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'system',
          content: [{ type: 'input_text', text: describeScreen(window.location.pathname, reason) }],
        },
      }),
    [send],
  );

  const navigate = useCallback(
    (href: string) => {
      openedByVoice.current = href.split('?')[0]!;
      router.push(href);
    },
    [router],
  );

  const light = useCallback((id: string, say: string) => {
    const el = findItem(id);
    if (!el) return false;
    // The ring goes round the data-guide section (a field inside one lights its section).
    setStep({ target: id.split('/')[0]!, say: say.slice(0, 200) });
    if (id.includes('/')) el.focus({ preventScroll: true });
    return true;
  }, []);

  const runTool = useCallback(
    async (name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> => {
      switch (name) {
        case 'who_owes':
          return voiceWhoOwes();
        case 'start_bill': {
          const r = await voiceStartBill({ customerName: String(args.customer_name ?? ''), lines: args.lines });
          if (r.ok && r.href) {
            writePrefill({ lines: r.lines ?? [] });
            // A kaccha bill (an estimate, 20 Oct): the same form, opened as one.
            navigate(args.kaccha === true ? `${r.href}${r.href.includes('?') ? '&' : '?'}kaccha=1` : r.href);
          }
          return { ok: r.ok, reply: r.reply };
        }
        case 'remind': {
          const r = await voiceRemind({ customerName: String(args.customer_name ?? '') });
          if (r.ok && r.href) navigate(r.href);
          return { ok: r.ok, reply: r.reply };
        }
        case 'ask_records':
          return voiceAsk({ question: String(args.question ?? '') });
        case 'go_to': {
          const href = HREF[String(args.screen ?? 'home')];
          if (!href) return { ok: false, reason: 'no such screen' };
          if (href === window.location.pathname) return { ok: true, note: 'already on this screen' };
          navigate(href);
          return { ok: true, note: 'opening; the screen list follows' };
        }
        case 'show':
          return { ok: light(String(args.item_id ?? ''), String(args.say ?? '')) };
        case 'fill': {
          const id = String(args.item_id ?? '');
          const r = fillItem(id, String(args.value ?? ''));
          if (r.ok) light(id, '');
          return r;
        }
        case 'tap': {
          const id = String(args.item_id ?? '');
          const el = findItem(id);
          if (el && ownerOnly(el)) {
            light(id, t('voice.ownerOnly'));
            return { ok: false, reason: 'owner-only: the owner taps this one; it is lit for them' };
          }
          return tapItem(id);
        }
        case 'update_business': {
          // Captured where the owner is (20 Oct): saved on the business, and the screen redrawn with it.
          const r = await saveBusinessDetail({
            field: String(args.field ?? ''),
            value: String(args.value ?? ''),
            scheme: args.scheme === 'composition' ? 'composition' : 'regular',
          }).catch(() => ({ ok: false as const, error: 'error.generic' }));
          if (!r.ok) return { ok: false, reason: t(r.error) };
          announceBusinessDetail(r.value.field);
          router.refresh();
          return { ok: true, saved: r.value.field, registration: r.value.registration };
        }
        case 'guide_steps': {
          const m = manifestFor(window.location.pathname, window.location.search);
          return { steps: localTour(m?.tour ?? []).filter((s) => findItem(s.target)) };
        }
        default:
          return { ok: false, reason: 'no such tool' };
      }
    },
    [light, navigate, router],
  );

  const onEvent = useCallback(
    async (raw: string) => {
      let ev: {
        type?: string;
        name?: string;
        call_id?: string;
        arguments?: string;
        delta?: string;
        transcript?: string;
        error?: { message?: string };
      };
      try {
        ev = JSON.parse(raw);
      } catch {
        return;
      }
      if (ev.type === 'input_audio_buffer.speech_started') {
        listening.current = true;
        clearIdle();
      } else if (ev.type === 'input_audio_buffer.speech_stopped') {
        listening.current = false;
      } else if (ev.type === 'response.created') {
        responding.current = true;
        clearIdle();
      } else if (ev.type === 'response.done') {
        responding.current = false;
        armIdle();
      } else if (ev.type === 'output_audio_buffer.started') {
        playing.current = true;
        clearIdle();
      } else if (ev.type === 'output_audio_buffer.stopped' || ev.type === 'output_audio_buffer.cleared') {
        playing.current = false;
        armIdle();
      }
      if (ev.type === 'response.output_audio_transcript.delta') {
        speaking.current += ev.delta ?? '';
      } else if (ev.type === 'response.output_audio_transcript.done') {
        speaking.current = '';
      } else if (ev.type === 'response.function_call_arguments.done') {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(ev.arguments ?? '{}') as Record<string, unknown>;
        } catch {
          // Not JSON: no arguments.
        }
        tools.current += 1;
        clearIdle();
        const output = await runTool(ev.name ?? '', args).finally(() => {
          tools.current -= 1;
        });
        send({
          type: 'conversation.item.create',
          item: { type: 'function_call_output', call_id: ev.call_id, output: JSON.stringify(output) },
        });
        send({ type: 'response.create' });
      } else if (ev.type === 'error') {
        // Cancelling a reply that had just ended is not a failure the owner needs to hear about.
        const code = (ev.error as { code?: string } | undefined)?.code ?? '';
        if (!/cancel/.test(code)) setNote(t('voice.failed'));
      }
    },
    [runTool, send, clearIdle, armIdle],
  );

  const start = useCallback(async () => {
    if (!available || state === 'connecting' || state === 'live') return;
    setNote(null);
    setState('connecting');
    const mine = ++attempt.current;
    const ended = () => attempt.current !== mine;
    try {
      const res = await fetch('/api/voice/session', { method: 'POST' });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        secret?: string;
        model?: string;
        baseUrl?: string;
        fake?: boolean;
      };
      if (ended()) return;
      if (!res.ok || !body.secret) {
        setNote(t(body.error ?? 'voice.failed'));
        setState('error');
        return;
      }
      if (body.fake) {
        const hook: FakeHook = { sent: [], run: runTool };
        fake.current = hook;
        (window as { __ekbillVoice?: FakeHook }).__ekbillVoice = hook;
        setState('live');
        document.documentElement.dataset.voice = 'live';
        tellScreen('start');
        return;
      }
      let mic: MediaStream;
      try {
        mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      } catch {
        setNote(t('voice.noMic'));
        setState('error');
        return;
      }
      if (ended()) {
        mic.getTracks().forEach((track) => track.stop());
        return;
      }
      const peer = new RTCPeerConnection();
      pc.current = peer;
      if (!audio.current) {
        audio.current = document.createElement('audio');
        audio.current.autoplay = true;
      }
      peer.ontrack = (e) => {
        if (!audio.current) return;
        audio.current.srcObject = e.streams[0] ?? null;
        audio.current.play().catch(() => setNote(t('voice.unmute')));
      };
      mic.getTracks().forEach((track) => peer.addTrack(track, mic));
      const dc = peer.createDataChannel('oai-events');
      channel.current = dc;
      dc.onmessage = (e) => void onEvent(String(e.data));
      dc.onopen = () => {
        setState('live');
        document.documentElement.dataset.voice = 'live';
        tellScreen('start');
        send({
          type: 'response.create',
          response: {
            instructions:
              "Greet the owner in at most five words in the language you speak (like 'Haan ji, boliye?') and wait. Do not describe the screen.",
          },
        });
      };
      dc.onclose = () => stop();
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      if (ended()) return;
      const answer = await fetch(`${body.baseUrl}/v1/realtime/calls?model=${encodeURIComponent(body.model ?? '')}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${body.secret}`, 'content-type': 'application/sdp' },
        body: offer.sdp,
      });
      if (ended()) return;
      if (!answer.ok) throw new Error('voice.failed');
      await peer.setRemoteDescription({ type: 'answer', sdp: await answer.text() });
    } catch {
      if (ended()) return;
      stop();
      setNote(t('voice.failed'));
      setState('error');
    }
  }, [available, state, runTool, onEvent, send, stop, tellScreen]);

  // While talking, a tap on a plain link inside the app moves within the page instead of loading a new one, which
  // would end the conversation (Stage 9 review: the owner opening a customer's bill from Home lost the voice).
  useEffect(() => {
    if (state !== 'live' && state !== 'connecting') return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]');
      if (!(a instanceof HTMLAnchorElement) || a.target || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname.startsWith('/api/')) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      router.push(`${url.pathname}${url.search}${url.hash}`);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [state, router]);

  // A new screen while talking. One the voice opened: carry on with the task. One the owner opened: the voice stops
  // mid-sentence and stays quiet, and is only told what is on the screen; tapping through screens quickly left it
  // talking about screens already gone (19 Oct).
  useEffect(() => {
    if (state !== 'live') return;
    const byVoice = openedByVoice.current === window.location.pathname;
    if (!byVoice) {
      if (responding.current) send({ type: 'response.cancel' });
      if (playing.current) send({ type: 'output_audio_buffer.clear' });
      setStep(null);
    }
    const id = window.setTimeout(() => {
      openedByVoice.current = null;
      setStep(null);
      tellScreen(byVoice ? 'opened-by-voice' : 'opened-by-owner');
      if (byVoice)
        send({
          type: 'response.create',
          response: {
            instructions:
              'The screen you opened is ready. Carry on with what the owner asked: show() the next thing to fill or tap and ask for it in one short question.',
          },
        });
    }, 900);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // The owner busy on the screen (tapping, typing) is not silence.
  useEffect(() => {
    if (state !== 'live') return;
    const busy = () => {
      if (idle.current !== null) armIdle();
    };
    document.addEventListener('pointerdown', busy);
    document.addEventListener('keydown', busy);
    return () => {
      document.removeEventListener('pointerdown', busy);
      document.removeEventListener('keydown', busy);
    };
  }, [state, armIdle]);

  // The voice never starts by itself (it did on arrival for anyone who had used it on the phone, 19 Oct). Once a
  // session, signed in, with "Bolke" on in Aap, a line by the mic says it is there; it goes on the first tap anywhere
  // or after eight seconds.
  useEffect(() => {
    if (!available) return;
    const id = window.setTimeout(() => {
      // Not over the app demo (20 Oct), which has its own voice.
      if (document.documentElement.dataset.bolke !== 'on' || document.documentElement.dataset.demo === 'on') return;
      try {
        if (sessionStorage.getItem(HINT_KEY)) return;
        sessionStorage.setItem(HINT_KEY, '1');
      } catch {
        return;
      }
      setHint(true);
    }, 1200);
    return () => window.clearTimeout(id);
  }, [available]);
  useEffect(() => {
    if (!hint) return;
    const off = () => setHint(false);
    const id = window.setTimeout(off, 8000);
    document.addEventListener('pointerdown', off, { once: true });
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('pointerdown', off);
    };
  }, [hint]);

  const api = useMemo<VoiceApi>(
    () => ({
      available,
      state,
      note,
      start: () => void start(),
      stop,
      toggle: () => (state === 'live' || state === 'connecting' ? stop() : void start()),
    }),
    [available, state, note, start, stop],
  );

  return (
    <VoiceContext.Provider value={api}>
      {children}
      {state === 'live' ? (
        <div className="eb-voice" role="status" data-testid="voice-live">
          <span>{t('voice.live')}</span>
          <button type="button" className="eb-voice__stop" onClick={stop} data-voice="owner">
            {t('voice.stop')}
          </button>
        </div>
      ) : note ? (
        <div className="eb-voice" role="status" data-testid="voice-note">
          <span>{note}</span>
        </div>
      ) : hint && state === 'idle' && document.documentElement.dataset.demo !== 'on' ? (
        <div className="eb-voice eb-voice--hint" role="status" data-testid="voice-hint">
          <span>{t('voice.hint')}</span>
        </div>
      ) : null}
      <GuideHighlight step={step} />
    </VoiceContext.Provider>
  );
}
