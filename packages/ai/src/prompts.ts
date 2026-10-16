import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** prompts/<name>/v<N>.md, beside src/ (rule 9: a prompt is a versioned file, never a string in code). */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts');

export function loadPrompt(name: string, version: number): string {
  if (!/^[a-z0-9-]+$/.test(name) || !Number.isInteger(version) || version < 1) throw new Error('bad prompt name');
  return readFileSync(join(ROOT, name, `v${version}.md`), 'utf8');
}
