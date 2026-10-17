'use client';

import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { t } from '@ekbill/copy';
import { GuideHighlight, type GuideStep } from '@ekbill/ui';

import { voiceAsk, voiceRemind, voiceStartBill, voiceWhoOwes } from '../../actions/voice';
import { writePrefill } from '../bill/prefill';
import { SCREENS } from '../registry';
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

const AUTO_KEY = 'ekbill.voice.auto';

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

function store(key: string, value?: string): string | null {
  try {
    if (value !== undefined) localStorage.setItem(key, value);
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

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
            navigate(r.href);
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
        case 'guide_steps': {
          const m = manifestFor(window.location.pathname, window.location.search);
          return { steps: (m?.tour ?? []).filter((s) => findItem(s.target)) };
        }
        default:
          return { ok: false, reason: 'no such tool' };
      }
    },
    [light, navigate],
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
        const output = await runTool(ev.name ?? '', args);
        send({
          type: 'conversation.item.create',
          item: { type: 'function_call_output', call_id: ev.call_id, output: JSON.stringify(output) },
        });
        send({ type: 'response.create' });
      } else if (ev.type === 'error') {
        setNote(t('voice.failed'));
      }
    },
    [runTool, send],
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
      store(AUTO_KEY, 'on');
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
              'Greet the owner in a few words, say in one sentence what this screen is for, and show() the first useful thing.',
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

  // A new screen while talking: tell the model what is on it, and carry on.
  useEffect(() => {
    if (state !== 'live') return;
    const id = window.setTimeout(() => {
      setStep(null);
      const byVoice = openedByVoice.current === window.location.pathname;
      openedByVoice.current = null;
      tellScreen(byVoice ? 'opened-by-voice' : 'opened-by-owner');
      send({
        type: 'response.create',
        response: {
          instructions: byVoice
            ? 'The screen you opened is ready. Carry on with what the owner asked: show() the next thing to fill or tap and ask for it in one short question.'
            : 'The owner opened this screen. In one short sentence say what they can do here and show() the first useful thing.',
        },
      });
    }, 900);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // "Bolke" on arrival: an owner who switched voice on and used it on this phone before starts talking at once.
  // Never in a browser driven by tests (the journeys start it with the mic).
  useEffect(() => {
    if (!available || navigator.webdriver) return;
    const on = document.documentElement.dataset.bolke === 'on';
    if (!on || store(AUTO_KEY) !== 'on') return;
    const id = window.setTimeout(() => void start(), 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      ) : null}
      <GuideHighlight step={step} />
    </VoiceContext.Provider>
  );
}
