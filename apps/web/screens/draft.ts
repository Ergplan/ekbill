'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';

/**
 * The prototype's only memory: sessionStorage, per draft kind. Nothing
 * persists past the tab (Stage 1 prompt). Stage 4 onward write through
 * server actions instead; the screens keep calling these names.
 *
 * useDraft subscribes React to the stored value (an external store), so a
 * screen renders the saved draft after hydration without setting state in
 * an effect.
 */
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener('storage', cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', cb);
  };
}
function readRaw(key: string): string | null {
  try {
    return window.sessionStorage.getItem(`eb-${key}`);
  } catch {
    return null;
  }
}

export function readDraft<T>(key: string): T | null {
  const raw = readRaw(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
export function writeDraft<T>(key: string, value: T): void {
  try {
    if (value === null || value === undefined) window.sessionStorage.removeItem(`eb-${key}`);
    else window.sessionStorage.setItem(`eb-${key}`, JSON.stringify(value));
  } catch {
    // Private mode: the draft lives in React state only.
  }
  notify();
}
export function clearDraft(key: string): void {
  writeDraft(key, null);
}

/** [value, set]: the stored draft, or `initial` until one is written. `initial` must be referentially stable. */
export function useDraft<T>(key: string, initial: T): [T, (next: T | ((cur: T) => T)) => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(key),
    () => null,
  );
  const value = useMemo<T>(() => {
    if (!raw) return initial;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return initial;
    }
  }, [raw, initial]);
  const set = useCallback(
    (next: T | ((cur: T) => T)) => {
      const cur = readDraft<T>(key) ?? initial;
      writeDraft(key, typeof next === 'function' ? (next as (c: T) => T)(cur) : next);
    },
    [key, initial],
  );
  return [value, set];
}
