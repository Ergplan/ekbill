import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { LOCALES, copyKeys, sourceKey, t } from '../../packages/copy/src/index';
import { SCREENS } from '../../apps/web/screens/registry';
import { localTour } from '../../apps/web/screens/tour';

/**
 * Stage 9: every string a screen says goes through packages/copy. Each
 * literal key the code asks for is in the dictionary, in both registers;
 * a key built at run time ("team.role." + role) is checked by its known endings.
 */
const ROOT = join(__dirname, '..', '..');
function* files(dir: string): Generator<string> {
  for (const e of readdirSync(dir)) {
    if (['node_modules', '.next'].includes(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(ts|tsx)$/.test(e)) yield p;
  }
}
const keys = new Set(copyKeys());
const strings = JSON.parse(readFileSync(join(ROOT, 'design/copy/strings.json'), 'utf8')) as Record<
  string,
  Partial<Record<'hi-Latn' | 'en' | 'hi' | 'mr' | 'ta', string>>
>;

describe('the dictionary', () => {
  it('has every literal key the screens and actions use', () => {
    const missing: string[] = [];
    for (const dir of ['apps/web/screens', 'apps/web/app', 'apps/web/actions', 'packages/ui/src'])
      for (const f of files(join(ROOT, dir))) {
        const src = readFileSync(f, 'utf8');
        for (const m of src.matchAll(/\bt\(\s*'([a-z][a-zA-Z0-9.-]+)'/g))
          if (!keys.has(m[1]!)) missing.push(`${f.replace(ROOT, '')}: ${m[1]}`);
      }
    expect(missing).toEqual([]);
  });

  it('says every key in both registers, with the same placeholders', () => {
    const bad: string[] = [];
    for (const [k, v] of Object.entries(strings)) {
      if (k.startsWith('_')) continue;
      // The paper's words are English only, by design (the bill is formal English for every customer).
      if (k.startsWith('invoice.')) {
        if (!v.en?.trim()) bad.push(`${k}: empty`);
        continue;
      }
      if (!v['hi-Latn']?.trim() || !v.en?.trim()) bad.push(`${k}: empty`);
      const holes = (s: string) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort().join(',');
      if (holes(v['hi-Latn'] ?? '') !== holes(v.en ?? '')) bad.push(`${k}: placeholders differ`);
    }
    expect(bad).toEqual([]);
  });

  it('builds the run-time keys the screens compose', () => {
    for (const role of ['owner', 'staff', 'accountant']) expect(t(`team.role.${role}`)).not.toBe(`team.role.${role}`);
    for (const m of ['upi', 'cash', 'bank', 'cheque', 'other']) expect(t(`view.paid.${m}`)).not.toBe(`view.paid.${m}`);
    for (const c of ['not-a-draft', 'not-issued', 'series-inactive', 'series-kind', 'credit-note-exists', 'bad-lines'])
      expect(t(`bill.state.${c}`)).not.toBe(`bill.state.${c}`);
    for (const c of ['empty', 'too-big', 'not-a-photo', 'not-ready', 'final'])
      expect(t(`photo.error.${c}`)).not.toBe(`photo.error.${c}`);
    for (const c of ['owner', 'self']) expect(t(`team.error.${c}`)).not.toBe(`team.error.${c}`);
    for (const c of ['percent', 'instalments', 'running'])
      for (const p of ['title', 'sub']) expect(t(`help.choice.${c}.${p}`)).not.toBe(`help.choice.${c}.${p}`);
  });

  it('says every app key in all five languages, each in its own script', () => {
    const bad: string[] = [];
    const tamil = /[\u0B80-\u0BFF]/;
    const devanagari = /[\u0900-\u097F]/;
    for (const [k, v] of Object.entries(strings)) {
      if (k.startsWith('_') || k.startsWith('invoice.')) continue;
      for (const l of LOCALES) if (!v[l]?.trim()) bad.push(`${k}: no ${l}`);
      for (const l of ['hi-Latn', 'en', 'hi', 'mr'] as const)
        if (tamil.test(v[l] ?? '')) bad.push(`${k}: Tamil in ${l}`);
      for (const l of ['hi-Latn', 'en', 'ta'] as const)
        if (devanagari.test(v[l] ?? '')) bad.push(`${k}: Devanagari in ${l}`);
    }
    expect(bad).toEqual([]);
  });

  it("translates every screen's tour: each manifest line is a tour key's Hinglish, word for word", () => {
    const missing: string[] = [];
    for (const m of SCREENS)
      for (const s of m.tour) if (!sourceKey(s.say, `tour.${m.id}.`)) missing.push(`${m.id}/${s.target}: ${s.say}`);
    expect(missing).toEqual([]);
    const home = SCREENS.find((m) => m.id === 'home')!;
    expect(localTour(home.tour).map((s) => s.say)).toEqual(home.tour.map((s) => s.say));
    expect(sourceKey('Not a tour line', 'tour.')).toBeNull();
    expect(t(sourceKey(home.tour[0]!.say, 'tour.home.')!, undefined, 'ta')).toMatch(/[\u0B80-\u0BFF]/);
  });
});
