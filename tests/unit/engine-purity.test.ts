import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

import { computeTax } from '../../packages/engine/src/tax';

/**
 * I4: packages/engine is pure. eslint enforces the same rules on every
 * run; this test is the second lock, so a changed lint config cannot let
 * I/O or a clock into the engine unnoticed.
 */
const ROOT = join(__dirname, '..', '..', 'packages', 'engine');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (entry === 'node_modules' || entry === 'dist') continue;
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx|js|mjs)$/.test(entry)) out.push(p);
  }
  return out;
}

const FORBIDDEN: Array<[RegExp, string]> = [
  [/from\s+['"]node:/, 'Node built-in'],
  [/from\s+['"](fs|path|crypto|os|child_process|http|https|net)['"]/, 'Node built-in'],
  [/from\s+['"](pg|pg-boss|drizzle-orm|@ekbill\/db|@ekbill\/ai|openai)(\/|['"])/, 'database or model client'],
  [/from\s+['"](next|react|react-dom)(\/|['"])/, 'framework'],
  [/\bDate\.now\(/, 'the clock'],
  [/\bnew Date\(\s*\)/, 'the clock'],
  [/\bMath\.random\(/, 'randomness'],
  [/\bfetch\(/, 'the network'],
  [/\bprocess\.env\b/, 'the environment'],
  [/\brequire\(/, 'dynamic require'],
];

describe('engine purity (I4)', () => {
  const files = walk(ROOT);
  it('has source files to check', () => {
    expect(files.length).toBeGreaterThan(10);
  });
  it.each(files.map((f) => [relative(ROOT, f), f]))('%s reaches nothing outside the engine', (_name, file) => {
    // Comments may name the clock to say the engine has none; code may not.
    const source = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    for (const [re, what] of FORBIDDEN) {
      const m = re.exec(source);
      expect(m, `${relative(ROOT, file)} touches ${what}: ${m?.[0]}`).toBeNull();
    }
    // Every import is relative, a JSON rule file, or zod (the pack schema).
    for (const m of source.matchAll(/^import\s[^;]*?from\s+['"]([^'"]+)['"]/gm)) {
      const spec = m[1]!;
      expect(spec.startsWith('.') || spec === 'zod', `${relative(ROOT, file)} imports ${spec}`).toBe(true);
    }
  });
  it('gives the same answer twice for the same question', () => {
    const input = {
      lines: [{ description: 'A', quantityMilli: 3000, unitPricePaise: 33333, gstBp: 1800 }],
      registration: 'regular' as const,
      gstOn: true,
      dateIso: '2026-10-15',
      sellerStateCode: '27',
      customerStateCode: '27',
    };
    expect(computeTax(input)).toEqual(computeTax(input));
  });
});
