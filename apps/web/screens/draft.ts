'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';

/**
 * The prototype's only memory. Values live in a module-level map and, when
 * the browser allows it, in sessionStorage so a reload mid-bill keeps the
 * draft. With storage blocked (private mode, a strict browser) the map
 * alone serves, so typing still works. Nothing persists past the tab
 * (Stage 1 prompt). Stage 4 onward write through server actions behind
 * the same names. Keys are namespaced by the caller (person id) so a draft
 * never shows up for another business after /dev/switch.
 */
const memory = new Map<string, string>();
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
  const inMemory = memory.get(key);
  if (inMemory !== undefined) return inMemory;
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
  const raw = value === null || value === undefined ? null : JSON.stringify(value);
  if (raw === null) memory.delete(key);
  else memory.set(key, raw);
  try {
    if (raw === null) window.sessionStorage.removeItem(`eb-${key}`);
    else window.sessionStorage.setItem(`eb-${key}`, raw);
  } catch {
    // Storage refused: the in-memory value above still serves this tab.
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
