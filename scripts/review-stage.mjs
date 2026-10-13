#!/usr/bin/env node
// The independent review (master prompt rule 12).
//
//   npm run review:stage -- N              # review stage N: stage-N-start..HEAD
//   npm run review:stage -- N --dry        # build the prompt, print its size, call nothing
//   npm run review:stage -- --check-model  # does OPENAI_REVIEW_MODEL resolve on the account?
//
// Exactly four inputs reach the model, in a fresh context: the stage diff,
// CLAUDE.md, the stage prompt (the fenced block for stage N in
// docs/MASTER-PROMPT.md) and docs/stages/stage-N-report.md. It answers the
// fixed checklist (a)–(f) and ends with one VERDICT line. The answer is
// written to docs/stages/stage-N-review-k.md. Keys come from .env or the
// environment and are never printed.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_DIFF_CHARS = 700_000;

export const CHECKLIST = `Answer this checklist and nothing else. Cite file and line for every point.
(a) Every invariant in CLAUDE.md (I1–I10) upheld, citing file and line, or the violation.
(b) Every server action and route handler added in this diff has a test; name each pair, or the one without.
(c) Every write to an authoritative table in this diff is audited; name each, or the one that is not.
(d) Generated documents (docs/FIELD-TRACE.md, docs/SCREEN-FLOW.md, tokens.ts/themes.css) regenerate without diff from their sources in this diff, or which one would not.
(e) Every screen touched renders in both themes from tokens only (var(--eb-…)); name any literal colour, radius, shadow or font.
(f) Any claim in the stage report that the code in the diff does not support; quote the claim.
Then list code defects you found that the checklist did not cover, each with file, line and the failing input.
End with exactly one line: "VERDICT: no new code defect" or "VERDICT: defects found".`;

/** .env at the repo root, parsed without printing anything. Environment wins. */
export function loadEnv(root = ROOT) {
  const file = join(root, '.env');
  const out = {};
  if (existsSync(file)) {
    for (const raw of readFileSync(file, 'utf8').split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      out[key] = value;
    }
  }
  return { ...out, ...process.env };
}

/** The fenced block under "### Stage N — …" in docs/MASTER-PROMPT.md. */
export function stagePrompt(markdown, stage) {
  const heading = new RegExp(`^### Stage ${stage} — [^\\n]*\\n`, 'm');
  const start = markdown.search(heading);
  if (start < 0) throw new Error(`docs/MASTER-PROMPT.md has no "### Stage ${stage} —" heading`);
  const rest = markdown.slice(start);
  const open = rest.indexOf('\n```');
  if (open < 0) throw new Error(`Stage ${stage} heading has no fenced block`);
  const afterOpen = rest.indexOf('\n', open + 1) + 1;
  // The block closes at the first line that is exactly ``` after the opening fence;
  // an inner "```" opening fence (as in Stage 0's block) is skipped by looking
  // for the fence that is followed by a blank line or a heading.
  const lines = rest.slice(afterOpen).split('\n');
  const body = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === '```') {
      const next = lines[i + 1] ?? '';
      if (next === '' || next.startsWith('#')) break;
      continue; // a nested fence: part of the prompt text
    }
    body.push(line);
  }
  return body.join('\n').trim();
}

export function stageDiff(stage, { root = ROOT, base } = {}) {
  const from = base ?? `stage-${stage}-start`;
  const args = [
    'diff',
    `${from}..HEAD`,
    '--',
    '.',
    ':(exclude)package-lock.json',
    ':(exclude)*.png',
    ':(exclude)*.woff2',
    ':(exclude)*.jpg',
    ':(exclude)design/screens/**',
  ];
  const diff = execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (diff.length > MAX_DIFF_CHARS) {
    return `${diff.slice(0, MAX_DIFF_CHARS)}\n\n[diff truncated at ${MAX_DIFF_CHARS} characters of ${diff.length}; the reviewer saw the first part only]\n`;
  }
  return diff;
}

/** The four inputs, each labelled, in one user message; the checklist is the system message. */
export function buildReviewPrompt({ stage, diff, claudeMd, prompt, report }) {
  const section = (title, body) => `\n\n===== ${title} =====\n${body.trim() || '(empty)'}\n`;
  return {
    system: `You are an independent reviewer of one build stage of EkBill, a Hinglish GST billing app. You have no access to the repository beyond the four inputs below and no memory of other stages. Be concrete and adversarial: a finding without a file and line is not a finding. ${CHECKLIST}`,
    user:
      `Stage ${stage}.` +
      section('INPUT 1: STAGE DIFF (git diff stage-start..HEAD)', diff) +
      section('INPUT 2: CLAUDE.md', claudeMd) +
      section('INPUT 3: STAGE PROMPT', prompt) +
      section('INPUT 4: STAGE REPORT (docs/stages/stage-N-report.md)', report),
  };
}

export function parseVerdict(text) {
  const m = text.match(/VERDICT:\s*(no new code defect|defects found)/i);
  if (!m) return 'unclear';
  return m[1].toLowerCase().startsWith('no') ? 'clean' : 'defects';
}

export function nextReviewPath(stage, root = ROOT) {
  const dir = join(root, 'docs', 'stages');
  mkdirSync(dir, { recursive: true });
  const taken = readdirSync(dir)
    .map((f) => f.match(new RegExp(`^stage-${stage}-review-(\\d+)\\.md$`)))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  const k = taken.length ? Math.max(...taken) + 1 : 1;
  return join(dir, `stage-${stage}-review-${k}.md`);
}

/** One call to the Responses API. Returns the model's text. */
export async function callOpenAI({ apiKey, model, baseUrl, system, user, fetchImpl = fetch }) {
  const res = await fetchImpl(`${baseUrl}/v1/responses`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      input: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) {
    const text = (await res.text()).slice(0, 500);
    throw new Error(`OpenAI responded ${res.status}: ${text.replace(/sk-[A-Za-z0-9_-]+/g, 'sk-…')}`);
  }
  const data = await res.json();
  if (typeof data.output_text === 'string' && data.output_text) return data.output_text;
  const parts = [];
  for (const item of data.output ?? []) {
    for (const c of item.content ?? []) if (typeof c.text === 'string') parts.push(c.text);
  }
  if (!parts.length) throw new Error('OpenAI returned no text');
  return parts.join('\n');
}

export async function listModels({ apiKey, baseUrl, fetchImpl = fetch }) {
  const res = await fetchImpl(`${baseUrl}/v1/models`, { headers: { authorization: `Bearer ${apiKey}` } });
  if (!res.ok) throw new Error(`OpenAI models list responded ${res.status}`);
  const data = await res.json();
  return (data.data ?? []).map((m) => m.id).sort();
}

/**
 * Review stage N. `call` is the model call (injected by the unit test).
 * Returns { path, verdict, text }.
 */
export async function reviewStage(
  stage,
  { root = ROOT, base, call = callOpenAI, env = loadEnv(root), dry = false } = {},
) {
  const masterPrompt = readFileSync(join(root, 'docs/MASTER-PROMPT.md'), 'utf8');
  const reportPath = join(root, 'docs', 'stages', `stage-${stage}-report.md`);
  if (!existsSync(reportPath))
    throw new Error(`${reportPath} does not exist; write the draft report and commit it first`);
  const inputs = {
    stage,
    diff: stageDiff(stage, { root, base }),
    claudeMd: readFileSync(join(root, 'CLAUDE.md'), 'utf8'),
    prompt: stagePrompt(masterPrompt, stage),
    report: readFileSync(reportPath, 'utf8'),
  };
  const { system, user } = buildReviewPrompt(inputs);
  if (dry) {
    return { path: null, verdict: 'dry', text: '', size: system.length + user.length, inputs };
  }
  const apiKey = env.OPENAI_REVIEW_API_KEY?.trim();
  const model = env.OPENAI_REVIEW_MODEL?.trim();
  if (!apiKey) throw new Error('OPENAI_REVIEW_API_KEY is not set (paste 3 of docs/MASTER-PROMPT.md)');
  if (!model) throw new Error('OPENAI_REVIEW_MODEL is not set (paste 3 of docs/MASTER-PROMPT.md)');
  const baseUrl = (env.OPENAI_BASE_URL ?? 'https://api.openai.com').replace(/\/$/, '');
  const text = await call({ apiKey, model, baseUrl, system, user });
  const verdict = parseVerdict(text);
  const path = nextReviewPath(stage, root);
  const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  writeFileSync(
    path,
    `# Stage ${stage} — independent review\n\n` +
      `- Reviewed commit: ${head}\n- Base: ${base ?? `stage-${stage}-start`}\n- Model: ${model}\n- At: ${new Date().toISOString()}\n- Verdict: ${verdict}\n\n---\n\n${text.trim()}\n`,
  );
  return { path, verdict, text };
}

async function main() {
  const args = process.argv.slice(2);
  const env = loadEnv();
  const baseUrl = (env.OPENAI_BASE_URL ?? 'https://api.openai.com').replace(/\/$/, '');
  if (args.includes('--check-model')) {
    const apiKey = env.OPENAI_REVIEW_API_KEY?.trim();
    const model = env.OPENAI_REVIEW_MODEL?.trim();
    if (!apiKey || !model) {
      console.error('blocked on .env: OPENAI_REVIEW_API_KEY and OPENAI_REVIEW_MODEL must both be set');
      process.exit(2);
    }
    const ids = await listModels({ apiKey, baseUrl });
    if (ids.includes(model)) {
      console.log(`OPENAI_REVIEW_MODEL resolves: ${model}`);
      return;
    }
    console.error(`blocked on OPENAI_REVIEW_MODEL: "${model}" is not in the account's models list. First 20 IDs:`);
    for (const id of ids.slice(0, 20)) console.error(`  ${id}`);
    process.exit(3);
  }
  const stage = Number(args.find((a) => /^\d+$/.test(a)));
  if (!Number.isInteger(stage)) {
    console.error('usage: npm run review:stage -- N [--dry] [--base REF] | --check-model');
    process.exit(2);
  }
  const baseIdx = args.indexOf('--base');
  const base = baseIdx >= 0 ? args[baseIdx + 1] : undefined;
  const result = await reviewStage(stage, { base, env, dry: args.includes('--dry') });
  if (result.verdict === 'dry') {
    console.log(
      `dry run: prompt is ${result.size} characters; diff ${result.inputs.diff.length}, CLAUDE.md ${result.inputs.claudeMd.length}, stage prompt ${result.inputs.prompt.length}, report ${result.inputs.report.length}`,
    );
    return;
  }
  console.log(`review written: ${result.path}`);
  console.log(`verdict: ${result.verdict}`);
  if (result.verdict !== 'clean') process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
